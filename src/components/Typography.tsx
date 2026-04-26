import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { TYPOGRAPHY, COLORS } from '../theme/theme';

interface TypographyProps extends TextProps {
    size?: keyof typeof TYPOGRAPHY.sizes;
    weight?: keyof typeof TYPOGRAPHY.weights;
    color?: string;
    align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
    uppercase?: boolean;
    tracking?: number;
    italic?: boolean;
    opacity?: number;
}

export const Typography: React.FC<TypographyProps> = ({
    children,
    size = 'base',
    weight = 'regular',
    color = COLORS.background.slate[900],
    align = 'left',
    uppercase = false,
    tracking = 0,
    italic = false,
    opacity = 1,
    style,
    ...props
}) => {
    return (
        <Text
            style={[
                {
                    fontSize: TYPOGRAPHY.sizes[size],
                    fontWeight: TYPOGRAPHY.weights[weight] as any,
                    fontFamily: TYPOGRAPHY.fontFamily,
                    color: color,
                    textAlign: align,
                    textTransform: uppercase ? 'uppercase' : 'none',
                    letterSpacing: tracking,
                    fontStyle: italic ? 'italic' : 'normal',
                    opacity: opacity,
                },
                style,
            ]}
            {...props}
        >
            {children}
        </Text>
    );
};
