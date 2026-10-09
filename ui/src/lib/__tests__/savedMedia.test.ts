/**
 * Post photos are kept on the phone by their file name, so each one downloads once instead of
 * every time Supabase hands out a new link (2026-10-08: 25 GB sent for 36 MB of photos). A saved
 * copy is only shown for a link the server just gave, so the server still decides what is seen.
 */
const files = new Map<string, string>();
let downloadStatus = 200;
let readFails = false;
const downloads: string[] = [];
// Set to hold each download open until the test lets it finish.
let hold = false;
const held: (() => void)[] = [];

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: async () => {},
  readDirectoryAsync: async (dir: string) => {
    if (readFails) throw new Error('no folder');
    return [...files.keys()].filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length));
  },
  downloadAsync: async (url: string, to: string) => {
    downloads.push(url);
    if (hold) await new Promise<void>((r) => held.push(r));
    files.set(to, url);
    return { status: downloadStatus, uri: to };
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    files.set(to, files.get(from)!);
    files.delete(from);
  },
  deleteAsync: async (target: string) => {
    for (const f of [...files.keys()]) if (f.startsWith(target)) files.delete(f);
  },
}));

import { clearSavedMedia, forgetSavedMedia, withSavedMedia } from '@/lib/savedMedia';

const DIR = 'file:///cache/media/';
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await clearSavedMedia();
  files.clear();
  downloads.length = 0;
  downloadStatus = 200;
  readFails = false;
  hold = false;
  held.length = 0;
});

it('a photo not on the phone yet: shows the link and saves a copy for next time', async () => {
  const urls = await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  expect(urls.get('u1/a_rear.jpg')).toBe('https://x/sign/a?token=1');
  await flush();
  expect(downloads).toEqual(['https://x/sign/a?token=1']);
  expect(files.has(`${DIR}u1_a_rear.jpg`)).toBe(true);
});

it('a saved photo: shows the copy on the phone, whatever the new link is, and downloads nothing', async () => {
  await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  await flush();
  downloads.length = 0;
  const urls = await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=2']]));
  expect(urls.get('u1/a_rear.jpg')).toBe(`${DIR}u1_a_rear.jpg`);
  await flush();
  expect(downloads).toEqual([]);
});

it('a photo the server no longer gives a link for is not shown from the phone', async () => {
  await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  await flush();
  const urls = await withSavedMedia(new Map());
  expect(urls.has('u1/a_rear.jpg')).toBe(false);
});

it('a refused download is not kept', async () => {
  downloadStatus = 403;
  await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  await flush();
  expect([...files.keys()]).toEqual([]);
  const urls = await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=2']]));
  expect(urls.get('u1/a_rear.jpg')).toBe('https://x/sign/a?token=2');
});

it('a deleted post: its saved copy goes', async () => {
  await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  await flush();
  await forgetSavedMedia(['u1/a_rear.jpg']);
  expect(files.has(`${DIR}u1_a_rear.jpg`)).toBe(false);
  const urls = await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=2']]));
  expect(urls.get('u1/a_rear.jpg')).toBe('https://x/sign/a?token=2');
});

it('signing out removes every saved copy', async () => {
  await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  await flush();
  await clearSavedMedia();
  expect([...files.keys()]).toEqual([]);
});

it('a phone that cannot read its folder still shows the links', async () => {
  readFails = true;
  const urls = await withSavedMedia(new Map([['u1/a_rear.jpg', 'https://x/sign/a?token=1']]));
  expect(urls.get('u1/a_rear.jpg')).toBe('https://x/sign/a?token=1');
});

// 2026-10-09 (OTA 13.39, the first post's photo and small photo black while the feed came in):
// every new photo of a feed read was downloaded to the phone at once — 40 files of 3–4 MB sharing
// the line with the two photos actually on screen. Copies are saved one at a time, in feed order.
it('saves copies one at a time, in feed order, so the photos on screen are not starved', async () => {
  hold = true;
  await withSavedMedia(
    new Map([
      ['u1/a_rear.jpg', 'https://x/a'],
      ['u1/a_front.jpg', 'https://x/b'],
      ['u2/c_rear.jpg', 'https://x/c'],
    ])
  );
  await flush();
  expect(downloads).toEqual(['https://x/a']);
  held.shift()!();
  await flush();
  await flush();
  expect(downloads).toEqual(['https://x/a', 'https://x/b']);
  held.shift()!();
  await flush();
  await flush();
  expect(downloads).toEqual(['https://x/a', 'https://x/b', 'https://x/c']);
  held.shift()!();
  await flush();
  await flush();
  expect(files.has(`${DIR}u2_c_rear.jpg`)).toBe(true);
});
