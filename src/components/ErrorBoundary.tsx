import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Sentry } from '@/lib/sentry';
import { FONTS } from '@/constants/fonts';
import { COLORS, FONT_SIZE, SPACE, RADIUS, LINE_HEIGHT } from '@/constants/tokens';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide error boundary — the only sanctioned class component.
 *
 * Catches render/lifecycle errors anywhere below it, reports them to Sentry,
 * and shows a recoverable fallback instead of a permanent white screen.
 * Wrap the navigation tree with this in App.tsx.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    Sentry.captureException(error, {
      tags: { flow: 'error-boundary' },
      extra: { componentStack: info.componentStack },
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your data is safe — try again.
        </Text>
        <Pressable
          style={styles.button}
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
    backgroundColor: COLORS.bgDark,
  },
  title: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f22,
    fontFamily: FONTS.bold,
    marginBottom: SPACE.s12,
    textAlign: 'center',
  },
  body: {
    color: COLORS.offWhite,
    opacity: 0.7,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    textAlign: 'center',
    marginBottom: SPACE.s32,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s48,
  },
  buttonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
});
