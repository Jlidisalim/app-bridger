import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { StepIndicator } from '../components/StepIndicator';
import { ArrowLeft, ArrowRight, BadgeCheck, Book, Car, Camera as CameraIcon, Info, CheckCircle2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useAppStore } from '../store/useAppStore';


interface KYCUploadScreenProps {
    onContinue: () => void;
    onBack: () => void;
}

export const KYCUploadScreen: React.FC<KYCUploadScreenProps> = ({ onContinue, onBack }) => {
    const [selectedDoc, setSelectedDoc] = useState<'id_card' | 'passport' | 'license'>('id_card');
    const [frontImage, setFrontImage] = useState<string | null>(null);
    const [backImage, setBackImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    
    const { 
        setKYCDocumentType, 
        setKYCDocumentFront, 
        setKYCDocumentBack,
        setKYCStatus 
    } = useAppStore();

    const pickImage = async (type: 'front' | 'back') => {
        // Request permission
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (!permissionResult.granted) {
            Alert.alert(
                'Permission Required',
                'Please allow access to your photo library to upload documents.'
            );
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'] as ImagePicker.MediaType[],
            allowsEditing: true,
            aspect: [3, 2],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const uri = result.assets[0].uri;
            
            if (type === 'front') {
                setFrontImage(uri);
                setKYCDocumentFront(uri);
            } else {
                setBackImage(uri);
                setKYCDocumentBack(uri);
            }
            
            // Also save document type
            setKYCDocumentType(selectedDoc);
        }
    };

    const handleContinue = () => {
        // Validate that both images are uploaded
        if (!frontImage || !backImage) {
            Alert.alert(
                'Missing Documents',
                'Please upload both the front and back of your ID document.'
            );
            return;
        }

        setIsUploading(true);
        
        // Simulate upload delay
        setTimeout(() => {
            setIsUploading(false);
            setKYCStatus('pending');
            onContinue();
        }, 1000);
    };

    const docTypes = [
        { id: 'id_card' as const, title: 'ID Card', subtitle: 'National ID or Residence Permit', icon: BadgeCheck },
        { id: 'passport' as const, title: 'Passport', subtitle: 'International Passport', icon: Book },
        { id: 'license' as const, title: 'Driver\'s License', subtitle: 'Government issued license', icon: Car },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        KYC Verification
                    </Typography>
                </View>
                <StepIndicator currentStep={1} totalSteps={3} label="Document Selection" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.titleSection}>
                    <Typography size="2xl" weight="bold" style={styles.title}>
                        Select Document Type
                    </Typography>
                    <Typography size="base" color={COLORS.background.slate[600]}>
                        Please choose the identity document you would like to upload for verification.
                    </Typography>
                </View>

                <View style={styles.optionsSection}>
                    {docTypes.map((doc) => (
                        <TouchableOpacity
                            key={doc.id}
                            activeOpacity={0.7}
                            onPress={() => setSelectedDoc(doc.id)}
                            style={[
                                styles.option,
                                selectedDoc === doc.id && styles.selectedOption,
                            ]}
                        >
                            <View style={styles.optionContent}>
                                <View style={styles.iconBox}>
                                    <doc.icon color={COLORS.primary} size={24} />
                                </View>
                                <View>
                                    <Typography weight="bold">{doc.title}</Typography>
                                    <Typography size="sm" color={COLORS.background.slate[500]}>
                                        {doc.subtitle}
                                    </Typography>
                                </View>
                            </View>
                            <View style={[styles.radio, selectedDoc === doc.id && styles.radioActive]}>
                                {selectedDoc === doc.id && <View style={styles.radioInner} />}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                <Typography size="lg" weight="bold" style={styles.sectionTitle}>
                    Upload Photos
                </Typography>

                <View style={styles.uploadGrid}>
                    <TouchableOpacity 
                        style={[styles.uploadBox, frontImage && styles.uploadBoxSuccess]} 
                        onPress={() => pickImage('front')}
                    >
                        {frontImage ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: frontImage }} style={styles.previewImage} />
                                <View style={styles.checkBadge}>
                                    <CheckCircle2 size={20} color={COLORS.white} />
                                </View>
                            </View>
                        ) : (
                            <>
                                <View style={styles.uploadIconCircle}>
                                    <CameraIcon color={COLORS.primary} size={24} />
                                </View>
                                <Typography weight="semibold">Front of ID</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>
                                    PNG, JPG up to 10MB
                                </Typography>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.uploadBox, backImage && styles.uploadBoxSuccess]} 
                        onPress={() => pickImage('back')}
                    >
                        {backImage ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: backImage }} style={styles.previewImage} />
                                <View style={styles.checkBadge}>
                                    <CheckCircle2 size={20} color={COLORS.white} />
                                </View>
                            </View>
                        ) : (
                            <>
                                <View style={styles.uploadIconCircle}>
                                    <CameraIcon color={COLORS.primary} size={24} />
                                </View>
                                <Typography weight="semibold">Back of ID</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>
                                    PNG, JPG up to 10MB
                                </Typography>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.infoBox}>
                    <Info color={COLORS.primary} size={16} style={styles.infoIcon} />
                    <Typography size="xs" color={COLORS.background.slate[600]} style={styles.infoText}>
                        Ensure all details on the document are clearly visible and no glare is covering the information. The document must be valid and not expired.
                    </Typography>
                </View>

                <Button 
                    label={isUploading ? "Uploading..." : "Continue to Verification"} 
                    onPress={handleContinue}
                    loading={isUploading}
                    disabled={!frontImage || !backImage || isUploading}
                    style={styles.continueButton} 
                />
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    header: {
        backgroundColor: COLORS.background.light,
        borderBottomWidth: 1,
        borderBottomColor: `${COLORS.primary}1A`,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        marginLeft: SPACING.md,
    },
    scrollContent: {
        padding: SPACING.xl,
    },
    titleSection: {
        marginBottom: SPACING.xl,
        gap: 8,
    },
    title: {
        lineHeight: 32,
    },
    optionsSection: {
        gap: SPACING.md,
        marginBottom: SPACING.xxl,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACING.lg,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 2,
        borderColor: `${COLORS.primary}1A`,
    },
    selectedOption: {
        borderColor: COLORS.primary,
        backgroundColor: `${COLORS.primary}0D`,
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.lg,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: `${COLORS.primary}33`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioActive: {
        borderColor: COLORS.primary,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.primary,
    },
    sectionTitle: {
        marginBottom: SPACING.lg,
    },
    uploadGrid: {
        gap: SPACING.md,
        marginBottom: SPACING.xl,
    },
    uploadBox: {
        height: 140,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: `${COLORS.primary}33`,
        borderRadius: RADIUS.lg,
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    uploadBoxSuccess: {
        borderColor: COLORS.success,
        borderStyle: 'solid',
    },
    uploadIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: `${COLORS.primary}0D`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    previewContainer: {
        width: '100%',
        height: '100%',
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        position: 'relative',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: COLORS.success,
        borderRadius: 12,
        padding: 2,
    },
    infoBox: {
        flexDirection: 'row',
        padding: SPACING.lg,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
        marginBottom: SPACING.xxl,
        gap: 12,
    },
    infoIcon: {
        marginTop: 2,
    },
    infoText: {
        flex: 1,
        lineHeight: 18,
    },
    continueButton: {},
    bottomSpacer: {
        height: 40,
    },
});
