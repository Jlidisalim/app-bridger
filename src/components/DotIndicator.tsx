import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS, RADIUS } from '../theme/theme';

interface DotIndicatorProps {
    count: number;
    activeIndex: number;
}

export const DotIndicator: React.FC<DotIndicatorProps> = ({ count, activeIndex }) => {
    return (
        <View style={styles.container}>
            {Array.from({ length: count }).map((_, index) => {
                const isActive = index === activeIndex;
                return (
                    <View
                        key={index}
                        style={[
                            styles.dot,
                            isActive ? styles.activeDot : styles.inactiveDot,
                        ]}
                    />
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    dot: {
        height: 8,
        borderRadius: RADIUS.full,
    },
    activeDot: {
        width: 24,
        backgroundColor: COLORS.primary,
    },
    inactiveDot: {
        width: 8,
        backgroundColor: `${COLORS.primary}33`, // 20% opacity
    },
});
