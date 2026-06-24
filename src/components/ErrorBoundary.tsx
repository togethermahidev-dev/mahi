import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Sentry } from '@/lib/sentry';

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
          <Text style={styles.buttonText}>TRY AGAIN</Text>
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
    paddingHorizontal: 32,
    backgroundColor: '#1C1C19',
  },
  title: {
    color: '#E8E8E3',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#E8E8E3',
    opacity: 0.7,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#59c2d7',
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  buttonText: {
    color: '#1A1A17',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
