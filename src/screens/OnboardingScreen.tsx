import React, { useState, useRef } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    Dimensions,
    TouchableOpacity,
    StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { DotIndicator } from '../components/DotIndicator';
import { Handshake, Banknote, QrCode, ArrowRight, ArrowLeft } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Send documents effortlessly',
        description: 'Connect with verified travelers flying to your destination for secure, same-day delivery.',
        icon: Handshake,
    },
    {
        id: '2',
        title: 'Travelers earn money',
        description: 'Turn your empty luggage space into cash by carrying small parcels on your upcoming flights.',
        icon: Banknote,
    },
    {
        id: '3',
        title: 'Secure with QR & Escrow',
        description: 'Your money is safe in escrow and only released when the receiver scans the unique delivery QR code.',
        icon: QrCode,
    },
];

interface OnboardingScreenProps {
    onSkip: () => void;
    onDone: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onSkip, onDone }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    const handleScroll = (event: any) => {
        const scrollOffset = event.nativeEvent.contentOffset.x;
        const index = Math.round(scrollOffset / width);
        setActiveIndex(index);
    };

    const nextSlide = () => {
        if (activeIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
        } else {
            onDone();
        }
    };

    const prevSlide = () => {
        if (activeIndex > 0) {
            flatListRef.current?.scrollToIndex({ index: activeIndex - 1 });
        }
    };

    const renderItem = ({ item }: { item: typeof SLIDES[0] }) => {
        return (
            <View style={styles.slide}>
                <View style={styles.illustrationContainer}>
                    <View style={styles.iconCircle}>
                        <item.icon color={COLORS.primary} size={84} strokeWidth={1.5} />
                    </View>
                </View>

                <View style={styles.textContainer}>
                    <Typography size="3xl" weight="bold" align="center" style={styles.title}>
                        {item.title}
                    </Typography>
                    <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.description}>
                        {item.description}
                    </Typography>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={prevSlide} style={styles.backButton}>
                    {activeIndex > 0 && <ArrowLeft color={COLORS.background.slate[900]} size={24} />}
                </TouchableOpacity>

                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Bridger
                </Typography>

                <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                    <Typography size="sm" weight="semibold" color={COLORS.primary}>
                        Skip
                    </Typography>
                </TouchableOpacity>
            </View>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={SLIDES}
                renderItem={renderItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                keyExtractor={(item) => item.id}
                style={styles.flatList}
                removeClippedSubviews={false}
                initialNumToRender={SLIDES.length}
                maxToRenderPerBatch={SLIDES.length}
                windowSize={SLIDES.length + 2}
            />

            {/* Footer */}
            <View style={styles.footer}>
                <DotIndicator count={SLIDES.length} activeIndex={activeIndex} />

                <View style={styles.buttonContainer}>
                    <Button
                        label={activeIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
                        onPress={nextSlide}
                        style={styles.nextButton}
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
    },
    backButton: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
    },
    skipButton: {
        paddingHorizontal: SPACING.lg,
    },
    flatList: {
        flex: 1,
    },
    slide: {
        width: width,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
    },
    illustrationContainer: {
        width: width * 0.8,
        aspectRatio: 1,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.xxl,
    },
    iconCircle: {
        width: 192,
        height: 192,
        borderRadius: 96,
        backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
    },
    title: {
        marginBottom: SPACING.md,
        lineHeight: 36,
    },
    description: {
        lineHeight: 24,
    },
    footer: {
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.xxl,
        gap: SPACING.xxl,
    },
    buttonContainer: {
        width: '100%',
    },
    nextButton: {
        // Custom button styles if needed
    },
});
