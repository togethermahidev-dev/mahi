/**
 * Post photos are kept on the phone by their file name, so each one downloads once instead of
 * every time Supabase hands out a new link (2026-10-08: 25 GB sent for 36 MB of photos). A saved
 * copy is only shown for a link the server just gave, so the server still decides what is seen.
 */
const files = new Map<string, string>();
let downloadStatus = 200;
let readFails = false;
const downloads: string[] = [];

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: async () => {},
  readDirectoryAsync: async (dir: string) => {
    if (readFails) throw new Error('no folder');
    return [...files.keys()]
      .filter((f) => f.startsWith(dir))
      .map((f) => f.slice(dir.length));
  },
  downloadAsync: async (url: string, to: string) => {
    downloads.push(url);
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
