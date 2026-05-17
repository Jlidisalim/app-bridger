import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, StatusBar } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { COLORS } from '../theme/theme';

const INTRO_SOURCE = require('../../assets/intro.mp4');
const FADE_IN_MS = 500;
const FADE_OUT_MS = 800;

type SplashScreenProps = {
    onEnd?: () => void;
};

export const SplashScreen = ({ onEnd }: SplashScreenProps) => {
    const videoOpacity = useRef(new Animated.Value(0)).current;
    const endedRef = useRef(false);

    const player = useVideoPlayer(INTRO_SOURCE, (p) => {
        p.loop = false;
        p.muted = true;
        p.play();
    });

    // Fade the video in once it actually has a frame ready, so the first paint isn't a hard cut.
    useEffect(() => {
        const readySub = player.addListener('statusChange', ({ status }) => {
            if (status === 'readyToPlay') {
                Animated.timing(videoOpacity, {
                    toValue: 1,
                    duration: FADE_IN_MS,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }).start();
            }
        });
        return () => readySub.remove();
    }, [player, videoOpacity]);

    useEffect(() => {
        const finish = (smooth: boolean) => {
            if (endedRef.current) return;
            endedRef.current = true;
            if (!smooth) {
                onEnd?.();
                return;
            }
            Animated.timing(videoOpacity, {
                toValue: 0,
                duration: FADE_OUT_MS,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
            }).start(() => onEnd?.());
        };

        const endSub = player.addListener('playToEnd', () => finish(true));
        // Safety net: some devices may not emit playToEnd if the source stalls.
        const statusSub = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'error' || error) finish(false);
        });
        return () => {
            endSub.remove();
            statusSub.remove();
        };
    }, [player, onEnd, videoOpacity]);

    return (
        <Animated.View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
            <Animated.View style={[styles.video, { opacity: videoOpacity }]}>
                <VideoView
                    style={styles.video}
                    player={player}
                    contentFit="cover"
                    nativeControls={false}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                />
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: {
        flex: 1,
        alignSelf: 'stretch',
    },
});
