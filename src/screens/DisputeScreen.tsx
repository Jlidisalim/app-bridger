// File Dispute Screen — intentionally minimal.
//
// Two states only:
//   1. No dispute yet → "File a Dispute" form (type + reason + description)
//   2. Dispute exists → small reason/status header + chat thread + composer
//
// Per design: no separate evidence list, no timeline, no mediator escalation
// button. Users can still attach images/videos via the chat input.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  Paperclip,
  Send,
  FileText,
  Video as VideoIcon,
  AlertCircle,
} from 'lucide-react-native';
import apiClient from '../services/api/client';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';

// ── Types ────────────────────────────────────────────────────────────────────

interface DisputeMessage {
  id: string;
  disputeId: string;
  senderId: string | null;
  senderRole: 'FILER' | 'AGAINST' | 'ADMIN' | 'SYSTEM';
  content: string | null;
  attachmentUrl: string | null;
  attachmentType: 'image' | 'video' | 'document' | null;
  attachmentName: string | null;
  createdAt: string;
}

interface DisputeData {
  id: string;
  dealId: string;
  filerId: string;
  againstId: string;
  disputeType: string;
  reason: string;
  description: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  filer: { id: string; name: string | null; avatar: string | null; profilePhoto: string | null };
  against: { id: string; name: string | null; avatar: string | null; profilePhoto: string | null };
}

interface DisputeScreenProps {
  deal: any;
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  OPENED: 'Open',
  EVIDENCE_SUBMITTED: 'In Review',
  ADMIN_REVIEWING: 'Mediator Reviewing',
  RESOLVED_FILER_WIN: 'Resolved',
  RESOLVED_AGAINST_WIN: 'Resolved',
  RESOLVED_SPLIT: 'Resolved',
  CLOSED: 'Closed',
};

