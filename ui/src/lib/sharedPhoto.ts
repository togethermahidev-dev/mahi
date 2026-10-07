/**
 * Share a photo from Photos to Mahi (build 13+, switch `share-to-mahi`). Picking Mahi in the share
 * sheet ("Post to Mahi") copies the one or two photos into the App Group and opens
 * `mahi://dataUrl=mahiShareKey…`; the app reads them (src/hooks/useSharedPhotos.ts), and the
 * Camera page puts them in as the shots. Nothing is kept: the copies are deleted as soon as they
 * are read, and the App Group entry is cleared.
 *
 * Pure: which link is a share, which shares are 1–2 photos, and whether a huge photo is brought
 * down to the camera's own size. Tested in src/lib/__tests__/sharedPhoto.test.ts.
 */

/** expo-share-intent's key in the App Group for scheme `mahi`. */
export const SHARE_KEY = 'mahiShareKey';

/** A post is two shots: one or two shared photos fill them. */
export const MAX_SHARED_PHOTOS = 2;

/** The long edge of a 12 MP camera photo: a bigger shared photo is brought down to it. */
export const SHARED_PHOTO_MAX_EDGE = 4032;

const SHARE_LINK = /^mahi:\/\/dataUrl=/i;

/** True for the link the share extension opens Mahi with. */
export function isShareLink(url: string | null | undefined): boolean {
  return !!url && SHARE_LINK.test(url.trim());
}

/** A shared photo, ready for the camera's preview. */
export interface SharedPhoto {
  uri: string;
  width: number | null;
  height: number | null;
}

export type SharedPhotosVerdict =
  { ok: true; photos: SharedPhoto[] } | { ok: false; reason: 'none' | 'not-photo' | 'too-many' };

interface RawFile {
  path?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  width?: number | string | null;
  height?: number | string | null;
}

/** The files in what the native module sent (a JSON string on iPhone, an object on Android). */
function rawFiles(raw: unknown): RawFile[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const files = (value as { files?: unknown } | null)?.files;
  return Array.isArray(files)
    ? files.filter((f): f is RawFile => !!f && typeof f === 'object')
    : [];
}

function fileUri(f: RawFile): string | null {
  const path = f.path || f.filePath;
  if (!path) return null;
  return path.startsWith('/') ? `file://${path}` : path;
}

function size(v: number | string | null | undefined): number | null {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** One or two photos to post, or why not. */
export function sharedPhotos(raw: unknown): SharedPhotosVerdict {
  const files = rawFiles(raw).filter((f) => fileUri(f) !== null);
  if (files.length === 0) return { ok: false, reason: 'none' };
  if (files.some((f) => !f.mimeType?.toLowerCase().startsWith('image/'))) {
    return { ok: false, reason: 'not-photo' };
  }
  if (files.length > MAX_SHARED_PHOTOS) return { ok: false, reason: 'too-many' };
  return {
    ok: true,
    photos: files.map((f) => ({
      uri: fileUri(f) as string,
      width: size(f.width),
      height: size(f.height),
    })),
  };
}

/** Every file the share extension copied, so each can be deleted once read. */
export function sharedFilePaths(raw: unknown): string[] {
  return rawFiles(raw)
    .map(fileUri)
    .filter((u): u is string => u !== null);
}

/** What to tell someone whose share can't be posted (null: nothing was shared). */
export function sharedPhotoProblem(reason: 'none' | 'not-photo' | 'too-many'): string | null {
  if (reason === 'none') return null;
  return 'Share one or two photos to post them on Mahi.';
}

/** expo-image-manipulator actions that bring a huge photo down to the camera's size (or none). */
export function sharedPhotoResize(
  width: number | null,
  height: number | null
): { resize: { width?: number; height?: number } }[] {
  if (!width || !height || Math.max(width, height) <= SHARED_PHOTO_MAX_EDGE) return [];
  return height >= width
    ? [{ resize: { height: SHARED_PHOTO_MAX_EDGE } }]
    : [{ resize: { width: SHARED_PHOTO_MAX_EDGE } }];
}
