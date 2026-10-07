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
import { CameraIcon, FeedIcon, ProfileIcon } from '@/components/ScreenIcons';
import { useInviteStore, useTagStore, useUserStore } from '@/store';
import {
  WELCOME_CARDS,
  welcomeCardsFor,
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

/**
 * Who tagged this newcomer, for the first card (usability walkthrough, 2026-10-07): the tag link
 * Mahi was opened with, else the open tag a claimed link started. Only before a first post.
 */
function useTaggedBy(): string | null {
  const preview = useInviteStore((s) => s.preview);
  const firstTag = useTagStore((s) => s.openTags[0]?.username ?? null);
  const neverPosted = useUserStore((s) => s.profile?.has_posted_before === false);
  if (preview?.open && preview.tag !== false) return preview.username;
  return neverPosted ? firstTag : null;
}

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
 * `onSettled` says whether the cards are out of the way (seen before, or just
 * closed), so the notifications page never opens on top of them.
 */
export default function WelcomeCards({
  userId,
  onSettled,
}: {
  userId: string;
  onSettled?: (settled: boolean) => void;
}): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);
  // Whether "seen" has been read for this account yet.
  const [checked, setChecked] = useState(false);
  // The cards wait for the first read of the tags, so card 1 never changes once shown; who
  // tagged you is fixed when they open.
  const tagsRead = useTagStore((s) => s.openTagsLoaded || s.openTagsError);
  const taggedBy = useTaggedBy();
  const [cards, setCards] = useState<readonly WelcomeCard[] | null>(null);
  useEffect(() => {
    if (visible && tagsRead && cards === null) setCards(welcomeCardsFor(taggedBy));
  }, [visible, tagsRead, taggedBy, cards]);

  useEffect(() => {
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
  }, [userId]);

  const settled = checked && !visible;
  useEffect(() => {
    onSettled?.(settled);
  }, [settled, onSettled]);

  const close = () => {
    setVisible(false);
    // Failing to save only means the cards show once more.
    AsyncStorage.setItem(welcomeSeenKey(userId), '1').catch(() => {});
  };

  if (!visible || !cards) return null;
  return <WelcomeCardsModal cards={cards} onClose={close} />;
}

/** The cards themselves. A full-screen Modal keeps its swipes away from the page-swipe navigators. */
export function WelcomeCardsModal({
  onClose,
  cards = WELCOME_CARDS,
  replay = false,
}: {
  onClose: () => void;
  /** The cards to show (someone a mate tagged gets their own first card). */
  cards?: readonly WelcomeCard[];
  /** Shown again from Settings → Help: the last button says Done. */
  replay?: boolean;
}): React.JSX.Element {
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

  const label = cardButtonLabel(index, COUNT, replay);

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
          {cards.map((card, i) => (
            // Each card scrolls up and down on its own, so long words at large text sizes are
            // never cut off; at normal sizes it fits and sits in the middle.
            <ScrollView
              key={card.title}
              style={{ width }}
              contentContainerStyle={styles.card}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={styles.cardContent}
                accessible
                accessibilityLabel={`${cardPositionLabel(i, COUNT)}. ${card.title} ${card.body}`}
              >
                <CardIllustration icon={card.icon} color={colors.accent} />
                <Text style={[styles.title, { color: colors.text }]}>{card.title}</Text>
                <Text style={[styles.body, { color: colors.text }]}>{card.body}</Text>
              </View>
            </ScrollView>
          ))}
        </ScrollView>

        <View style={styles.dots} accessible accessibilityLabel={cardPositionLabel(index, COUNT)}>
          {cards.map((card, i) => (
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
    paddingVertical: SPACE.s24,
  },
  cardContent: {
    alignItems: 'center',
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