const TYPE_LABEL: Record<string, string> = {
  ITEM_DAMAGED: 'Item Damaged',
  ITEM_LOST: 'Item Lost',
  NOT_DELIVERED: 'Not Delivered',
  WRONG_ITEM: 'Wrong Item',
  FRAUD: 'Fraud',
  OTHER: 'Other',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isResolved(status: string): boolean {
  return status === 'CLOSED' || status.startsWith('RESOLVED_');
}

// ── Component ────────────────────────────────────────────────────────────────

export const DisputeScreen: React.FC<DisputeScreenProps> = ({ deal, onBack }) => {
  const currentUser = useAppStore((s) => s.currentUser);
  const { socket } = useSocket();

  const [dispute, setDispute] = useState<DisputeData | null>(null);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // File-dispute draft state
  const [draftType, setDraftType] = useState<
    'ITEM_DAMAGED' | 'ITEM_LOST' | 'NOT_DELIVERED' | 'WRONG_ITEM' | 'FRAUD' | 'OTHER'
  >('NOT_DELIVERED');
  const [draftReason, setDraftReason] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const readOnly = useMemo(() => (dispute ? isResolved(dispute.status) : false), [dispute]);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const listRes = await apiClient.get<any>(`/disputes?dealId=${deal.id}&limit=1`);
      let d: DisputeData | null = null;
      if (listRes.success) {
        const items = listRes.data?.items || [];
        if (items.length > 0) {
          const detail = await apiClient.get<DisputeData>(`/disputes/${items[0].id}`);
          if (detail.success && detail.data) d = detail.data;
        }
      }
      if (!d) {
        setDispute(null);
        setIsLoading(false);
        return;
      }
      setDispute(d);
      const msgRes = await apiClient.get<{ items: DisputeMessage[] }>(`/disputes/${d.id}/messages?limit=200`);
      if (msgRes.success && msgRes.data?.items) setMessages(msgRes.data.items);
    } catch {
      Alert.alert('Connection error', 'Could not load dispute. Pull to retry.');
    } finally {
      setIsLoading(false);
    }
  }, [deal.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Real-time subscription (chat + status) ─────────────────────────────────
  useEffect(() => {
    if (!socket || !dispute) return;
    socket.emit('join_dispute', dispute.id);

    const onMsg = (m: DisputeMessage) => {
      if (m.disputeId !== dispute.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const onStatus = (payload: { disputeId: string; status: string; resolution?: string }) => {
      if (payload.disputeId !== dispute.id) return;
      setDispute((prev) =>
        prev ? { ...prev, status: payload.status, resolution: payload.resolution ?? prev.resolution } : prev,
      );
    };
    socket.on('dispute_message', onMsg);
    socket.on('dispute_resolved', onStatus);
    socket.on('dispute_escalated', onStatus);

    return () => {
      socket.emit('leave_dispute', dispute.id);
      socket.off('dispute_message', onMsg);
      socket.off('dispute_resolved', onStatus);
      socket.off('dispute_escalated', onStatus);
    };
  }, [socket, dispute]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    const text = message.trim();
    if (!text || isSending || !dispute || readOnly) return;
    setIsSending(true);
    try {
      const res = await apiClient.post<DisputeMessage>(`/disputes/${dispute.id}/messages`, { content: text });
      if (res.success && res.data) {
        setMessages((prev) => (prev.some((x) => x.id === res.data!.id) ? prev : [...prev, res.data!]));
        setMessage('');
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        Alert.alert('Error', res.error || 'Failed to send message');
      }
    } catch {
      Alert.alert('Error', 'Failed to send message');
    }
    setIsSending(false);
  };

  const handleAttachInChat = async () => {
    if (!dispute || readOnly || isAttaching) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];

    setIsAttaching(true);
    try {
      const formData = new FormData();
      const isVideo = asset.type === 'video';
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || (isVideo ? 'attachment.mp4' : 'attachment.jpg'),
        type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
      } as any);
      const res = await apiClient.upload<DisputeMessage>(
        `/disputes/${dispute.id}/messages/attachment`,
        formData,
      );
      if (res.success && res.data) {
        setMessages((prev) => (prev.some((x) => x.id === res.data!.id) ? prev : [...prev, res.data!]));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        Alert.alert('Upload failed', res.error || 'Could not send attachment');
      }
    } catch {
      Alert.alert('Upload failed', 'Could not send attachment');
    }
    setIsAttaching(false);
  };

  const handleCreateDispute = async () => {
    const reason = draftReason.trim();
    if (reason.length < 10) {
      Alert.alert('Reason too short', 'Please describe the issue in at least 10 characters.');
      return;
    }
    if (!deal?.id) {
      Alert.alert('Missing deal', 'Cannot file a dispute without a valid deal.');
      return;
    }
    setIsCreating(true);
    try {
      const res = await apiClient.post<{ id: string }>('/disputes', {
        dealId: deal.id,
        disputeType: draftType,
        reason,
        ...(draftDescription.trim() ? { description: draftDescription.trim() } : {}),
      });
      if (res.success) {
        await fetchAll();
      } else {
        Alert.alert('Could not file dispute', res.error || 'Please try again.');
      }
    } catch {
      Alert.alert('Could not file dispute', 'Network error. Please try again.');
    }
    setIsCreating(false);
  };

  const handleOpenAttachment = (url: string) => {
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url);
      else Alert.alert('Cannot open attachment');
    });
  };

  // ── Render: loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // ── Render: file-dispute form ──────────────────────────────────────────────
  if (!dispute) {
    const TYPE_OPTIONS: Array<{ id: typeof draftType; label: string; hint: string }> = [
      { id: 'NOT_DELIVERED', label: 'Not Delivered', hint: 'Package never arrived' },
      { id: 'ITEM_DAMAGED', label: 'Item Damaged', hint: 'Arrived broken or compromised' },
      { id: 'ITEM_LOST', label: 'Item Lost', hint: 'Package lost in transit' },
      { id: 'WRONG_ITEM', label: 'Wrong Item', hint: 'Different item than agreed' },
      { id: 'FRAUD', label: 'Fraud', hint: 'Suspicious or fraudulent behavior' },
      { id: 'OTHER', label: 'Other', hint: 'Another issue not listed' },
    ];

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <ArrowLeft color={COLORS.background.slate[900]} size={24} />
          </TouchableOpacity>
          <Typography size="lg" weight="bold">File a Dispute</Typography>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <AlertCircle size={18} color={COLORS.primary} />
                <Typography weight="bold" size="md" style={{ marginLeft: 8 }}>Open a new dispute</Typography>
              </View>
              <Typography size="sm" color="#666" style={{ lineHeight: 20 }}>
                Filing a dispute will freeze this deal's escrow. You can chat with the other party here.
              </Typography>
            </View>

            <View style={styles.formCard}>
              <Typography weight="bold" size="md" style={{ marginBottom: 12 }}>What went wrong?</Typography>
              <View style={{ gap: 8 }}>
                {TYPE_OPTIONS.map((opt) => {
                  const selected = draftType === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setDraftType(opt.id)}
                      activeOpacity={0.7}
                      style={[styles.typeOption, selected && styles.typeOptionSelected]}
                    >
                      <View style={[styles.typeRadio, selected && styles.typeRadioSelected]}>
                        {selected ? <View style={styles.typeRadioDot} /> : null}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Typography size="sm" weight="bold">{opt.label}</Typography>
                        <Typography size="xs" color="#666" style={{ marginTop: 2 }}>{opt.hint}</Typography>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formCard}>
              <Typography weight="bold" size="md" style={{ marginBottom: 8 }}>
                Reason <Typography size="xs" color="#999">(required, min 10 chars)</Typography>
              </Typography>
              <TextInput
                value={draftReason}
                onChangeText={setDraftReason}
                placeholder="Briefly explain what happened…"
                placeholderTextColor="#999"
                style={styles.formInput}
                multiline
                maxLength={2000}
              />
              <Typography weight="bold" size="md" style={{ marginTop: 16, marginBottom: 8 }}>
                Additional details <Typography size="xs" color="#999">(optional)</Typography>
              </Typography>
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder="Add any context that may help…"
                placeholderTextColor="#999"
                style={[styles.formInput, { minHeight: 100 }]}
                multiline
                maxLength={5000}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.formFooter}>
          <Button
            label={isCreating ? 'Filing…' : 'File Dispute'}
            onPress={handleCreateDispute}
            disabled={isCreating || draftReason.trim().length < 10}
            style={styles.primaryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: open-dispute chat view ─────────────────────────────────────────
  const statusLabel = STATUS_LABEL[dispute.status] || dispute.status;
  const typeLabel = TYPE_LABEL[dispute.disputeType] || dispute.disputeType;
  const isMine = currentUser?.id === dispute.filerId;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Typography size="lg" weight="bold">Dispute</Typography>
          <Typography size="xs" color="#666">{typeLabel}</Typography>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Small reason/status banner */}
      <View style={styles.reasonBanner}>
        <View style={{ flex: 1 }}>
          <Typography size="xs" color="#666" weight="bold" uppercase tracking={1}>
            {isMine ? 'Your dispute' : 'Filed against you'}
          </Typography>
          <Typography size="sm" color="#0F172A" style={{ marginTop: 2 }} numberOfLines={2}>
            {dispute.reason}
          </Typography>
        </View>
        <View style={[styles.statusPill, isResolved(dispute.status) && styles.statusPillResolved]}>
          <Typography size="xs" weight="bold" color={isResolved(dispute.status) ? '#16a34a' : COLORS.primary}>
            {statusLabel}
          </Typography>
        </View>
      </View>

      {/* Chat */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chatScroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Typography size="sm" color="#999">No messages yet.</Typography>
              <Typography size="xs" color="#bbb" style={{ marginTop: 4 }}>
                Start the conversation with the other party.
              </Typography>
            </View>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser?.id;
              const isSystem = msg.senderRole === 'SYSTEM';
              if (isSystem) {
                return (
                  <View key={msg.id} style={styles.systemMessage}>
                    <Typography size="xs" color="#666" style={{ textAlign: 'center' }}>
                      {msg.content}
                    </Typography>
                  </View>
                );
              }
              return (
                <View key={msg.id} style={isMe ? styles.rowRight : styles.rowLeft}>
                  <View style={isMe ? styles.bubbleRight : styles.bubbleLeft}>
                    {msg.attachmentUrl && msg.attachmentType === 'image' ? (
                      <TouchableOpacity onPress={() => handleOpenAttachment(msg.attachmentUrl!)}>
                        <Image source={{ uri: msg.attachmentUrl }} style={styles.attachmentImage} />
                      </TouchableOpacity>
                    ) : msg.attachmentUrl ? (
                      <TouchableOpacity
                        style={styles.attachmentDoc}
                        onPress={() => handleOpenAttachment(msg.attachmentUrl!)}
                      >
                        {msg.attachmentType === 'video' ? (
                          <VideoIcon size={18} color={isMe ? '#fff' : COLORS.primary} />
                        ) : (
                          <FileText size={18} color={isMe ? '#fff' : COLORS.primary} />
                        )}
                        <Typography
                          size="sm"
                          color={isMe ? '#fff' : '#0F172A'}
                          style={{ marginLeft: 8, flex: 1 }}
                          numberOfLines={1}
                        >
                          {msg.attachmentName || 'Attachment'}
                        </Typography>
                      </TouchableOpacity>
                    ) : null}
                    {msg.content ? (
                      <Typography
                        size="sm"
                        color={isMe ? '#fff' : '#0F172A'}
                        style={{ lineHeight: 20, marginTop: msg.attachmentUrl ? 6 : 0 }}
                      >
                        {msg.content}
                      </Typography>
                    ) : null}
                  </View>
                  <Typography size="xs" color="#999" style={isMe ? styles.timeRight : styles.timeLeft}>
                    {formatTime(msg.createdAt)}
                  </Typography>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={handleAttachInChat}
            disabled={readOnly || isAttaching}
          >
            {isAttaching ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Paperclip size={20} color={readOnly ? '#ccc' : '#666'} />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.composerInput}
            placeholder={readOnly ? 'Dispute is resolved' : 'Type your message…'}
            placeholderTextColor="#999"
            value={message}
            onChangeText={setMessage}
            editable={!readOnly}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (readOnly || !message.trim()) && styles.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={isSending || readOnly || !message.trim()}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send color="#fff" size={16} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: { padding: 4, width: 40, alignItems: 'flex-start' },

  // File-dispute form
  formScroll: { padding: SPACING.md, paddingBottom: 24 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  typeOptionSelected: { borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },
  typeRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  typeRadioSelected: { borderColor: COLORS.primary },
  typeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  formInput: {
    fontSize: 14, color: '#0F172A',
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 80, textAlignVertical: 'top',
  },
  formFooter: {
    padding: SPACING.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: Platform.OS === 'ios' ? 32 : SPACING.md,
  },
  primaryButton: { height: 52, borderRadius: 26, backgroundColor: COLORS.primary },

  // Open-dispute view
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 12,
  },
  statusPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusPillResolved: { backgroundColor: '#dcfce7' },

  // Chat thread
  chatScroll: { padding: SPACING.md, paddingBottom: 8 },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '80%',
  },
  rowLeft: { marginBottom: 12, alignItems: 'flex-start' },
  rowRight: { marginBottom: 12, alignItems: 'flex-end' },
  bubbleLeft: {
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    maxWidth: '80%',
  },
  bubbleRight: {
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: 16,
    borderTopRightRadius: 4,
    maxWidth: '80%',
  },
  timeLeft: { marginTop: 4, marginLeft: 4 },
  timeRight: { marginTop: 4, marginRight: 4 },
  attachmentImage: { width: 200, height: 140, borderRadius: 10, backgroundColor: '#e2e8f0' },
  attachmentDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 8,
    borderRadius: 10,
    minWidth: 180,
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 8,
  },
  attachBtn: { padding: 8 },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
});

export default DisputeScreen;
