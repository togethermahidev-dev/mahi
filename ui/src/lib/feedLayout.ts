import { ICON_SIZE, POST_CARD } from '@/constants/tokens';

/**
 * The full-screen post's layout from the window and the text size, so a small phone keeps the
 * caption clear of the buttons, a tall phone and large text get more caption lines, and large
 * text gets a taller shade to stay readable.
 */
export function feedLayout({
  height,
  fontScale,
}: {
  width: number;
  height: number;
  fontScale: number;
}): { captionLines: number; actionIcon: number; shadeHeight: number; actionsBottom: number } {
  const small = height < POST_CARD.smallPhoneH;
  const tall = height >= POST_CARD.tallPhoneH;
  const largeText = fontScale >= POST_CARD.largeText;
  return {
    captionLines: largeText
      ? POST_CARD.captionLinesLarge
      : tall
        ? POST_CARD.captionLinesTall
        : POST_CARD.captionLines,
    actionIcon: small ? ICON_SIZE.i28 : ICON_SIZE.i32,
    shadeHeight: largeText ? POST_CARD.shadeHeightLarge : POST_CARD.shadeHeight,
    actionsBottom: small ? POST_CARD.actionsBottomSmall : POST_CARD.actionsBottom,
  };
}

/** How full the countdown ring is: the share of the window still left, between 0 and 1. */
export function ringProgress(msLeft: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.min(1, Math.max(0, msLeft / windowMs));
}
