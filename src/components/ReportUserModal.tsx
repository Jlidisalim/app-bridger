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
import { X, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from './Typography';
import { userModerationAPI, ReportReason } from '../services/api';

interface ReportUserModalProps {
    visible: boolean;
    reportedUserId: string;
    reportedUserName: string;
    chatRoomId?: string;
    onSubmitted: () => void;
    onDismiss: () => void;
}

const REASONS: { id: ReportReason; label: string; description: string }[] = [
    { id: 'SPAM',          label: 'Spam',                    description: 'Repeated unsolicited messages or promotions.' },
    { id: 'SCAM',          label: 'Scam or fraud',           description: 'Trying to scam, defraud, or steal money.' },
    { id: 'HARASSMENT',    label: 'Harassment or bullying',  description: 'Threats, intimidation, or hateful messages.' },
    { id: 'INAPPROPRIATE', label: 'Inappropriate content',   description: 'Sexual, violent, or other harmful content.' },
    { id: 'FAKE_LISTING',  label: 'Fake listing',            description: 'Misleading deal or trip information.' },
    { id: 'IMPERSONATION', label: 'Impersonation',           description: 'Pretending to be someone else.' },
    { id: 'OTHER',         label: 'Other',                   description: 'A reason not listed above.' },
];

export const ReportUserModal: React.FC<ReportUserModalProps> = ({
    visible,
    reportedUserId,
    reportedUserName,
    chatRoomId,
    onSubmitted,
    onDismiss,
}) => {
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const reset = () => {
        setReason(null);
        setDescription('');
        setSubmitted(false);
    };

    const handleClose = () => {
        if (submitted) onSubmitted();
        else onDismiss();
        reset();
    };

    const handleSubmit = async () => {
        if (!reason) {
            Alert.alert('Reason required', 'Please pick a reason for the report.');
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await userModerationAPI.reportUser(
                reportedUserId,
                reason,
                description.trim() || undefined,
                chatRoomId,
            );
            if (res.success) {
                setSubmitted(true);
            } else {
                Alert.alert('Could not submit', res.error || 'Please try again in a moment.');
            }
        } catch (e: any) {
            Alert.alert('Could not submit', e?.message || 'Please try again in a moment.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Typography weight="bold" size="lg">
                                {submitted ? 'Report submitted' : `Report ${reportedUserName}`}
                            </Typography>
                            {!submitted && (
                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>
                                    Help us keep Bridger safe. Reports are confidential.
                                </Typography>
                            )}
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close report dialog">
                            <X size={20} color={COLORS.background.slate[600]} />
                        </TouchableOpacity>
                    </View>

                    {submitted ? (
                        <View style={styles.successWrap}>
                            <CheckCircle2 size={56} color={COLORS.primary} />
                            <Typography weight="bold" size="md" style={{ marginTop: 12, textAlign: 'center' }}>
                                Thanks for letting us know
                            </Typography>
                            <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 8, textAlign: 'center' }}>
                                Our trust & safety team will review this report within 24 hours.
                            </Typography>
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                                <Typography weight="bold" color={COLORS.white} size="sm">Done</Typography>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
                                {REASONS.map((r) => {
                                    const selected = reason === r.id;
                                    return (
                                        <TouchableOpacity
                                            key={r.id}
                                            style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                                            onPress={() => setReason(r.id)}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected }}
                                        >
                                            <View style={[styles.radio, selected && styles.radioSelected]}>
                                                {selected && <View style={styles.radioInner} />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Typography weight="bold" size="sm">{r.label}</Typography>
                                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>
                                                    {r.description}
                                                </Typography>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}

                                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.fieldLabel}>
                                    DETAILS (OPTIONAL)
                                </Typography>
                                <TextInput
                                    style={styles.textArea}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder="Add anything that will help us investigate (links, dates, what happened)"
                                    placeholderTextColor={COLORS.background.slate[400]}
                                    multiline
                                    maxLength={2000}
                                    textAlignVertical="top"
                                />
                                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'right', marginTop: 4 }}>
                                    {description.length}/2000
                                </Typography>
                            </ScrollView>

                            <View style={styles.footer}>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose} disabled={isSubmitting}>
                                    <Typography weight="bold" size="sm" color={COLORS.background.slate[700]}>Cancel</Typography>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, (!reason || isSubmitting) && styles.primaryBtnDisabled]}
                                    onPress={handleSubmit}
                                    disabled={!reason || isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <ActivityIndicator color={COLORS.white} />
                                    ) : (
                                        <>
                                            <AlertCircle size={16} color={COLORS.white} />
                                            <Typography weight="bold" color={COLORS.white} size="sm" style={{ marginLeft: 6 }}>
                                                Submit report
                                            </Typography>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.lg,
        paddingBottom: SPACING.xl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    closeBtn: {
        padding: 4,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        marginBottom: 8,
        backgroundColor: COLORS.white,
    },
    reasonRowSelected: {
        borderColor: COLORS.primary,
        backgroundColor: '#F0F9FF',
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: COLORS.background.slate[300],
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioSelected: {
        borderColor: COLORS.primary,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.primary,
    },
    fieldLabel: {
        marginTop: 12,
        marginBottom: 6,
        letterSpacing: 1,
    },
    textArea: {
        minHeight: 90,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        borderRadius: RADIUS.lg,
        padding: 12,
        fontSize: 14,
        color: COLORS.background.slate[900],
        backgroundColor: '#F8FAFC',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    secondaryBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtn: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 12,
        borderRadius: RADIUS.lg,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtnDisabled: {
        opacity: 0.5,
    },
    successWrap: {
        alignItems: 'center',
        paddingVertical: 24,
    },
});

export default ReportUserModal;
