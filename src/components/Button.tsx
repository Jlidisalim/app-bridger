import React from 'react';
import {
    TouchableOpacity,
    TouchableOpacityProps,
    StyleSheet,
    ActivityIndicator,
    StyleProp,
    TextStyle,
    View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme/theme';
import { Typography } from './Typography';

interface ButtonProps extends TouchableOpacityProps {
    label: string;
    variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    icon?: React.ReactNode;
    iconPosition?: 'left' | 'right';
    textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
    label,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = true,
    style,
    icon,
    iconPosition = 'left',
    textStyle,
    ...props
}) => {
    const isPrimary = variant === 'primary';
    const isOutline = variant === 'outline';

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            disabled={disabled || loading}
            style={[
                styles.base,
                fullWidth && styles.fullWidth,
                styles[size],
                isPrimary && styles.primary,
                isOutline && styles.outline,
                (disabled || loading) && styles.disabled,
                style,
            ]}
            {...props}
        >
            {loading ? (
                <ActivityIndicator color={isPrimary ? COLORS.white : COLORS.primary} />
            ) : (
                <React.Fragment>
                    {icon && iconPosition === 'left' && <View style={{ marginRight: 8 }}>{icon}</View>}
                    <Typography
                        size={size === 'sm' ? 'sm' : 'base'}
                        weight="bold"
                        color={isPrimary ? COLORS.white : isOutline ? COLORS.background.slate[600] : COLORS.primary}
                        style={textStyle}
                    >
                        {label}
                    </Typography>
                    {icon && iconPosition === 'right' && <View style={{ marginLeft: 8 }}>{icon}</View>}
                </React.Fragment>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    base: {
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    fullWidth: {
        width: '100%',
    },
    sm: {
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
    },
    md: {
        paddingVertical: SPACING.lg,
        paddingHorizontal: SPACING.xl,
    },
    lg: {
        paddingVertical: SPACING.xl,
        paddingHorizontal: SPACING.xxl,
    },
    primary: {
        backgroundColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
    },
    disabled: {
        opacity: 0.5,
    },
});
