import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { CameraIcon, FeedIcon, ProfileIcon } from '@/components/ScreenIcons';
import {
  WELCOME_CARDS,
  cardButtonLabel,
  cardPositionLabel,
  isLastCard,
  pageFromOffset,
  welcomeSeenKey,
  type WelcomeCard,
} from '@/lib/welcomeCards';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

const COUNT = WELCOME_CARDS.length;

function CardIllustration({ icon, color }: { icon: WelcomeCard['icon']; color: string }) {
  if (icon === 'camera') return <CameraIcon size={ICON_SIZE.i80} color={color} />;
  if (icon === 'feed') return <FeedIcon size={ICON_SIZE.i80} color={color} />;
  return (
    <View style={styles.people}>
      <ProfileIcon size={ICON_SIZE.i80} color={color} />
      <ProfileIcon size={ICON_SIZE.i80} color={color} />
      <ProfileIcon size={ICON_SIZE.i80} color={color} />
    </View>
  );
}

/**
 * One-time welcome carousel, shown over the signed-in app until this account has closed it
 * on this device. Settings → Help shows the same cards again (WelcomeCardsModal).
 * `onSettled` says whether the cards are out of the way (seen before, switched off, or just
 * closed), so the notifications page never opens on top of them.
 */
export default function WelcomeCards({
  userId,
  onSettled,
}: {
  userId: string;
  onSettled?: (settled: boolean) => void;
}): React.JSX.Element | null {
  const enabled = useFeatureFlag('onboarding-welcome-cards');
  const [visible, setVisible] = useState(false);
  // Whether "seen" has been read for this account yet.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    AsyncStorage.getItem(welcomeSeenKey(userId))
      .then((seen) => {
        if (cancelled) return;
        if (seen !== '1') setVisible(true);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  const settled = !enabled || (checked && !visible);
  useEffect(() => {
    onSettled?.(settled);
  }, [settled, onSettled]);

  const close = () => {
    setVisible(false);
    // Failing to save only means the cards show once more.
    AsyncStorage.setItem(welcomeSeenKey(userId), '1').catch(() => {});
  };

  if (!enabled || !visible) return null;
  return <WelcomeCardsModal onClose={close} />;
}

/** The cards themselves. A full-screen Modal keeps its swipes away from the page-swipe navigators. */
export function WelcomeCardsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(cardPositionLabel(index, COUNT));
  }, [index]);

  const onButton = () => {
    if (isLastCard(index, COUNT)) return onClose();
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(pageFromOffset(e.nativeEvent.contentOffset.x, width, COUNT));
  };

  const label = cardButtonLabel(index, COUNT);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom + SPACE.s24,
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          accessibilityLabel={cardPositionLabel(index, COUNT)}
          style={styles.scroller}
        >
          {WELCOME_CARDS.map((card, i) => (
            <View
              key={card.title}
              style={[styles.card, { width }]}
              accessible
              accessibilityLabel={`${cardPositionLabel(i, COUNT)}. ${card.title} ${card.body}`}
            >
              <CardIllustration icon={card.icon} color={colors.accent} />
              <Text style={[styles.title, { color: colors.text }]}>{card.title}</Text>
              <Text style={[styles.body, { color: colors.text }]}>{card.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots} accessible accessibilityLabel={cardPositionLabel(index, COUNT)}>
          {WELCOME_CARDS.map((card, i) => (
            <View
              key={card.title}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.accent : withAlpha(colors.text, ALPHA.a25),
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={
            isLastCard(index, COUNT) ? 'Closes the welcome cards' : 'Shows the next card'
          }
          onPress={onButton}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text },
            pressed && { opacity: ALPHA.a80 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.bg }]}>{label}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  scroller: {
    flex: 1,
    alignSelf: 'stretch',
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
  },
  people: {
    flexDirection: 'row',
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f28,
    textAlign: 'center',
    marginTop: SPACE.s40,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f17,
    lineHeight: LINE_HEIGHT.l24,
    textAlign: 'center',
    marginTop: SPACE.s16,
  },
  dots: {
    flexDirection: 'row',
    gap: SPACE.s8,
    marginBottom: SPACE.s28,
  },
  dot: {
    width: SIZE.z8,
    height: SIZE.z8,
    borderRadius: RADIUS.r4,
  },
  button: {
    width: '72%',
    alignItems: 'center',
    paddingVertical: SPACE.s16,
    borderRadius: RADIUS.r50,
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
  },
});
