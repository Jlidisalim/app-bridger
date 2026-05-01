import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Alert,
    Platform,
    Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { ArrowLeft, Camera as CameraIcon, Zap, HelpCircle, Lock, CheckCircle2, Sun, RotateCcw, User } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';

interface SelfieVerificationScreenProps {
    onCapture: () => void;
    onBack: () => void;
}

export const SelfieVerificationScreen: React.FC<SelfieVerificationScreenProps> = ({
    onCapture,
    onBack,
}) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSimulator, setIsSimulator] = useState(false);
    const cameraRef = useRef<any>(null);
    
    const { setKYCSelfie, setKYCStatus } = useAppStore();

    // Check if running on simulator
    useEffect(() => {
        if (Platform.OS === 'ios') {
            // Check if camera is available
            const checkSimulator = async () => {
                // Try to get permission first
                if (!permission?.granted) {
                    return;
                }
                
                // If we have permission but are on simulator, we'll handle it
                setIsSimulator(false);
            };
            checkSimulator();
        }
    }, [permission]);

    if (!permission) {
        return (
            <View style={styles.loadingContainer}>
                <Typography>Loading...</Typography>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.permissionContainer}>
                    <View style={styles.permissionIcon}>
                        <CameraIcon color={COLORS.primary} size={48} />
                    </View>
                    <Typography size="lg" weight="bold" align="center" style={styles.permissionTitle}>
                        Camera Access Required
                    </Typography>
                    <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.permissionText}>
                        We need camera access to take a selfie for identity verification. This helps keep Bridger secure.
                    </Typography>
                    <Button 
                        label="Grant Camera Permission" 
                        onPress={requestPermission}
                        style={styles.permissionButton}
                    />
                    
                    {/* Simulator bypass — only available in development builds */}
                    {__DEV__ && (
                        <TouchableOpacity 
                            style={styles.simulatorButton}
                            onPress={() => {
                                setKYCSelfie('simulator_placeholder');
                                setKYCStatus('pending');
                                onCapture();
                            }}
                        >
                            <Typography size="sm" color={COLORS.primary}>
                                Continue without camera (Simulator)
                            </Typography>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    const handleCapture = async () => {
        if (isCapturing || !cameraRef.current) return;
        
        try {
            setIsCapturing(true);
            
            // Take the photo
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: false,
                skipProcessing: false,
            });
            
            if (photo?.uri) {
                setCapturedPhoto(photo.uri);
                setKYCSelfie(photo.uri);
                
                // Show success and proceed
                Alert.alert(
                    'Selfie Captured! 📸',
                    'Your photo has been captured successfully.',
                    [
                        {
                            text: 'Continue',
                            onPress: () => {
                                setKYCStatus('pending');
                                onCapture();
                            }
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error capturing photo:', error);
            Alert.alert('Error', 'Failed to capture photo. Please try again or use the simulator option.');
        } finally {
            setIsCapturing(false);
        }
    };

    // For simulator - skip camera and use placeholder
    const handleSimulatorMode = () => {
        setCapturedPhoto('simulator_placeholder');
        setKYCSelfie('simulator_placeholder');
        setKYCStatus('pending');
        onCapture();
    };

    const handleRetake = () => {
        setCapturedPhoto(null);
        setKYCSelfie('');
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Identity Verification
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            {/* Step Info */}
            <View style={styles.stepInfoContainer}>
                <View style={styles.stepHeaderRow}>
                    <Typography weight="bold" size="md">Selfie Verification</Typography>
                    <View style={styles.stepBadge}>
                        <Typography size="sm" color={COLORS.background.slate[700]}>Step 2 of 2</Typography>
                    </View>
                </View>

                <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarFill} />
                </View>

                <View style={styles.finalStepRow}>
                    <CheckCircle2 size={16} color={COLORS.primary} fill={COLORS.primary} stroke={COLORS.white} />
                    <Typography size="xs" color={COLORS.background.slate[600]} weight="semibold" style={{ marginLeft: 6, letterSpacing: 0.5 }}>
                        FINAL STEP
                    </Typography>
                </View>
            </View>

            {/* Title Section */}
            <View style={styles.titleSection}>
                <Typography size="2xl" weight="bold" align="center" style={{ marginBottom: 12 }}>
                    {capturedPhoto ? 'Photo Captured!' : 'Take a Selfie'}
                </Typography>
                <Typography size="md" color={COLORS.background.slate[500]} align="center" style={{ paddingHorizontal: 20 }}>
                    {capturedPhoto 
                        ? 'Your selfie has been captured.' 
                        : 'Position your face in the frame for verification.'}
                </Typography>
            </View>

            {/* Camera Area */}
            <View style={styles.cameraArea}>
                <View style={styles.cameraFrame}>
                    <CameraView 
                        ref={cameraRef}
                        style={styles.cameraFeed} 
                        facing="front"
                    >
                        <View style={styles.faceOutlineContainer}>
                            <Svg height="100%" width="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <Path
                                    d="M 20 50 C 20 10, 80 10, 80 50 C 80 90, 60 95, 50 95 C 40 95, 20 90, 20 50 Z"
                                    fill="transparent"
                                    stroke="rgba(255, 255, 255, 0.8)"
                                    strokeWidth="1.5"
                                />
                            </Svg>
                        </View>

                        <View style={styles.lightingPill}>
                            <Sun size={16} color="#4ADE80" />
                            <Typography size="sm" color={COLORS.white} weight="medium" style={{ marginLeft: 8 }}>
                                Lighting is good
                            </Typography>
                        </View>
                    </CameraView>
                </View>
            </View>

            {/* Controls */}
            <View style={styles.controlsSection}>
                <View style={styles.controlsRow}>
                    <TouchableOpacity style={styles.iconButton}>
                        <Zap color={COLORS.background.slate[700]} size={24} />
                    </TouchableOpacity>

                    <View style={styles.captureRing}>
                        <TouchableOpacity 
                            style={styles.captureButton} 
                            onPress={handleCapture}
                            disabled={isCapturing}
                        >
                            {isCapturing ? (
                                <CameraIcon color={COLORS.white} size={24} />
                            ) : (
                                <CameraIcon color={COLORS.white} size={32} />
                            )}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.iconButton}>
                        <CameraIcon color={COLORS.background.slate[700]} size={24} />
                    </TouchableOpacity>
                </View>

                {/* Simulator Skip Option */}
                <TouchableOpacity 
                    style={styles.skipButton}
                    onPress={handleSimulatorMode}
                >
                    <Typography size="sm" color={COLORS.background.slate[500]}>
                        Having issues? {Platform.OS === 'ios' ? 'Skip for simulator' : 'Skip'}
                    </Typography>
                </TouchableOpacity>

                <View style={styles.securityInfo}>
                    <Lock color={COLORS.background.slate[400]} size={14} />
                    <Typography size="xs" color={COLORS.background.slate[400]} weight="medium">
                        End-to-end encrypted verification
                    </Typography>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.xl,
    },
    permissionIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.xl,
    },
    permissionTitle: {
        marginBottom: SPACING.md,
    },
    permissionText: {
        marginBottom: SPACING.xl,
        lineHeight: 22,
    },
    permissionButton: {
        marginBottom: SPACING.lg,
    },
    simulatorButton: {
        padding: SPACING.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerTitle: {
        color: COLORS.background.slate[900],
    },
    stepInfoContainer: {
        paddingHorizontal: SPACING.xl,
        marginTop: SPACING.lg,
    },
    stepHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    stepBadge: {
        backgroundColor: '#E2E8F0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressBarFill: {
        width: '100%',
        height: '100%',
        backgroundColor: '#1E3B8A',
        borderRadius: 3,
    },
    finalStepRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleSection: {
        marginTop: 32,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    cameraArea: {
        flex: 1,
        paddingHorizontal: 24,
        marginTop: 32,
        marginBottom: 20,
    },
    cameraFrame: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: COLORS.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 10,
    },
    cameraFeed: {
        flex: 1,
        backgroundColor: COLORS.background.slate[900],
    },
    faceOutlineContainer: {
        ...StyleSheet.absoluteFillObject,
        padding: 20,
    },
    lightingPill: {
        position: 'absolute',
        bottom: 20,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
    },
    controlsSection: {
        paddingBottom: 40,
        alignItems: 'center',
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 40,
        marginBottom: 20,
        gap: 30,
    },
    iconButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 5,
    },
    captureRing: {
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 3,
        borderColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureButton: {
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: '#1E3B8A',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1E3B8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    skipButton: {
        marginBottom: 20,
        padding: SPACING.sm,
    },
    securityInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
});
