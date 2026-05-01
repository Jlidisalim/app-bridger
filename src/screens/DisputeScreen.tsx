// File Dispute Management — comprehensive view.
//
// Loads the dispute by dealId (or creates one on demand if a `disputeId`
// param is later passed). Renders:
//  • Dispute info dashboard (type, claimant, respondent, status, SLA)
//  • Evidence list (with thumbnails / download links) + Add Evidence picker
//  • Real-time conversation thread with text + file attachments
//  • Server-driven chronological timeline
//
// All persistence happens server-side via /disputes/* endpoints.  A websocket
// listener subscribes to the dispute room so messages, evidence and status
// changes from the other party (or admin) appear instantly without refresh.

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
  MoreHorizontal,
  CheckCircle2,
  Clock,
  Paperclip,
  Send,
  Info,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  AlertCircle,
  Download,
} from 'lucide-react-native';
import apiClient from '../services/api/client';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';
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

interface DisputeEvidence {
  id: string;
  uploaderId: string;
  type: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'TEXT';
  url: string | null;
  content: string | null;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  actorRole: 'FILER' | 'AGAINST' | 'ADMIN' | 'SYSTEM';
  description: string;
  metadata: Record<string, unknown> | null;
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
  slaDeadline: string;
  progress: number;
  createdAt: string;
  filer: { id: string; name: string | null; avatar: string | null; profilePhoto: string | null };
  against: { id: string; name: string | null; avatar: string | null; profilePhoto: string | null };
  evidences: DisputeEvidence[];
}

