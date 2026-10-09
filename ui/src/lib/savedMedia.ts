/**
 * Post photos and videos kept on the phone by their file name.
 *
 * Supabase hands out a new signed link for the same file every time it is asked, and the phone
 * caches by link, so every app open downloaded every photo again (2026-10-08: 25 GB sent for 36 MB
 * of photos, over the free plan's 5 GB). A file's path never changes, so each one is now
 * downloaded once per phone.
 *
 * The server still decides what is seen: a saved copy is only shown for a path the server has
 * just given a link for, so locked, deleted and private posts stay hidden. Copies of a deleted
 * post go with it, and signing out removes them all (owner, 2026-10-08).
 */
import * as FileSystem from 'expo-file-system/legacy';

const DIR = `${FileSystem.cacheDirectory}media/`;

/** File names saved in DIR; null until read from the phone. */
let saved: Set<string> | null = null;
const downloading = new Set<string>();

const fileName = (path: string) => path.replace(/[^A-Za-z0-9._-]/g, '_');

async function savedFiles(): Promise<Set<string>> {
  if (saved) return saved;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    saved = new Set(await FileSystem.readDirectoryAsync(DIR));
  } catch {
    saved = new Set();
  }
  return saved;
}

// One copy downloads at a time, in the order asked (feed order): a feed read used to start every
// new file at once — 40 photos of 3–4 MB sharing the line with the two on screen, which stayed
// blank while the feed came in (OTA 13.39, 2026-10-09).
let queue: Promise<void> = Promise.resolve();

function save(name: string, url: string, into: Set<string>): void {
  if (downloading.has(name)) return;
  downloading.add(name);
  queue = queue.then(() => download(name, url, into));
}

async function download(name: string, url: string, into: Set<string>): Promise<void> {
  const part = `${DIR}${name}.part`;
  try {
    const { status } = await FileSystem.downloadAsync(url, part);
    if (status !== 200) throw new Error(`status ${status}`);
    await FileSystem.moveAsync({ from: part, to: `${DIR}${name}` });
    into.add(name);
  } catch {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
  } finally {
    downloading.delete(name);
  }
}

/**
 * The address to show each path from: its copy on the phone when saved, else the server's link
 * (and a copy is saved for next time). Only paths in `urls` come back.
 */
export async function withSavedMedia(urls: Map<string, string>): Promise<Map<string, string>> {
  const files = await savedFiles();
  const shown = new Map<string, string>();
  for (const [path, url] of urls) {
    const name = fileName(path);
    if (files.has(name)) {
      shown.set(path, `${DIR}${name}`);
    } else {
      shown.set(path, url);
      save(name, url, files);
    }
  }
  return shown;
}

/** Remove the saved copies of these paths (a deleted post). */
export async function forgetSavedMedia(paths: string[]): Promise<void> {
  for (const path of paths) {
    const name = fileName(path);
    saved?.delete(name);
    await FileSystem.deleteAsync(`${DIR}${name}`, { idempotent: true }).catch(() => {});
  }
}

/** Remove every saved copy (sign-out). */
export async function clearSavedMedia(): Promise<void> {
  saved = null;
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => {});
}
