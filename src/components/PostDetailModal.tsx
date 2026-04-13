import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { Database } from '@/types';

type PostRow = Database['public']['Tables']['posts']['Row'];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface PostDetailModalProps {
  post: PostRow;
  onClose: () => void;
}

export default function PostDetailModal({ post, onClose }: PostDetailModalProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg   = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  // Track image aspect ratio for proper display
  const [aspectRatio, setAspectRatio] = useState(1);

  useEffect(() => {
    if (post.image_url) {
      Image.getSize(
        post.image_url,
        (w, h) => { if (h > 0) setAspectRatio(w / h); },
        () => {},
      );
    }
  }, [post.image_url]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 20, stiffness: 260, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 150, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // Fit image within screen bounds with padding
  const maxImgW = SCREEN_W - 32;
  const maxImgH = SCREEN_H * 0.65;
  let imgW = maxImgW;
  let imgH = imgW / aspectRatio;
  if (imgH > maxImgH) {
    imgH = maxImgH;
    imgW = imgH * aspectRatio;
  }

  const dateStr = new Date(post.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Animated.View style={[styles.root, { backgroundColor: bg, opacity: fadeAnim }]}>
      {/* Close button — top-left */}
      <TouchableOpacity
        onPress={handleClose}
        style={[styles.closeBtn, { borderColor: muted }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.closeX, { color: text }]}>✕</Text>
      </TouchableOpacity>

      {/* Post content */}
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        {/* Image */}
        <View style={[styles.imageWrap, { width: imgW, height: imgH, backgroundColor: dark ? '#252521' : '#F0F0EB' }]}>
          <Image
            source={{ uri: post.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Streak badge */}
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>DAY {post.streak_day}</Text>
          </View>
        </View>

        {/* Caption + date */}
        <View style={styles.info}>
          {post.caption ? (
            <Text style={[styles.caption, { color: text }]}>{post.caption}</Text>
          ) : null}
          <Text style={[styles.date, { color: muted }]}>{dateStr}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 520,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
  },
  closeBtn: {
    position:       'absolute',
    top:            Platform.OS === 'ios' ? 60 : 32,
    left:           24,
    zIndex:         1,
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  closeX: {
    fontSize:   16,
    fontFamily: 'JosefinSans_600SemiBold',
    lineHeight: 18,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  imageWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  streakBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  streakText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  info: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 32,
  },
  caption: {
    fontSize: 14,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
  },
  date: {
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
    letterSpacing: 1,
  },
});
