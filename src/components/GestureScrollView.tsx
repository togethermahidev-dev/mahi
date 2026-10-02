import React, { createContext, forwardRef, useContext } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { GestureDetector, type NativeGesture } from 'react-native-gesture-handler';

/**
 * A list's scrolling as a gesture (`Gesture.Native()`), lent to the page swipes around the list.
 * A vertical list starts tracking after ~10pt of movement in any direction, before a page swipe
 * decides at 20pt; unless the swipe may run alongside the list, the list wins and sideways swipes
 * on it do nothing (docs/architecture.md, "Gesture relations").
 */
export const ListGestureContext = createContext<NativeGesture | undefined>(undefined);

/**
 * The scroll view for a FlashList (`renderScrollComponent`), wrapped in the gesture from
 * ListGestureContext when there is one. Used by the Feed and the profile pages.
 */
const GestureScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function GestureScrollView(props, ref) {
    const gesture = useContext(ListGestureContext);
    const list = <ScrollView {...props} ref={ref} />;
    return gesture ? <GestureDetector gesture={gesture}>{list}</GestureDetector> : list;
  }
);

export default GestureScrollView;
