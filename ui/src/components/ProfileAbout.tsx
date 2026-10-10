import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, LAYOUT, PROFILE_ABOUT, SIZE, SPACE } from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';
import type { ProfileCounts } from '@/hooks/useProfileAbout';
import { countWords, type CountKind } from '@/lib/profileAbout';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';

// A count is one line (20) tall. Its tap area grows upward only, to 44, over the name and
// @username (which are not buttons); the bio just below it grows downward only. The two never
// overlap, and counts side by side keep less than half their gap each.
const COUNT_SLOP = {
  top: tapSlop(SIZE.z20, TAP_AREA.ios).top * 2,
  bottom: 0,
  left: SPACE.s6,
  right: SPACE.s6,
};
const BIO_SLOP = { top: 0, bottom: tapSlop(SIZE.z20, TAP_AREA.ios).bottom, left: 0, right: 0 };

interface ProfileAboutProps {
  dark: boolean;
  /**
   * The two counts: `null` while the server is asked (a dash each), `undefined` for no counts
   * (the server keeps them back across a block).
   */
  counts: ProfileCounts | null | undefined;
  /** Whose lists the counts open, as a screen reader says it: "your", "@sam’s". */
  whose: string;
  /** Opens that list. Left out where the viewer may not read it: the count is then plain text. */
  onOpenList?: (kind: CountKind) => void;
  /** Your own profile: "Friends" at the end of the counts line. */
  onOpenFriends?: () => void;
  /** Which bio line to draw (`bioLine` in lib/profileAbout). */
  bioLine: 'none' | 'add' | 'show';
  bio?: string | null;
  /** Your own profile: "Add a bio", or a tap on your bio, opens the editor. */
  onEditBio?: () => void;
}

/**
 * Under the name and @username on a profile (switch `profile-bio-and-counts`): one line of
 * follower and following counts, then the bio in three lines at most. Kept short so the grid of
 * posts still shows without scrolling (owner, 2026-10-10). Shared by your profile and the
 * profiles you visit.
 */
export default function ProfileAbout({
  dark,
  counts,
  whose,
  onOpenList,
  onOpenFriends,
  bioLine,
  bio,
  onEditBio,
}: ProfileAboutProps): React.JSX.Element | null {
  const { text, muted } = themeColors(dark);
  const showCounts = counts !== undefined;
  if (!showCounts && !onOpenFriends && bioLine === 'none') return null;

  const count = (kind: CountKind, value: number | null) => {
    const words = countWords(value, kind);
    const line = (
      <>
        <Text
          style={[styles.countNumber, { color: value === null ? muted : text }]}
          maxFontSizeMultiplier={LAYOUT.largeTextScale}
        >
          {words.number}
        </Text>
        <Text style={[styles.countWord, { color: muted }]} numberOfLines={1}>
          {words.word}
        </Text>
      </>
    );
    if (!onOpenList) {
      return (
        <View style={styles.count} accessible accessibilityLabel={words.label}>
          {line}
        </View>
      );
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.count, pressed && styles.pressed]}
        onPress={() => onOpenList(kind)}
        accessibilityRole="button"
        accessibilityLabel={words.label}
        accessibilityHint={`Opens ${whose} ${kind} list`}
        hitSlop={COUNT_SLOP}
      >
        {line}
      </Pressable>
    );
  };

  const bioText = (
    <Text
      style={[styles.bio, { color: text }]}
      numberOfLines={PROFILE_ABOUT.bioLines}
      ellipsizeMode="tail"
    >
      {bio}
    </Text>
  );

  return (
    <View style={styles.root}>
      {showCounts || onOpenFriends ? (
        // At large text the line wraps instead of running under the picture.
        <View style={styles.counts}>
          {showCounts ? (
            <>
              {count('followers', counts ? counts.followers : null)}
              {count('following', counts ? counts.following : null)}
            </>
          ) : null}
          {onOpenFriends ? (
            <Pressable
              style={({ pressed }) => [styles.count, pressed && styles.pressed]}
              onPress={onOpenFriends}
              accessibilityRole="button"
              accessibilityLabel="Friends"
              accessibilityHint="Opens your friends list"
              hitSlop={COUNT_SLOP}
            >
              <Text style={[styles.friends, { color: text }]} numberOfLines={1}>
                Friends
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {bioLine === 'show' && bio ? (
        onEditBio ? (
          <Pressable
            style={({ pressed }) => [styles.bioRow, pressed && styles.pressed]}
            onPress={onEditBio}
            accessibilityRole="button"
            accessibilityLabel={`Your bio: ${bio}`}
            accessibilityHint="Opens the bio editor"
            hitSlop={BIO_SLOP}
          >
            {bioText}
          </Pressable>
        ) : (
          <View style={styles.bioRow}>{bioText}</View>
        )
      ) : null}

      {bioLine === 'add' && onEditBio ? (
        <Pressable
          style={({ pressed }) => [styles.bioRow, pressed && styles.pressed]}
          onPress={onEditBio}
          accessibilityRole="button"
          accessibilityLabel="Add a bio"
          accessibilityHint="Opens the bio editor"
          hitSlop={BIO_SLOP}
        >
          <Text style={[styles.addBio, { color: muted }]} numberOfLines={1}>
            Add a bio
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: SPACE.s14,
    marginTop: SPACE.s4,
  },
  // The number and its word share a baseline.
  count: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACE.s4,
  },
  countNumber: {
    ...TYPOGRAPHY.bodyStrong,
    fontVariant: ['tabular-nums'],
  },
  countWord: {
    ...TYPOGRAPHY.caption,
  },
  friends: {
    ...TYPOGRAPHY.bodyMedium,
  },
  bioRow: {
    marginTop: SPACE.s2,
  },
  bio: {
    ...TYPOGRAPHY.body,
  },
  addBio: {
    ...TYPOGRAPHY.bodyMedium,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
