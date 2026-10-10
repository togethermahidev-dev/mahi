import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { reportError } from '@/lib/sentry';
import { TYPOGRAPHY } from '@/constants/typography';
import { COLORS, ALPHA, RADIUS, SPACE } from '@/constants/tokens';

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
    reportError(error, {
      flow: 'screen',
      action: 'render',
      level: 'fatal',
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
        <Text style={styles.title} accessibilityRole="header">
          Couldn’t show this screen
        </Text>
        <Text style={styles.body}>Try again. If it keeps happening, close and reopen Mahi.</Text>
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
    ...TYPOGRAPHY.h2,
    color: COLORS.offWhite,
    marginBottom: SPACE.s12,
    textAlign: 'center',
  },
  body: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.offWhite,
    opacity: ALPHA.a70,
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
    ...TYPOGRAPHY.button,
    color: COLORS.offBlack,
  },
});
