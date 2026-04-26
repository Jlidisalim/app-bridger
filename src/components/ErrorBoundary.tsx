import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from './Typography';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // TODO: Send to analytics/crash reporting service
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Typography size="2xl" weight="bold" align="center" color={COLORS.background.slate[900]}>
              Oops! Something went wrong
            </Typography>
            <Typography
              size="base"
              weight="regular"
              align="center"
              color={COLORS.background.slate[500]}
              style={styles.message}
            >
              We encountered an unexpected error. Please try again.
            </Typography>
            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Typography size="xs" color={COLORS.error} style={styles.errorText}>
                  {this.state.error.message}
                </Typography>
              </View>
            )}
            <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
              <Typography size="base" weight="bold" color={COLORS.white}>
                Try Again
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.light,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  message: {
    marginTop: SPACING.md,
    lineHeight: 22,
  },
  errorDetails: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.sm,
    width: '100%',
  },
  errorText: {
    fontFamily: 'monospace',
  },
  retryButton: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.lg,
  },
});
