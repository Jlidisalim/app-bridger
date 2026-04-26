import React, { useState } from 'react';
import {
    Modal,
    View,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Image,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X, Image as ImageIcon, Video, Trash2 } from 'lucide-react-native';
import { Typography } from './Typography';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import apiClient from '../services/api/client';

interface MediaItem {
    uri: string;
    type: 'image' | 'video';
    name: string;
}

interface CancelDialogProps {
    visible: boolean;
    /** 'deal' or 'trip' — controls which upload endpoint is used */
    entityType: 'deal' | 'trip';
    entityId: string;
    onClose: () => void;
    /** Called after the cancel API call succeeds — caller handles navigation */
    onConfirmed: () => void;
}

export const CancelDialog: React.FC<CancelDialogProps> = ({
    visible,
    entityType,
    entityId,
    onClose,
    onConfirmed,
}) => {
    const [reason, setReason] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setReason('');
        setMedia([]);
        setUploading(false);
        setSubmitting(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const pickMedia = async (mediaType: 'images' | 'videos') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: [mediaType === 'images' ? 'images' : 'videos'] as ImagePicker.MediaType[],
            allowsMultipleSelection: true,
            quality: 0.8,
            videoMaxDuration: 60,
        });
        if (result.canceled || !result.assets.length) return;

        const newItems: MediaItem[] = result.assets.map((a) => ({
            uri: a.uri,
            type: a.type === 'video' ? 'video' : 'image',
            name: a.fileName || (a.type === 'video' ? 'video.mp4' : 'photo.jpg'),
        }));

        setMedia((prev) => [...prev, ...newItems].slice(0, 5));
    };

    const removeMedia = (index: number) => {
        setMedia((prev) => prev.filter((_, i) => i !== index));
    };

    const uploadEvidence = async (): Promise<string[]> => {
        if (!media.length) return [];
        setUploading(true);
        try {
            const formData = new FormData();
            media.forEach((m) => {
                formData.append('files', {
                    uri: m.uri,
                    name: m.name,
                    type: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
                } as any);
            });
            const res = await apiClient.post<{ urls: string[] }>(
                '/deals/upload-cancel-evidence',
                formData as unknown as Record<string, unknown>,
                true,
            );
            if (res.success && res.data?.urls) return res.data.urls;
            throw new Error(res.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!reason.trim() || reason.trim().length < 10) {
            Alert.alert('Reason required', 'Please describe why you are cancelling (at least 10 characters).');
            return;
        }
        if (submitting) return;
        setSubmitting(true);
        try {
            const evidenceUrls = await uploadEvidence();

            const endpoint = entityType === 'trip' ? `/trips/${entityId}` : `/deals/${entityId}`;
            const res = await apiClient.delete<any>(endpoint, {
                reason: reason.trim(),
                evidence: evidenceUrls,
            });

            if (!res.success) {
                Alert.alert('Error', res.error || 'Failed to cancel. Please try again.');
                return;
            }

            reset();
            onConfirmed();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.sheet}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Typography weight="bold" size="lg" color="#0F172A">
                            Cancel {entityType === 'trip' ? 'Trip' : 'Deal'}
                        </Typography>
                        <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={22} color={COLORS.background.slate[500]} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
                        {/* Reason */}
                        <Typography weight="bold" size="sm" color="#0F172A" style={styles.label}>
                            Reason *
                        </Typography>
                        <TextInput
                            style={styles.textarea}
                            placeholder="Describe why you are cancelling…"
                            placeholderTextColor={COLORS.background.slate[400]}
                            multiline
                            numberOfLines={4}
                            maxLength={1000}
                            value={reason}
                            onChangeText={setReason}
                        />
                        <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'right', marginTop: 4 }}>
                            {reason.length}/1000
                        </Typography>

                        {/* Proof */}
                        <Typography weight="bold" size="sm" color="#0F172A" style={[styles.label, { marginTop: SPACING.md }]}>
                            Proof (optional — max 5 files)
                        </Typography>

                        <View style={styles.pickRow}>
                            <TouchableOpacity style={styles.pickBtn} onPress={() => pickMedia('images')}>
                                <ImageIcon size={18} color={COLORS.primary} />
                                <Typography size="sm" color={COLORS.primary} style={{ marginLeft: 6 }}>Add Image</Typography>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.pickBtn} onPress={() => pickMedia('videos')}>
                                <Video size={18} color={COLORS.primary} />
                                <Typography size="sm" color={COLORS.primary} style={{ marginLeft: 6 }}>Add Video</Typography>
                            </TouchableOpacity>
                        </View>

                        {/* Preview grid */}
                        {media.length > 0 && (
                            <View style={styles.previewGrid}>
                                {media.map((m, i) => (
                                    <View key={i} style={styles.previewItem}>
                                        {m.type === 'image' ? (
                                            <Image source={{ uri: m.uri }} style={styles.previewImage} />
                                        ) : (
                                            <View style={styles.videoPlaceholder}>
                                                <Video size={28} color={COLORS.background.slate[400]} />
                                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                                                    {m.name}
                                                </Typography>
                                            </View>
                                        )}
                                        <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(i)}>
                                            <Trash2 size={14} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    {/* Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={submitting}>
                            <Typography weight="bold" color={COLORS.background.slate[600]}>Go Back</Typography>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmBtn, (submitting || uploading) && styles.disabledBtn]}
                            onPress={handleSubmit}
                            disabled={submitting || uploading}
                        >
                            {submitting || uploading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Typography weight="bold" color="#fff">
                                    {uploading ? 'Uploading…' : 'Confirm Cancel'}
                                </Typography>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
    body: {
        padding: SPACING.lg,
        paddingBottom: SPACING.xl,
    },
    label: {
        marginBottom: SPACING.xs,
    },
    textarea: {
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        minHeight: 110,
        textAlignVertical: 'top',
        fontSize: 15,
        color: '#0F172A',
        backgroundColor: COLORS.background.slate[50],
    },
    pickRow: {
        flexDirection: 'row',
        gap: SPACING.sm,
        marginTop: SPACING.xs,
    },
    pickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        borderRadius: RADIUS.lg,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        flex: 1,
        justifyContent: 'center',
    },
    previewGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.sm,
        marginTop: SPACING.md,
    },
    previewItem: {
        width: 90,
        height: 90,
        borderRadius: RADIUS.sm,
        overflow: 'visible',
        position: 'relative',
    },
    previewImage: {
        width: 90,
        height: 90,
        borderRadius: RADIUS.sm,
    },
    videoPlaceholder: {
        width: 90,
        height: 90,
        borderRadius: RADIUS.sm,
        backgroundColor: COLORS.background.slate[100],
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    removeBtn: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        width: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        flexDirection: 'row',
        gap: SPACING.sm,
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        backgroundColor: '#EF4444',
    },
    disabledBtn: {
        opacity: 0.6,
    },
});