interface DisputeScreenProps {
  deal: any;
  onBack: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  OPENED: 'Opened',
  EVIDENCE_SUBMITTED: 'Evidence Submitted',
  ADMIN_REVIEWING: 'Admin Reviewing',
  RESOLVED_FILER_WIN: 'Resolved — Filer',
  RESOLVED_AGAINST_WIN: 'Resolved — Respondent',
  RESOLVED_SPLIT: 'Resolved — Split',
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isResolved(status: string): boolean {
  return status === 'CLOSED' || status.startsWith('RESOLVED_');
}

function timelineIcon(eventType: string) {
  if (eventType === 'OPENED') return CheckCircle2;
  if (eventType === 'EVIDENCE_ADDED') return FileText;
  if (eventType === 'MESSAGE_SENT') return Info;
  if (eventType === 'ESCALATED' || eventType === 'ADMIN_REVIEWING') return AlertCircle;
  if (eventType === 'EVIDENCE_SUBMITTED') return CheckCircle2;
  if (eventType === 'RESOLVED' || eventType === 'CLOSED') return CheckCircle2;
  return Clock;
}

// ── Component ────────────────────────────────────────────────────────────────

export const DisputeScreen: React.FC<DisputeScreenProps> = ({ deal, onBack }) => {
  const currency = useUserCurrency();
  const currentUser = useAppStore((s) => s.currentUser);
  const { socket } = useSocket();

  const [dispute, setDispute] = useState<DisputeData | null>(null);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Creation form state — used when no dispute exists on this deal yet
  const [draftType, setDraftType] = useState<
    'ITEM_DAMAGED' | 'ITEM_LOST' | 'NOT_DELIVERED' | 'WRONG_ITEM' | 'FRAUD' | 'OTHER'
  >('NOT_DELIVERED');
  const [draftReason, setDraftReason] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const readOnly = useMemo(() => (dispute ? isResolved(dispute.status) : false), [dispute]);
  const otherParty = useMemo(() => {
    if (!dispute || !currentUser) return null;
    return dispute.filerId === currentUser.id ? dispute.against : dispute.filer;
  }, [dispute, currentUser]);

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

      const [msgRes, tlRes] = await Promise.all([
        apiClient.get<{ items: DisputeMessage[] }>(`/disputes/${d.id}/messages?limit=200`),
        apiClient.get<{ items: TimelineEvent[] }>(`/disputes/${d.id}/timeline`),
      ]);

      if (msgRes.success && msgRes.data?.items) setMessages(msgRes.data.items);
      if (tlRes.success && tlRes.data?.items) setTimeline(tlRes.data.items);
    } catch {
      // Surface a single Alert rather than crashing the whole screen
      Alert.alert('Connection error', 'Could not load dispute. Pull to retry.');
    } finally {
      setIsLoading(false);
    }
  }, [deal.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Real-time subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !dispute) return;
    socket.emit('join_dispute', dispute.id);

    const onMsg = (m: DisputeMessage) => {
      if (m.disputeId !== dispute.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const onEvidence = (payload: { disputeId: string; evidence: DisputeEvidence; status: string }) => {
      if (payload.disputeId !== dispute.id) return;
      setDispute((prev) =>
        prev
          ? {
              ...prev,
              status: payload.status,
              evidences: prev.evidences.some((e) => e.id === payload.evidence.id)
                ? prev.evidences
                : [...prev.evidences, payload.evidence],
            }
          : prev,
      );
      // Refresh timeline for the new evidence event
      apiClient
        .get<{ items: TimelineEvent[] }>(`/disputes/${dispute.id}/timeline`)
        .then((r) => r.success && r.data?.items && setTimeline(r.data.items))
        .catch(() => {});
    };
    const onStatus = (payload: { disputeId: string; status: string; outcome?: string; resolution?: string }) => {
      if (payload.disputeId !== dispute.id) return;
      setDispute((prev) =>
        prev ? { ...prev, status: payload.status, resolution: payload.resolution ?? prev.resolution } : prev,
      );
      apiClient
        .get<{ items: TimelineEvent[] }>(`/disputes/${dispute.id}/timeline`)
        .then((r) => r.success && r.data?.items && setTimeline(r.data.items))
        .catch(() => {});
    };

    socket.on('dispute_message', onMsg);
    socket.on('dispute_evidence_added', onEvidence);
    socket.on('dispute_resolved', onStatus);
    socket.on('dispute_escalated', onStatus);

    return () => {
      socket.emit('leave_dispute', dispute.id);
      socket.off('dispute_message', onMsg);
      socket.off('dispute_evidence_added', onEvidence);
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
      const res = await apiClient.post<DisputeMessage>(`/disputes/${dispute.id}/messages`, {
        content: text,
      });
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

  const handleUploadEvidence = async () => {
    if (!dispute) {
      Alert.alert('No dispute', 'Open a dispute on this deal first to add evidence.');
      return;
    }
    if (readOnly) {
      Alert.alert('Resolved', 'This dispute is resolved — evidence cannot be added.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    setIsUploading(true);
    let okCount = 0;
    try {
      for (const asset of result.assets) {
        const formData = new FormData();
        const isVideo = asset.type === 'video';
        formData.append('file', {
          uri: asset.uri,
          name: asset.fileName || (isVideo ? 'evidence.mp4' : 'evidence.jpg'),
          type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        } as any);
        const res = await apiClient.upload<{ evidence: DisputeEvidence; status: string }>(
          `/disputes/${dispute.id}/evidence/upload`,
          formData,
        );
        if (res.success) okCount += 1;
      }
      if (okCount > 0) {
        Alert.alert('Evidence uploaded', `${okCount} file(s) uploaded successfully.`);
        await fetchAll();
      } else {
        Alert.alert('Upload failed', 'No files were uploaded.');
      }
    } catch {
      Alert.alert('Upload failed', 'Could not upload evidence. Please try again.');
    }
    setIsUploading(false);
  };

  const handleEscalate = async () => {
    if (!dispute || readOnly || isEscalating) return;
    Alert.alert(
      'Contact Mediator',
      'Escalate this dispute to a Bridger mediator? They will review within 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Escalate',
          style: 'default',
          onPress: async () => {
            setIsEscalating(true);
            try {
              const res = await apiClient.post<{ success: boolean }>(`/disputes/${dispute.id}/mediator`, {});
              if (res.success) {
                Alert.alert('Escalated', 'A mediator has been notified.');
                await fetchAll();
              } else {
                Alert.alert('Error', res.error || 'Could not escalate');
              }
            } catch {
              Alert.alert('Error', 'Could not escalate');
            }
            setIsEscalating(false);
          },
        },
      ],
    );
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
      else Alert.alert('Cannot open', 'This file cannot be opened on this device.');
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 12 }}>
          Loading dispute…
        </Typography>
      </SafeAreaView>
    );
  }

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
          <TouchableOpacity onPress={onBack} style={styles.iconButton}>
            <ArrowLeft color={COLORS.background.slate[900]} size={24} />
          </TouchableOpacity>
          <Typography weight="bold" size="lg" style={styles.headerTitle}>
            File a Dispute
          </Typography>
          <View style={styles.iconButton} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <AlertCircle size={20} color="#1E3A8A" />
                <Typography weight="bold" size="lg" color="#0F172A" style={{ marginLeft: 8 }}>
                  Open a new dispute
                </Typography>
              </View>
              <Typography size="sm" color={COLORS.background.slate[600]} style={{ lineHeight: 20 }}>
                Filing a dispute will freeze this deal&apos;s escrow until a Bridger mediator reviews
                the case. You have 72 hours to add evidence.
              </Typography>
            </View>

            <View style={styles.card}>
              <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 12 }}>
                What went wrong?
              </Typography>
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
                        <Typography size="sm" weight="bold" color="#0F172A">
                          {opt.label}
                        </Typography>
                        <Typography
                          size="xs"
                          color={COLORS.background.slate[500]}
                          style={{ marginTop: 2 }}
                        >
                          {opt.hint}
                        </Typography>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 12 }}>
                Reason <Typography size="xs" color={COLORS.background.slate[500]}>(required, min 10 chars)</Typography>
              </Typography>
              <TextInput
                value={draftReason}
                onChangeText={setDraftReason}
                placeholder="Briefly explain what happened…"
                placeholderTextColor={COLORS.background.slate[400]}
                style={styles.formInput}
                multiline
                maxLength={2000}
              />

              <Typography
                weight="bold"
                size="lg"
                color="#0F172A"
                style={{ marginTop: 20, marginBottom: 12 }}
              >
                Additional details <Typography size="xs" color={COLORS.background.slate[500]}>(optional)</Typography>
              </Typography>
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder="Add any context that may help the mediator…"
                placeholderTextColor={COLORS.background.slate[400]}
                style={[styles.formInput, { minHeight: 100 }]}
                multiline
                maxLength={5000}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={onBack}
            disabled={isCreating}
            style={styles.secondaryButton}
          />
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

  const status = dispute.status;
  const progressPct = Math.max(10, dispute.progress || 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography weight="bold" size="lg" style={styles.headerTitle}>
          Dispute #{dispute.id.slice(-4).toUpperCase()}
        </Typography>
        <TouchableOpacity style={styles.iconButton}>
          <MoreHorizontal color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Card */}
          <View style={styles.card}>
            <View style={styles.statusHeader}>
              <Typography weight="bold" size="xl" color="#0F172A">
                Dispute Status
              </Typography>
              <View style={styles.statusBadge}>
                <Typography size="xs" weight="bold" color="#1E3A8A">
                  {STATUS_LABEL[status] || status.replace(/_/g, ' ')}
                </Typography>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <Typography weight="bold" size="sm" color="#0F172A" style={{ marginLeft: 12 }}>
                {Math.round(progressPct)}%
              </Typography>
            </View>

            <Typography size="sm" color={COLORS.background.slate[600]} style={styles.statusDesc}>
              {readOnly
                ? `This dispute is closed. ${dispute.resolution ?? ''}`
                : status === 'ADMIN_REVIEWING'
                ? 'A Bridger mediator is reviewing the evidence. Resolution expected within 24 hours.'
                : status === 'EVIDENCE_SUBMITTED'
                ? 'Evidence has been submitted. Waiting for the other party to respond.'
                : `Add supporting evidence and use the conversation below. SLA: ${formatDateTime(
                    dispute.slaDeadline,
                  )}.`}
            </Typography>
          </View>

          {/* Dispute Info Dashboard */}
          <View style={styles.card}>
            <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 16 }}>
              Dispute Details
            </Typography>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Type
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {TYPE_LABEL[dispute.disputeType] || dispute.disputeType}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Filed
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {formatDateTime(dispute.createdAt)}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Claimant
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {dispute.filer.name || 'Filer'}
                  {currentUser?.id === dispute.filerId ? ' (you)' : ''}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Respondent
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {dispute.against.name || 'Respondent'}
                  {currentUser?.id === dispute.againstId ? ' (you)' : ''}
                </Typography>
              </View>
            </View>

            <View style={[styles.reasonBox, { marginTop: 20 }]}>
              <Typography size="xs" color={COLORS.background.slate[500]}>
                Reason
              </Typography>
              <Typography size="sm" color="#0F172A" style={{ marginTop: 4, lineHeight: 20 }}>
                {dispute.reason}
              </Typography>
              {dispute.description ? (
                <Typography
                  size="sm"
                  color={COLORS.background.slate[600]}
                  style={{ marginTop: 8, lineHeight: 20 }}
                >
                  {dispute.description}
                </Typography>
              ) : null}
            </View>
          </View>

          {/* Evidence Card */}
          <View style={styles.card}>
            <View style={styles.evidenceHeader}>
              <Typography weight="bold" size="lg" color="#0F172A">
                Evidence ({dispute.evidences.length})
              </Typography>
              {!readOnly ? (
                <TouchableOpacity
                  onPress={handleUploadEvidence}
                  disabled={isUploading}
                  style={styles.evidenceAddBtn}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#1E3A8A" />
                  ) : (
                    <>
                      <Paperclip size={14} color="#1E3A8A" />
                      <Typography size="xs" weight="bold" color="#1E3A8A" style={{ marginLeft: 4 }}>
                        Add
                      </Typography>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {dispute.evidences.length === 0 ? (
              <Typography size="sm" color={COLORS.background.slate[400]} style={{ marginTop: 8 }}>
                No evidence submitted yet.
              </Typography>
            ) : (
              <View style={styles.evidenceList}>
                {dispute.evidences.map((ev) => (
                  <TouchableOpacity
                    key={ev.id}
                    style={styles.evidenceItem}
                    activeOpacity={0.7}
                    onPress={() => ev.url && handleOpenAttachment(ev.url)}
                  >
                    {ev.type === 'PHOTO' && ev.url ? (
                      <Image source={{ uri: ev.url }} style={styles.evidenceThumb} />
                    ) : (
                      <View style={[styles.evidenceThumb, styles.evidenceThumbIcon]}>
                        {ev.type === 'VIDEO' ? (
                          <VideoIcon size={20} color="#1E3A8A" />
                        ) : ev.type === 'DOCUMENT' ? (
                          <FileText size={20} color="#1E3A8A" />
                        ) : (
                          <ImageIcon size={20} color="#1E3A8A" />
                        )}
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Typography size="sm" weight="medium" color="#0F172A" numberOfLines={1}>
                        {ev.fileName || ev.content || ev.type}
                      </Typography>
                      <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>
                        {ev.uploaderId === dispute.filerId ? 'Claimant' : 'Respondent'} •{' '}
                        {formatDateTime(ev.createdAt)}
                      </Typography>
                    </View>
                    {ev.url ? <Download size={16} color={COLORS.background.slate[400]} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Timeline */}
          <View style={styles.card}>
            <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 20 }}>
              Dispute Timeline
            </Typography>

            {timeline.length === 0 ? (
              <Typography size="sm" color={COLORS.background.slate[400]}>
                No events yet.
              </Typography>
            ) : (
              <View style={styles.timelineContainer}>
                {timeline.map((ev, idx) => {
                  const Icon = timelineIcon(ev.eventType);
                  const isLast = idx === timeline.length - 1;
                  const isResolution = ev.eventType === 'RESOLVED' || ev.eventType === 'CLOSED';
                  return (
                    <View key={ev.id} style={[styles.timelineItem, isLast && { paddingBottom: 0 }]}>
                      <View style={styles.timelineLeft}>
                        <View
                          style={[
                            styles.completedIcon,
                            isResolution && { backgroundColor: '#10B981' },
                          ]}
                        >
                          <Icon size={14} color={COLORS.white} />
                        </View>
                        {!isLast ? <View style={styles.connectorActive} /> : null}
                      </View>
                      <View style={styles.timelineRight}>
                        <Typography weight="bold" size="sm" color="#0F172A">
                          {ev.description}
                        </Typography>
                        <Typography
                          size="xs"
                          color={COLORS.background.slate[500]}
                          style={{ marginTop: 2 }}
                        >
                          {formatDateTime(ev.createdAt)}
                        </Typography>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Shipment summary */}
          <View style={styles.card}>
            <Typography weight="bold" size="lg" color="#0F172A" style={{ marginBottom: 16 }}>
              Shipment Details
            </Typography>

            <View style={styles.shipmentSummary}>
              <View style={styles.boxImagePlaceholder}>
                <View style={styles.boxSim} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Typography weight="bold" size="sm" color="#0F172A">
                  {deal.package?.category || deal.title || deal.name || 'Shipment'}
                </Typography>
                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>
                  Tracking: {deal.id?.slice(0, 12) || 'N/A'}
                </Typography>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Origin
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {deal.route?.from || deal.fromCity || 'N/A'}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Destination
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {deal.route?.to || deal.toCity || 'N/A'}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Carrier
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {deal.travelerName || dispute.against.name || 'Bridger Traveler'}
                </Typography>
              </View>
              <View style={styles.detailItem}>
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Value
                </Typography>
                <Typography size="sm" weight="medium" color="#0F172A" style={{ marginTop: 4 }}>
                  {currency.symbol}
                  {deal.pricing?.amount ?? deal.price ?? 0}
                </Typography>
              </View>
            </View>
          </View>

          {/* Conversation */}
          <View style={[styles.card, styles.chatCard]}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderLeft}>
                <View style={styles.supportAvatar}>
                  <Image
                    source={require('../../assets/favicon.png')}
                    style={{ width: 20, height: 20, tintColor: COLORS.white }}
                  />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Typography weight="bold" size="sm" color="#0F172A">
                    {otherParty?.name || 'Conversation'}
                  </Typography>
                  <View style={styles.onlineStatusRow}>
                    <View style={styles.onlineDot} />
                    <Typography size="xs" color="#10B981" style={{ marginLeft: 4 }}>
                      Dispute thread
                    </Typography>
                  </View>
                </View>
              </View>
              <Info size={20} color={COLORS.background.slate[400]} />
            </View>

            <View style={styles.chatArea}>
              {messages.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Typography size="sm" color={COLORS.background.slate[400]}>
                    No messages yet.
                  </Typography>
                </View>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser?.id;
                  const isSystem = msg.senderRole === 'SYSTEM';
                  const time = formatDateTime(msg.createdAt);

                  if (isSystem) {
                    return (
                      <View key={msg.id} style={styles.systemMessageRow}>
                        <Typography size="xs" color={COLORS.background.slate[500]} style={{ textAlign: 'center' }}>
                          {msg.content}
                        </Typography>
                      </View>
                    );
                  }

                  return (
                    <View key={msg.id} style={isMe ? styles.messageRowRight : styles.messageRowLeft}>
                      <View style={isMe ? styles.messageBubbleRight : styles.messageBubbleLeft}>
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
                              <VideoIcon size={20} color={isMe ? COLORS.white : '#1E3A8A'} />
                            ) : (
                              <FileText size={20} color={isMe ? COLORS.white : '#1E3A8A'} />
                            )}
                            <Typography
                              size="sm"
                              weight="medium"
                              color={isMe ? COLORS.white : '#0F172A'}
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
                            color={isMe ? COLORS.white : '#334155'}
                            style={{ lineHeight: 20, marginTop: msg.attachmentUrl ? 8 : 0 }}
                          >
                            {msg.content}
                          </Typography>
                        ) : null}
                      </View>
                      <Typography
                        size="xs"
                        color={COLORS.background.slate[400]}
                        style={isMe ? styles.messageTimeRight : styles.messageTimeLeft}
                      >
                        {time}
                      </Typography>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.chatInputContainer}>
              <TouchableOpacity
                style={styles.attachButton}
                onPress={handleAttachInChat}
                disabled={readOnly || isAttaching}
              >
                {isAttaching ? (
                  <ActivityIndicator size="small" color={COLORS.background.slate[500]} />
                ) : (
                  <Paperclip size={20} color={readOnly ? COLORS.background.slate[300] : COLORS.background.slate[500]} />
                )}
              </TouchableOpacity>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder={readOnly ? 'Dispute is resolved' : 'Type your message…'}
                  placeholderTextColor={COLORS.background.slate[400]}
                  value={message}
                  onChangeText={setMessage}
                  editable={!readOnly}
                  multiline
                />
              </View>
              <TouchableOpacity
                style={[styles.sendButton, (readOnly || !message.trim()) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={isSending || readOnly || !message.trim()}
              >
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

      <View style={styles.footer}>
        <Button
          label={isUploading ? 'Uploading…' : 'Add Evidence'}
          variant="outline"
          onPress={handleUploadEvidence}
          disabled={isUploading || readOnly}
          style={styles.secondaryButton}
        />
        <Button
          label={isEscalating ? 'Escalating…' : 'Contact Mediator'}
          onPress={handleEscalate}
          disabled={isEscalating || readOnly || dispute.status === 'ADMIN_REVIEWING'}
          style={styles.primaryButton}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    backgroundColor: '#F3F4F6',
  },
  iconButton: { padding: 4, width: 32 },
  headerTitle: { color: '#0F172A', textAlign: 'center' },
  scrollContent: { padding: SPACING.xl, gap: 16, paddingBottom: 40 },
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
  chatCard: { padding: 0, overflow: 'hidden' },
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
  progressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  progressBarBg: { flex: 1, height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1E3A8A', borderRadius: 4 },
  statusDesc: { lineHeight: 20 },
  reasonBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 14,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  evidenceAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  evidenceList: { gap: 10, marginTop: 6 },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
  },
  evidenceThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#E2E8F0' },
  evidenceThumbIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  timelineContainer: { paddingLeft: 4 },
  timelineItem: { flexDirection: 'row', paddingBottom: 20 },
  timelineLeft: { alignItems: 'center', width: 32 },
  completedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  connectorActive: { width: 2, flex: 1, backgroundColor: '#1E3A8A', marginVertical: -8 },
  timelineRight: { flex: 1, marginLeft: 12, paddingTop: 2 },
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
    backgroundColor: '#F3E8C1',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boxSim: {
    width: 40,
    height: 30,
    backgroundColor: '#D4B886',
    borderTopWidth: 10,
    borderTopColor: '#C4A876',
    borderRadius: 4,
    marginTop: 10,
  },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 },
  detailItem: { width: '50%' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  supportAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  chatArea: { padding: 20, paddingBottom: 10 },
  systemMessageRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 12,
  },
  messageRowLeft: { marginBottom: 16, alignItems: 'flex-start' },
  messageBubbleLeft: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    maxWidth: '85%',
  },
  messageTimeLeft: { marginTop: 6, marginLeft: 4 },
  messageRowRight: { marginBottom: 16, alignItems: 'flex-end' },
  messageBubbleRight: {
    backgroundColor: '#1E3A8A',
    padding: 12,
    borderRadius: 20,
    borderTopRightRadius: 4,
    maxWidth: '85%',
  },
  messageTimeRight: { marginTop: 6, marginRight: 4 },
  attachmentImage: { width: 220, height: 160, borderRadius: 12, backgroundColor: '#E2E8F0' },
  attachmentDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 10,
    borderRadius: 12,
    minWidth: 200,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: COLORS.white,
  },
  attachButton: { padding: 10, marginLeft: -10 },
  inputWrapper: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  textInput: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0F172A', padding: 0 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#94A3B8' },
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
  primaryButton: { flex: 1, height: 56, borderRadius: 28, backgroundColor: '#1E3A8A' },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: COLORS.white,
  },
  typeOptionSelected: {
    borderColor: '#1E3A8A',
    backgroundColor: '#EEF2FF',
  },
  typeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeRadioSelected: { borderColor: '#1E3A8A' },
  typeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E3A8A' },
  formInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
