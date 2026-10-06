export const CAPTION_EDIT_MS = 60 * 60 * 1000;

export function canEditPostCaption(createdAt: string, now = Date.now()): boolean {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && now < created + CAPTION_EDIT_MS;
}
