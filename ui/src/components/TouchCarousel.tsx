import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { carouselIndex, carouselPositionLabel } from '@/lib/carousel';
import { ALPHA, COLORS, RADIUS, SIZE, SPACE, withAlpha } from '@/constants/tokens';
import { useAppTheme } from '@/hooks/useAppTheme';

interface TouchCarouselProps<T> {
  items: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Width of one card. A smaller width than the viewport leaves the next card peeking in. */
  itemWidth: number;
  /** Space between cards. */
  gap?: number;
  /** Room after the last card, so it can snap fully into view. */
  endInset?: number;
  /** Describes the group alongside its accessible position indicator. */
  accessibilityLabel: string;
  /** Optional JS callback for analytics or linked UI. */
  onActiveIndexChange?: (index: number) => void;
  /** Optional shared value for another animated component to follow. */
  activeIndexValue?: SharedValue<number>;
  /** Reports whether a finger currently owns the carousel, for nested gesture surfaces. */
  onTouchStateChange?: (active: boolean) => void;
}

/**
 * A shared horizontal card carousel: native touch scrolling, one-card snapping, a visible next-card
 * cue and accessible position dots. It owns presentation only; callers provide cards and actions.
 */
export default function TouchCarousel<T>({
  items,
  keyExtractor,
  renderItem,
  itemWidth,
  gap = SPACE.s12,
  endInset = 0,
  accessibilityLabel,
  onActiveIndexChange,
  activeIndexValue,
  onTouchStateChange,
}: TouchCarouselProps<T>): React.JSX.Element {
  const { dark } = useAppTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const touchActive = useRef(false);
  const interval = itemWidth + gap;

  const setTouchActive = useCallback(
    (active: boolean) => {
      if (touchActive.current === active) return;
      touchActive.current = active;
      onTouchStateChange?.(active);
    },
    [onTouchStateChange]
  );

  useEffect(() => () => setTouchActive(false), [setTouchActive]);

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = carouselIndex(event.nativeEvent.contentOffset.x, itemWidth, gap, items.length);
      setTouchActive(false);
      if (next === activeIndex) return;
      setActiveIndex(next);
      activeIndexValue?.set(next);
      onActiveIndexChange?.(next);
    },
    [
      activeIndex,
      activeIndexValue,
      gap,
      itemWidth,
      items.length,
      onActiveIndexChange,
      setTouchActive,
    ]
  );

  const inactiveDot = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a25)
    : withAlpha(COLORS.offBlack, ALPHA.a20);

  return (
    <View style={styles.root} accessible={false}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        disableIntervalMomentum
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEnabled={items.length > 1}
        contentContainerStyle={{ paddingRight: endInset }}
        onTouchStart={() => setTouchActive(true)}
        onTouchEnd={() => setTouchActive(false)}
        onTouchCancel={() => setTouchActive(false)}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
      >
        {items.map((item, index) => (
          <View
            key={keyExtractor(item, index)}
            style={[
              styles.item,
              { width: itemWidth },
              index < items.length - 1 ? { marginRight: gap } : null,
            ]}
          >
            {renderItem(item, index)}
          </View>
        ))}
      </ScrollView>

      {items.length > 1 ? (
        <View
          style={styles.pagination}
          accessible
          accessibilityLabel={`${accessibilityLabel}. ${carouselPositionLabel(activeIndex, items.length)}`}
        >
          {items.map((item, index) => (
            <View
              key={keyExtractor(item, index)}
              style={[
                styles.dot,
                {
                  width: index === activeIndex ? SIZE.z20 : SIZE.z8,
                  backgroundColor: index === activeIndex ? COLORS.accent : inactiveDot,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  item: {
    alignSelf: 'stretch',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.s6,
    marginTop: SPACE.s10,
  },
  dot: {
    height: SIZE.z8,
    borderRadius: RADIUS.pill,
  },
});
