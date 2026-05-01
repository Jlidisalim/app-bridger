import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { COLORS } from '../theme/theme';

const INTRO_SOURCE = require('../../assets/intro.mp4');

type SplashScreenProps = {
    onEnd?: () => void;
};

export const SplashScreen = ({ onEnd }: SplashScreenProps) => {
    const player = useVideoPlayer(INTRO_SOURCE, (p) => {
        p.loop = false;
        p.muted = true;
        p.play();
    });

    useEffect(() => {
        const endSub = player.addListener('playToEnd', () => {
            onEnd?.();
        });
        // Safety net: some devices may not emit playToEnd if the source stalls.
        const statusSub = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'error' || error) onEnd?.();
        });
        return () => {
            endSub.remove();
            statusSub.remove();
        };
    }, [player, onEnd]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
            <VideoView
                style={styles.video}
                player={player}
                contentFit="cover"
                nativeControls={false}
                allowsFullscreen={false}
                allowsPictureInPicture={false}
            />
        </View>
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
