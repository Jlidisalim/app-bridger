import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import { Star, X, CheckCircle2 } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from './Typography';
import { Avatar } from './Avatar';
import { reviewsApi } from '../services/api';

interface RatingTarget {
    id: string;
    name: string;
    avatar?: string;
    profilePhoto?: string;
    role: 'sender' | 'traveler';
}

interface RatingModalProps {
    visible: boolean;
    dealId: string;
    target: RatingTarget;
    onSubmitted: () => void;
    onDismiss: () => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({
    visible,
    dealId,
    target,
    onSubmitted,
    onDismiss,
}) => {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const roleLabel = target.role === 'traveler' ? 'Traveler' : 'Sender';

    const handleSubmit = async () => {
        if (rating === 0) {
            Alert.alert('Rating required', 'Please select a star rating before submitting.');
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await reviewsApi.submitReview({
                dealId,
                targetId: target.id,
                rating,
                comment: comment.trim() || undefined,
            });
            if (res.success) {
                setSubmitted(true);
            } else {
                // 409 = already reviewed — treat as success
                const errMsg = (res as any)?.error || '';
                if (errMsg.toLowerCase().includes('already')) {
                    setSubmitted(true);
                } else {
                    Alert.alert('Error', errMsg || 'Could not submit review. Please try again.');
                }
            }
        } catch {
            Alert.alert('Error', 'Could not submit review. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (submitted) {
            onSubmitted();
        } else {
            onDismiss();
        }
        // Reset for next use
        setRating(0);
        setComment('');
        setSubmitted(false);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.overlay}
            >
                <View style={styles.sheet}>
                    {/* Drag handle */}
                    <View style={styles.handle} />

                    {/* Close button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <X size={20} color={COLORS.background.slate[500]} />
                    </TouchableOpacity>

                    <ScrollView
                        contentContainerStyle={styles.body}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {submitted ? (
                            /* Success state */
                            <View style={styles.successContainer}>
                                <View style={styles.successIcon}>
                                    <CheckCircle2 size={56} color={COLORS.success} />
                                </View>
                                <Typography size="2xl" weight="bold" style={styles.successTitle}>
                                    Review Submitted!
                                </Typography>
                                <Typography color={COLORS.background.slate[500]} style={styles.successSub}>
                                    Your {rating}-star review has been saved to {target.name}'s profile.
                                </Typography>
                                <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                                    <Typography weight="bold" color={COLORS.white} size="lg">Done</Typography>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            /* Rating form */
                            <>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase style={styles.sectionLabel}>
                                    Rate your {roleLabel}
                                </Typography>

                                {/* Target user card */}
                                <View style={styles.userCard}>
                                    <Avatar
                                        userId={target.id}
                                        uri={target.profilePhoto || target.avatar || null}
                                        name={target.name}
                                        size={56}
                                    />
                                    <View style={styles.userInfo}>
                                        <Typography weight="bold" size="lg">{target.name}</Typography>
                                        <View style={styles.roleBadge}>
                                            <Typography size="xs" weight="bold" color={COLORS.primary}>{roleLabel}</Typography>
                                        </View>
                                    </View>
                                </View>

                                {/* Star input */}
                                <Typography size="sm" color={COLORS.background.slate[500]} style={styles.starLabel}>
                                    How would you rate your experience?
                                </Typography>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <TouchableOpacity
                                            key={star}
                                            onPress={() => setRating(star)}
                                            style={styles.starBtn}
                                            activeOpacity={0.7}
                                        >
                                            <Star
                                                size={42}
                                                color="#f59e0b"
                                                fill={rating >= star ? '#f59e0b' : 'transparent'}
                                                strokeWidth={1.5}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <Typography size="sm" weight="bold" color="#f59e0b" style={styles.ratingLabel}>
                                    {rating === 0 ? 'Tap to rate' : RATING_LABELS[rating]}
                                </Typography>

                                {/* Comment */}
                                <TextInput
                                    style={styles.commentInput}
                                    placeholder={`Share your experience with ${target.name}… (optional)`}
                                    placeholderTextColor={COLORS.background.slate[400]}
                                    value={comment}
                                    onChangeText={setComment}
                                    multiline
                                    numberOfLines={3}
                                    maxLength={500}
                                    textAlignVertical="top"
                                />
                                <Typography size="xs" color={COLORS.background.slate[400]} style={styles.charCount}>
                                    {comment.length}/500
                                </Typography>

                                {/* Submit */}
                                <TouchableOpacity
                                    style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
                                    onPress={handleSubmit}
                                    disabled={isSubmitting || rating === 0}
                                    activeOpacity={0.8}
                                >
                                    {isSubmitting ? (
                                        <ActivityIndicator color={COLORS.white} />
                                    ) : (
                                        <Typography weight="bold" color={COLORS.white} size="lg">
                                            Submit Review
                                        </Typography>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.laterBtn} onPress={onDismiss}>
                                    <Typography color={COLORS.background.slate[500]}>Rate later</Typography>
                                </TouchableOpacity>
                            </>
                        )}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const RATING_LABELS: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: RADIUS['3xl'],
        borderTopRightRadius: RADIUS['3xl'],
        paddingTop: SPACING.sm,
        maxHeight: '92%',
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.background.slate[200],
        alignSelf: 'center',
        marginBottom: SPACING.sm,
    },
    closeBtn: {
        position: 'absolute',
        top: SPACING.lg,
        right: SPACING.xl,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.background.light,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    body: {
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING['3xl'],
        paddingTop: SPACING.lg,
    },
    sectionLabel: {
        marginBottom: SPACING.lg,
        letterSpacing: 1.5,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.xl,
        gap: SPACING.lg,
    },
    userInfo: {
        flex: 1,
        gap: SPACING.xs,
    },
    roleBadge: {
        alignSelf: 'flex-start',
        backgroundColor: `${COLORS.primary}12`,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: `${COLORS.primary}25`,
    },
    starLabel: {
        textAlign: 'center',
        marginBottom: SPACING.md,
    },
    starsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: SPACING.sm,
        marginBottom: SPACING.sm,
    },
    starBtn: {
        padding: SPACING.xs,
    },
    ratingLabel: {
        textAlign: 'center',
        marginBottom: SPACING.xl,
        minHeight: 20,
    },
    commentInput: {
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        fontSize: 14,
        color: COLORS.background.slate[900],
        minHeight: 90,
        backgroundColor: COLORS.background.light,
        marginBottom: SPACING.xs,
    },
    charCount: {
        textAlign: 'right',
        marginBottom: SPACING.xl,
    },
    submitBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: SPACING.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.md,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    submitBtnDisabled: {
        opacity: 0.45,
    },
    laterBtn: {
        alignItems: 'center',
        paddingVertical: SPACING.sm,
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: SPACING.xl,
    },
    successIcon: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: `${COLORS.success}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.xl,
    },
    successTitle: {
        marginBottom: SPACING.sm,
        textAlign: 'center',
    },
    successSub: {
        textAlign: 'center',
        marginBottom: SPACING.xxl,
        lineHeight: 22,
    },
    doneBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: SPACING.lg,
        paddingHorizontal: SPACING['3xl'],
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
});
