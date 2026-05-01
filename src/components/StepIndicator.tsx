import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { Typography } from './Typography';

interface StepIndicatorProps {
    currentStep: number;
    totalSteps: number;
    label: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
    currentStep,
    totalSteps,
    label,
}) => {
    const progress = (currentStep / totalSteps) * 100;

    return (
        <View style={styles.container}>
            <View style={styles.textRow}>
                <Typography size="xs" weight="bold" color={COLORS.primary} uppercase tracking={1}>
                    Step {currentStep} of {totalSteps}
                </Typography>
                <Typography size="xs" weight="medium" color={COLORS.background.slate[500]}>
                    {label}
                </Typography>
            </View>
            <View style={styles.progressBackground}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.md,
    },
    textRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    progressBackground: {
        height: 6,
        backgroundColor: `${COLORS.primary}1A`, // 10% opacity
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 3,
    },
});
