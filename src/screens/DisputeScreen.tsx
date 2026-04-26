import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    Image,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import {
    ArrowLeft,
    MoreHorizontal,
    CheckCircle2,
    Clock,
    Paperclip,
    Send,
    Info,
} from 'lucide-react-native';
import apiClient from '../services/api/client';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';

interface ChatMessage {
    id: string;
    content: string;
    senderId: string | null;
    sender?: { id: string; name: string; avatar?: string };
    createdAt: string;
}

interface DisputeData {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
    evidences?: { id: string; type: string; url?: string; content?: string; createdAt: string }[];
}

interface DisputeScreenProps {
    deal: any;
    onBack: () => void;
}

export const DisputeScreen: React.FC<DisputeScreenProps> = ({ deal, onBack }) => {
    const currency = useUserCurrency();
    const [message, setMessage] = useState('');
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [disputeData, setDisputeData] = useState<DisputeData | null>(null);
    const [isLoadingChat, setIsLoadingChat] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const currentUser = useAppStore(s => s.currentUser);

    // Fetch dispute details and chat messages
    const fetchDisputeData = useCallback(async () => {
        try {
            const disputeRes = await apiClient.get<any>(`/disputes?dealId=${deal.id}`);
            if (disputeRes.success && disputeRes.data?.items?.length > 0) {
                setDisputeData(disputeRes.data.items[0]);
            }
        } catch {}

        try {
            // Get chat room for this deal and fetch messages
            const roomRes = await apiClient.post<any>('/chat/rooms', { dealId: deal.id });
            if (roomRes.success && roomRes.data?.id) {
                const msgRes = await apiClient.get<any>(`/chat/rooms/${roomRes.data.id}/messages?limit=50`);
                if (msgRes.success && msgRes.data?.items) {
                    setChatMessages(msgRes.data.items.reverse());
                }
            }
        } catch {}
        setIsLoadingChat(false);
    }, [deal.id]);

    useEffect(() => { fetchDisputeData(); }, [fetchDisputeData]);

    const handleSendMessage = async () => {
        const text = message.trim();
        if (!text || isSending) return;
        setIsSending(true);
        try {
            const roomRes = await apiClient.post<any>('/chat/rooms', { dealId: deal.id });
            if (roomRes.success && roomRes.data?.id) {
                const res = await apiClient.post<any>(`/chat/rooms/${roomRes.data.id}/messages`, { content: text });
                if (res.success && res.data) {
                    setChatMessages(prev => [...prev, res.data]);
                    setMessage('');
                }
            }
        } catch { Alert.alert('Error', 'Failed to send message'); }
        setIsSending(false);
    };

    const handleUploadEvidence = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'] as ImagePicker.MediaType[],
            allowsMultipleSelection: true,
            quality: 0.8,
        });
        if (result.canceled || result.assets.length === 0) return;

        setIsUploading(true);
        try {
            for (const asset of result.assets) {
                const formData = new FormData();
                formData.append('image', { uri: asset.uri, name: 'evidence.jpg', type: 'image/jpeg' } as any);
                formData.append('type', 'PHOTO');
                if (disputeData?.id) {
                    await apiClient.post<any>(`/disputes/${disputeData.id}/evidence`, formData as unknown as Record<string, unknown>, true);
                }
            }
            Alert.alert('Evidence Uploaded', `${result.assets.length} photo(s) uploaded successfully.`);
            fetchDisputeData();
        } catch {
            Alert.alert('Upload Failed', 'Could not upload evidence. Please try again.');
        }
        setIsUploading(false);
    };

    const disputeStatus = disputeData?.status || 'OPENED';
    const getProgressPercent = () => {
        const statusOrder = ['OPENED', 'EVIDENCE_SUBMITTED', 'ADMIN_REVIEWING', 'RESOLVED_FILER_WIN', 'RESOLVED_AGAINST_WIN', 'RESOLVED_SPLIT', 'CLOSED'];
        const idx = statusOrder.indexOf(disputeStatus);
        return Math.min(100, Math.max(10, (idx / (statusOrder.length - 1)) * 100));
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.iconButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography weight="bold" size="lg" style={styles.headerTitle}>
                    Dispute #{deal.id?.slice(-4) || 'N/A'}
                </Typography>
                <TouchableOpacity style={styles.iconButton}>
                    <MoreHorizontal color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Dispute Status Card */}
                    <View style={styles.card}>
                        <View style={styles.statusHeader}>
                            <Typography weight="bold" size="xl" color="#0F172A">Dispute Status</Typography>
                            <View style={styles.statusBadge}>
                                <Typography size="xs" weight="bold" color="#1E3A8A">{disputeStatus.replace(/_/g, ' ')}</Typography>
                            </View>
                        </View>

                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${getProgressPercent()}%` }]} />
                            </View>
                            <Typography weight="bold" size="sm" color="#0F172A" style={{ marginLeft: 12 }}>{Math.round(getProgressPercent())}%</Typography>
                        </View>

                        <Typography size="sm" color={COLORS.background.slate[600]} style={styles.statusDesc}>
                            Our team is currently reviewing the evidence provided by both parties. Resolution expected within 48 hours.
                        </Typography>
                    </View>

                    {/* Dispute Timeline Card */}
                    <View style={styles.card}>
                        <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 20 }}>
                            Dispute Timeline
                        </Typography>

                        <View style={styles.timelineContainer}>
                            {/* Step 1 */}
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={styles.completedIcon}>
                                        <CheckCircle2 size={16} color={COLORS.white} />
                                    </View>
                                    <View style={styles.connectorActive} />
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography weight="bold" size="sm" color="#0F172A">Dispute Opened</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>Oct 12, 10:30 AM</Typography>
                                </View>
                            </View>

                            {/* Step 2 */}
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={styles.completedIcon}>
                                        <CheckCircle2 size={16} color={COLORS.white} />
                                    </View>
                                    <View style={styles.connectorActive} />
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography weight="bold" size="sm" color="#0F172A">Evidence Submitted</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>Oct 13, 02:15 PM</Typography>
                                </View>
                            </View>

                            {/* Step 3 (Active) */}
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={styles.activeIconContainer}>
                                        <Clock size={16} color="#1E3A8A" />
                                    </View>
                                    <View style={styles.connectorPending} />
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography weight="bold" size="sm" color="#1E3A8A">Admin Reviewing</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>Oct 14, 09:00 AM</Typography>
                                </View>
                            </View>

                            {/* Step 4 (Pending) */}
                            <View style={[styles.timelineItem, { paddingBottom: 0 }]}>
                                <View style={styles.timelineLeft}>
                                    <View style={styles.pendingIcon} />
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography weight="bold" size="sm" color={COLORS.background.slate[400]}>Resolution</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 2 }}>Pending</Typography>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Shipment Details Card */}
                    <View style={styles.card}>
                        <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 16 }}>
                            Shipment Details
                        </Typography>

                        <View style={styles.shipmentSummary}>
                            <View style={styles.boxImagePlaceholder}>
                                {/* Visual representation of the box graphic */}
                                <View style={styles.boxSim} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Typography weight="bold" size="sm" color="#0F172A">{deal.package?.category || deal.name || 'Shipment'}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>Tracking: {deal.id?.slice(0, 12) || 'N/A'}</Typography>
                            </View>
                        </View>

                        <View style={styles.detailsGrid}>
                            <View style={styles.detailItem}>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Origin</Typography>
                                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>{deal.route?.from || 'N/A'}</Typography>
                            </View>
                            <View style={styles.detailItem}>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Destination</Typography>
                                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>{deal.route?.to || 'N/A'}</Typography>
                            </View>
                            <View style={styles.detailItem}>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Carrier</Typography>
                                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>{deal.travelerName || 'Bridger Traveler'}</Typography>
                            </View>
                            <View style={styles.detailItem}>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Value</Typography>
                                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>{currency.symbol}{deal.pricing?.amount ?? deal.price ?? 0}</Typography>
                            </View>
                        </View>
                    </View>

                    {/* Chat Embed Card */}
                    <View style={[styles.card, styles.chatCard]}>
                        <View style={styles.chatHeader}>
                            <View style={styles.chatHeaderLeft}>
                                <View style={styles.supportAvatar}>
                                    <Image source={require('../../assets/favicon.png')} style={{ width: 20, height: 20, tintColor: COLORS.white }} />
                                </View>
                                <View style={{ marginLeft: 12 }}>
                                    <Typography weight="bold" size="sm" color="#0F172A">Bridger Support</Typography>
                                    <View style={styles.onlineStatusRow}>
                                        <View style={styles.onlineDot} />
                                        <Typography size="xs" color="#10B981" style={{ marginLeft: 4 }}>Online</Typography>
                                    </View>
                                </View>
                            </View>
                            <Info size={20} color={COLORS.background.slate[400]} />
                        </View>

                        {/* Chat Messages — fetched from API */}
                        <View style={styles.chatArea}>
                            {isLoadingChat ? (
                                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                </View>
                            ) : chatMessages.length === 0 ? (
                                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                    <Typography size="sm" color={COLORS.background.slate[400]}>No messages yet. Start the conversation.</Typography>
                                </View>
                            ) : chatMessages.map((msg) => {
                                const isMe = msg.senderId === currentUser?.id;
                                const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return isMe ? (
                                    <View key={msg.id} style={styles.messageRowRight}>
                                        <View style={styles.messageBubbleRight}>
                                            <Typography size="sm" color={COLORS.white} style={{ lineHeight: 20 }}>
                                                {msg.content}
                                            </Typography>
                                        </View>
                                        <Typography size="xs" color={COLORS.background.slate[400]} style={styles.messageTimeRight}>{time}</Typography>
                                    </View>
                                ) : (
                                    <View key={msg.id} style={styles.messageRowLeft}>
                                        <View style={styles.messageBubbleLeft}>
                                            <Typography size="sm" color="#334155" style={{ lineHeight: 20 }}>
                                                {msg.content}
                                            </Typography>
                                        </View>
                                        <Typography size="xs" color={COLORS.background.slate[400]} style={styles.messageTimeLeft}>{time}</Typography>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Chat Input */}
                        <View style={styles.chatInputContainer}>
                            <TouchableOpacity style={styles.attachButton}>
                                <Paperclip size={20} color={COLORS.background.slate[500]} />
                            </TouchableOpacity>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Type your message..."
                                    placeholderTextColor={COLORS.background.slate[400]}
                                    value={message}
                                    onChangeText={setMessage}
                                />
                            </View>
                            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage} disabled={isSending}>
                                {isSending ? (
                                    <ActivityIndicator size="small" color={COLORS.white} />
                                ) : (
                                    <Send color={COLORS.white} size={16} style={{ marginLeft: -2 }} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom Form Actions */}
            <View style={styles.footer}>
                <Button
                    label={isUploading ? "Uploading..." : "Add Evidence"}
                    variant="outline"
                    onPress={handleUploadEvidence}
                    disabled={isUploading}
                    style={styles.secondaryButton}
                />
                <Button
                    label="Contact Mediator"
                    onPress={() => {
                        Alert.alert(
                            'Contact Mediator',
                            'A Bridger mediator will be assigned to your dispute. You will receive a notification when they are available.',
                            [{ text: 'OK' }]
                        );
                    }}
                    style={styles.primaryButton}
                />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6', // Lighter grey background to match mockup
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 14,
        backgroundColor: '#F3F4F6',
    },
    iconButton: {
        padding: 4,
    },
    headerTitle: {
        color: '#0F172A',
        textAlign: 'center',
    },
    scrollContent: {
        padding: SPACING.xl,
        gap: 16,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    chatCard: {
        padding: 0, // Reset padding for full width chat elements
        overflow: 'hidden',
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    statusBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    progressBarBg: {
        flex: 1,
        height: 8,
        backgroundColor: '#E2E8F0',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1E3A8A',
        borderRadius: 4,
    },
    statusDesc: {
        lineHeight: 20,
    },
    timelineContainer: {
        paddingLeft: 4,
    },
    timelineItem: {
        flexDirection: 'row',
        paddingBottom: 20, // Space between steps
    },
    timelineLeft: {
        alignItems: 'center',
        width: 32,
    },
    completedIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    activeIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#EEF2FF',
        borderWidth: 1.5,
        borderColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    pendingIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CBD5E1',
        backgroundColor: COLORS.white,
        zIndex: 2,
        marginTop: 2,
    },
    connectorActive: {
        width: 2,
        flex: 1,
        backgroundColor: '#1E3A8A',
        marginVertical: -8, // Connect seamlessly
    },
    connectorPending: {
        width: 2,
        flex: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: -8,
    },
    timelineRight: {
        flex: 1,
        marginLeft: 12,
        paddingTop: 2,
    },
    shipmentSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: RADIUS.xl,
        marginBottom: 20,
    },
    boxImagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: RADIUS.lg,
        backgroundColor: '#F3E8C1', // Cardboard color simulation
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    boxSim: {
        width: 40,
        height: 30,
        backgroundColor: '#D4B886', // Darker cardboard details
        borderTopWidth: 10,
        borderTopColor: '#C4A876',
        borderRadius: 4,
        marginTop: 10,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 20,
    },
    detailItem: {
        width: '50%',
    },
    chatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    chatHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    supportAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    onlineStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    onlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    chatArea: {
        padding: 20,
        paddingBottom: 10,
    },
    messageRowLeft: {
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    messageBubbleLeft: {
        backgroundColor: '#F1F5F9',
        padding: 16,
        borderRadius: 20,
        borderTopLeftRadius: 4,
        maxWidth: '85%',
    },
    messageTimeLeft: {
        marginTop: 8,
        marginLeft: 4,
    },
    messageRowRight: {
        marginBottom: 16,
        alignItems: 'flex-end',
    },
    messageBubbleRight: {
        backgroundColor: '#1E3A8A', // Bridger blue
        padding: 16,
        borderRadius: 20,
        borderTopRightRadius: 4,
        maxWidth: '85%',
    },
    messageTimeRight: {
        marginTop: 8,
        marginRight: 4,
    },
    chatInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        backgroundColor: COLORS.white,
    },
    attachButton: {
        padding: 10,
        marginLeft: -10,
    },
    inputWrapper: {
        flex: 1,
        height: 44,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 22,
        paddingHorizontal: 16,
        marginHorizontal: 12,
        justifyContent: 'center',
    },
    textInput: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: '#0F172A',
        padding: 0, // Reset Android padding
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        flexDirection: 'row',
        padding: SPACING.xl,
        gap: 16,
        backgroundColor: '#F3F4F6',
        paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
    },
    secondaryButton: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.white,
        borderColor: COLORS.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    primaryButton: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1E3A8A',
    },
});
