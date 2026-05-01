import React from 'react';
import {
    View,
    TextInput,
    TextInputProps,
    StyleSheet,
    Text,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { Typography } from './Typography';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: any;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    containerStyle,
    style,
    ...props
}) => {
    return (
        <View style={[styles.container, containerStyle]}>
            {label && (
                <Typography size="sm" weight="semibold" style={styles.label}>
                    {label}
                </Typography>
            )}
            <TextInput
                style={[
                    styles.input,
                    error ? styles.inputError : styles.inputDefault,
                    style,
                ]}
                placeholderTextColor={COLORS.background.slate[400]}
                {...props}
            />
            {error && (
                <Typography size="xs" color={COLORS.error} style={styles.errorText}>
                    {error}
                </Typography>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: SPACING.lg,
    },
    label: {
        marginBottom: SPACING.sm,
        marginLeft: 4,
    },
    input: {
        height: 56,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg,
        fontSize: TYPOGRAPHY.sizes.base,
        fontFamily: TYPOGRAPHY.fontFamily,
        color: COLORS.background.slate[900],
        backgroundColor: COLORS.white,
        borderWidth: 1,
    },
    inputDefault: {
        borderColor: `${COLORS.primary}33`, // 20% opacity
    },
    inputError: {
        borderColor: COLORS.error,
    },
    errorText: {
        marginTop: SPACING.xs,
        marginLeft: 4,
    },
});
