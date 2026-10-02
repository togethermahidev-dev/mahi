/**
 * Every haptic in the app, by moment. Call `haptic('shutter')` — never expo-haptics directly — so
 * each moment feels the same wherever it happens and can be retuned here in one place.
 * Haptics are a nicety: a phone without them (or with them off) simply feels nothing.
 */
import * as Haptics from 'expo-haptics';

export type HapticMoment =
  /** A photo is taken or a video starts recording. */
  | 'shutter'
  /** The camera switches between your view and the selfie side. */
  | 'flip'
  /** A switch, toggle or pick from a list (lens, flash, Photo / Video, location). */
  | 'selection'
  /** A small confirmation: a page settles, a like, a zoom resets. */
  | 'tick'
  /** Something lifts to be dragged (the small photo window). */
  | 'pickUp'
  /** The Post button sends the post on its way. */
  | 'postSent'
  /** The server confirms the post's tags reached friends. */
  | 'tagSent'
  /** The server says the streak went up. */
  | 'streakUp'
  /** The feed you are looking at opens… */
  | 'feedUnlocked'
  /** …or locks. */
  | 'feedLocked'
  /** A refused action (too many tags, tags still missing). */
  | 'warning'
  /** Something failed (the post didn't go through). */
  | 'error';

type Feel =
  | { kind: 'impact'; style: Haptics.ImpactFeedbackStyle }
  | { kind: 'notification'; type: Haptics.NotificationFeedbackType }
  | { kind: 'selection' };

const impact = (style: Haptics.ImpactFeedbackStyle): Feel => ({ kind: 'impact', style });
const notify = (type: Haptics.NotificationFeedbackType): Feel => ({ kind: 'notification', type });

export const HAPTIC_MOMENTS: Record<HapticMoment, Feel> = {
  shutter: impact(Haptics.ImpactFeedbackStyle.Rigid),
  flip: impact(Haptics.ImpactFeedbackStyle.Soft),
  selection: { kind: 'selection' },
  tick: impact(Haptics.ImpactFeedbackStyle.Light),
  pickUp: impact(Haptics.ImpactFeedbackStyle.Light),
  postSent: impact(Haptics.ImpactFeedbackStyle.Medium),
  tagSent: notify(Haptics.NotificationFeedbackType.Success),
  streakUp: impact(Haptics.ImpactFeedbackStyle.Heavy),
  feedUnlocked: notify(Haptics.NotificationFeedbackType.Success),
  feedLocked: notify(Haptics.NotificationFeedbackType.Warning),
  warning: notify(Haptics.NotificationFeedbackType.Warning),
  error: notify(Haptics.NotificationFeedbackType.Error),
};

/** The pause between two moments felt one after the other (tags sent, then streak up), in ms. */
export const HAPTIC_GAP_MS = 450;

/** Feel a moment. Safe from worklets via `runOnJS(haptic)('pickUp')`. */
export function haptic(moment: HapticMoment): void {
  const feel = HAPTIC_MOMENTS[moment];
  const done =
    feel.kind === 'impact'
      ? Haptics.impactAsync(feel.style)
      : feel.kind === 'notification'
        ? Haptics.notificationAsync(feel.type)
        : Haptics.selectionAsync();
  done.catch(() => {});
}

/** Feel several moments in a row, HAPTIC_GAP_MS apart. */
export function hapticSequence(moments: HapticMoment[]): void {
  moments.forEach((m, i) => {
    if (i === 0) haptic(m);
    else setTimeout(() => haptic(m), i * HAPTIC_GAP_MS);
  });
}

/**
 * What a post confirmed by the server feels like: its tags (or invite links) reached people,
 * then — when the server says so — the streak went up.
 */
export function postedMoments({
  tags,
  streakBefore,
  streakAfter,
}: {
  /** Friends tagged plus invite links. */
  tags: number;
  streakBefore: number;
  streakAfter: number;
}): HapticMoment[] {
  const moments: HapticMoment[] = [];
  if (tags > 0) moments.push('tagSent');
  if (streakAfter > streakBefore) moments.push('streakUp');
  return moments;
}

/**
 * The feed locking or opening is felt once, by someone looking at it. `seen` is the lock state the
 * person last saw (null before the first read of a session). A change while they are on another
 * screen is felt when they come back to the feed.
 */
export function feedLockMoment({
  seen,
  locked,
  loaded,
  onScreen,
}: {
  seen: boolean | null;
  locked: boolean;
  loaded: boolean;
  onScreen: boolean;
}): { moment: 'feedLocked' | 'feedUnlocked' | null; seen: boolean | null } {
  if (!loaded) return { moment: null, seen: null };
  if (seen === null) return { moment: null, seen: locked };
  if (!onScreen || seen === locked) return { moment: null, seen };
  return { moment: locked ? 'feedLocked' : 'feedUnlocked', seen: locked };
}
