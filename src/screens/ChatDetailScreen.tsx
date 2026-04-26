import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    Image,
    Alert,
    ActionSheetIOS } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Avatar } from '../components/Avatar';
import {
    ArrowLeft,
    MoreVertical,
    Send,
    ShieldCheck,
    Star,
    Plus,
    CheckCheck,
    MapPin,
    AlertCircle,
    Info,
    Wallet
} from 'lucide-react-native';
import { chatAPI } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { useUserCurrency } from '../utils/currency';
import { FAKE_MESSAGES } from '../mocks/fakeData';
import AsyncStorage from '@react-native-async-storage/async-storage';
// FIX 19: Use UUID for temp message IDs to prevent collisions
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const { width } = Dimensions.get('window');

// ── Message persistence cache ─────────────────────────────────────────────────
const _memCache = new Map<string, Message[]>();
const CHAT_STORAGE_PREFIX = 'bridger-chat-';
const CACHE_INDEX_KEY = 'chat_cache_index';

// FIX 18: Limits to prevent unbounded cache growth
const MAX_CACHED_MESSAGES_PER_ROOM = 100;
const MAX_TOTAL_CACHE_ROOMS = 20;

interface CacheIndexEntry { roomId: string; lastUpdated: number; messageCount: number; }

async function getCacheIndex(): Promise<CacheIndexEntry[]> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

async function saveCacheIndex(index: CacheIndexEntry[]): Promise<void> {
    try { await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index)); } catch {}
}

async function loadMessages(roomId: string): Promise<Message[] | null> {
    if (_memCache.has(roomId)) return _memCache.get(roomId)!;
    try {
        const raw = await AsyncStorage.getItem(CHAT_STORAGE_PREFIX + roomId);
        if (raw) {
            const msgs: Message[] = JSON.parse(raw);
            _memCache.set(roomId, msgs);
            return msgs;
        }
    } catch {}
    return null;
}

async function saveMessages(roomId: string, msgs: Message[]): Promise<void> {
    // FIX 18: Prune to last MAX_CACHED_MESSAGES_PER_ROOM
    const pruned = msgs.slice(-MAX_CACHED_MESSAGES_PER_ROOM);
    _memCache.set(roomId, pruned);
    try {
        await AsyncStorage.setItem(CHAT_STORAGE_PREFIX + roomId, JSON.stringify(pruned));
    } catch {}

    // Update cache index and evict LRU rooms if over limit
    try {
        let index = await getCacheIndex();
        const existingIdx = index.findIndex((e) => e.roomId === roomId);
        const entry: CacheIndexEntry = { roomId, lastUpdated: Date.now(), messageCount: pruned.length };
        if (existingIdx >= 0) index[existingIdx] = entry;
        else index.push(entry);

        // Evict oldest rooms if over limit
        if (index.length > MAX_TOTAL_CACHE_ROOMS) {
            index.sort((a, b) => a.lastUpdated - b.lastUpdated);
            const toEvict = index.splice(0, index.length - MAX_TOTAL_CACHE_ROOMS);
            for (const e of toEvict) {
                _memCache.delete(e.roomId);
                await AsyncStorage.removeItem(CHAT_STORAGE_PREFIX + e.roomId);
            }
        }
        await saveCacheIndex(index);
    } catch {}
}

interface Message {
    id: string | number;
    text?: string;
    sender: 'me' | 'other';
    time: string;
    type?: 'text' | 'map';
    location?: string;
    address?: string;
    isRead?: boolean;
}

interface ChatDetailScreenProps {
    user: {
        /** Stable ID of the other participant — used for avatar cache keying */
        userId?: string;
        name: string;
        verified?: boolean;
        avatar?: any;
        profilePhoto?: string;
        conversationId?: string;
        phone?: string;
        dealId?: string;
        tripId?: string;
    };
    onBack: () => void;
}

export const ChatDetailScreen: React.FC<ChatDetailScreenProps> = ({ user, onBack }) => {
    const currency = useUserCurrency();
    const currentUser = useAppStore((s) => s.currentUser);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [otherIsTyping, setOtherIsTyping] = useState(false);
    // roomId can be resolved lazily when user starts chatting from a deal (no pre-existing room)
    const [roomId, setRoomId] = useState<string | undefined>(user.conversationId);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const { joinRoom, leaveRoom, onNewMessage, onUserTyping, onUserStopTyping, sendMessage, startTyping, stopTyping, socket, isConnected } = useSocket({
        autoConnect: !!(user.conversationId || user.dealId || user.tripId),
    });

    // Sync roomId when ChatDetailWrapper resolves the conversationId asynchronously
    // (useState init only runs once — this picks up prop changes from the wrapper)
    useEffect(() => {
        if (user.conversationId && user.conversationId !== roomId) {
            setRoomId(user.conversationId);
        }
    }, [user.conversationId]);

    // Helper to convert API message to local Message format
    const mapApiMessage = useCallback((m: any, idx: number): Message => ({
        id: m.id || idx,
        text: m.content || m.text,
        sender: m.senderId === currentUser?.id ? 'me' : 'other',
        time: new Date(m.createdAt || m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text',
        isRead: !!m.readAt,
    }), [currentUser?.id]);

    // Fetch messages on mount — checks persistent cache first, then API
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;

        const load = async () => {
            // Show cached messages immediately while fetching from API
            const cached = await loadMessages(roomId);
            if (cached && cached.length > 0 && !cancelled) {
                setMessages(cached);
            }

            // Always fetch from API to get latest messages
            setIsLoadingMessages(true);
            try {
                const apiMessages: any[] = await chatAPI.getMessages(roomId);
                if (!cancelled && apiMessages && apiMessages.length > 0) {
                    const sorted = [...apiMessages].reverse().map(mapApiMessage);
                    setMessages(sorted);
                    await saveMessages(roomId, sorted);
                }
            } catch {}
            if (!cancelled) setIsLoadingMessages(false);
        };

        load();
        return () => { cancelled = true; };
    }, [roomId, mapApiMessage]);

    // Join socket room and listen for new messages
    useEffect(() => {
        if (!roomId || !isConnected) return;

        joinRoom(roomId);

        return () => {
            leaveRoom(roomId);
        };
    }, [roomId, isConnected, joinRoom, leaveRoom]);

    // Listen for incoming real-time messages
    useEffect(() => {
        if (!roomId || !socket) return;

        const handleNewMessage = (msg: any) => {
            // Only handle messages for this room
            if (msg.chatRoomId !== roomId) return;

            // Skip messages sent by the current user — we already show them
            // optimistically. (The backend broadcasts to ALL including sender.)
            if (msg.senderId === currentUser?.id) return;

            const mapped: Message = {
                id: msg.id || Date.now(),
                text: msg.content || msg.text,
                sender: 'other',
                time: new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: 'text',
                isRead: !!msg.readAt,
            };

            setMessages((prev) => {
                // Deduplicate by id in case of double delivery
                if (prev.some((m) => m.id === mapped.id)) return prev;
                const updated = [...prev, mapped];
                // Persist incoming message so it survives navigation
                saveMessages(roomId, updated);
                return updated;
            });

            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        };

        const cleanup = onNewMessage(handleNewMessage);
        return cleanup;
    }, [roomId, socket, currentUser?.id, onNewMessage]);

    // Typing indicator listeners
    useEffect(() => {
        if (!roomId || !socket) return;
        const cleanupTyping = onUserTyping((data) => {
            if (data.roomId === roomId) {
                setOtherIsTyping(true);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setOtherIsTyping(false), 3000);
            }
        });
        const cleanupStop = onUserStopTyping((data) => {
            if (data.roomId === roomId) {
                setOtherIsTyping(false);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            }
        });
        return () => { cleanupTyping(); cleanupStop(); };
    }, [roomId, socket, onUserTyping, onUserStopTyping]);

    // Fire typing events when user types
    const handleChangeText = (text: string) => {
        setMessage(text);
        if (!roomId || !isConnected) return;
        if (text.length > 0) {
            startTyping(roomId);
        } else {
            stopTyping(roomId);
        }
    };

    const handleSend = async () => {
        if (message.trim() === '') return;

        const textToSend = message.trim();
        setMessage('');

        // Resolve room FIRST — so optimistic cache goes to the right key
        let activeRoomId = roomId;
        if (!activeRoomId && (user.dealId || user.tripId)) {
            try {
                if (user.tripId) {
                    activeRoomId = await chatAPI.getOrCreateRoom(user.tripId, 'trip');
                } else {
                    activeRoomId = await chatAPI.getOrCreateRoom(user.dealId!);
                }
                setRoomId(activeRoomId);
                if (isConnected) joinRoom(activeRoomId);
            } catch {
                // Can't create room — show message locally only
            }
        }

        // FIX 19: Use UUID for temp IDs — Date.now() can collide within the same millisecond
        const tempId = `temp-${uuidv4()}`;
        const optimistic: Message = {
            id: tempId as any,
            text: textToSend,
            sender: 'me',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text',
            isRead: false,
        };
        setMessages((prev) => {
            const updated = [...prev, optimistic];
            // Persist to cache using the resolved room key
            if (activeRoomId) saveMessages(activeRoomId, updated);
            return updated;
        });
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

        if (!activeRoomId) {
            // No deal attached and no room — local-only / demo mode
            return;
        }

        if (isConnected && socket) {
            // Path A: send via WebSocket — backend saves to DB and broadcasts to room
            // Our own new_message echo is filtered out in the listener above.
            sendMessage(activeRoomId, textToSend);
        } else {
            // Path B: WebSocket unavailable — fall back to HTTP REST
            try {
                const result = await chatAPI.sendMessage(activeRoomId, textToSend);
                // FIX 19: Replace temp ID with real server-confirmed ID
                if (result.messageId) {
                    setMessages((prev) =>
                        prev.map((m) => m.id === tempId ? { ...m, id: result.messageId } : m)
                    );
                }
            } catch {
                // Keep the optimistic message — user can see their text even if save failed
            }
        }
    };

    const renderMessage = (msg: Message) => {
        const isMe = msg.sender === 'me';

        return (
            <View key={msg.id} style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
                {!isMe && (
                    <Avatar
                        userId={user.userId}
                        uri={user.avatar || user.profilePhoto}
                        name={user.name}
                        size={32}
                        style={styles.inlineAvatar}
                        accessibilityLabel={`${user.name}'s avatar`}
                    />
                )}

                <View style={[styles.messageContent, isMe ? styles.myMessageContent : styles.otherMessageContent]}>
                    {msg.type === 'map' ? (
                        <View style={styles.mapCard}>
                            <Image
                                source={require('../../assets/map_placeholder.png')}
                                style={styles.mapImage}
                            />
                            <View style={styles.mapDetails}>
                                <Typography weight="bold" size="sm">{msg.location}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>{msg.address}</Typography>
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
                            <Typography
                                size="sm"
                                color={isMe ? COLORS.white : COLORS.background.slate[900]}
                                style={{ lineHeight: 20 }}
                            >
                                {msg.text}
                            </Typography>
                        </View>
                    )}

                    <View style={styles.messageFooter}>
                        <Typography size="xs" color={COLORS.background.slate[400]}>{msg.time}</Typography>
                        {isMe && (
                            <CheckCheck
                                size={14}
                                color={msg.isRead ? COLORS.primary : COLORS.background.slate[300]}
                                style={{ marginLeft: 4 }}
                            />
                        )}
                    </View>
                </View>

                {isMe && (
                    <Avatar
                        userId={currentUser?.id}
                        uri={currentUser?.profilePhoto || currentUser?.avatar}
                        name={currentUser?.name || ''}
                        size={32}
                        style={styles.inlineAvatar}
                        accessibilityLabel="Your avatar"
                    />
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>

                <View style={styles.headerUserInfo}>
                    <Avatar
                        userId={user.userId}
                        uri={user.avatar || user.profilePhoto}
                        name={user.name}
                        size={44}
                        style={styles.headerAvatar}
                        accessibilityLabel={`${user.name}'s profile picture`}
                    />
                    <View>
                        <View style={styles.nameRow}>
                            <Typography weight="bold" size="md">{user.name}</Typography>
                            {user.verified && (
                                <ShieldCheck color={COLORS.primary} size={16} fill={COLORS.primary} style={{ marginLeft: 4 }} />
                            )}
                        </View>
                        <Typography size="xs" color={COLORS.background.slate[400]}>Online</Typography>
                    </View>
                </View>

                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerIconButton} onPress={() => {
                        if (Platform.OS === 'ios') {
                            ActionSheetIOS.showActionSheetWithOptions(
                                { options: ['Cancel', 'Block User', 'Report', 'Clear Chat'], destructiveButtonIndex: 1, cancelButtonIndex: 0 },
                                (idx) => {
                                    if (idx === 1) Alert.alert('Blocked', `${user.name} has been blocked.`);
                                    if (idx === 2) Alert.alert('Reported', 'Report submitted. Our team will review it.');
                                    if (idx === 3) setMessages([]);
                                }
                            );
                        } else {
                            Alert.alert('Options', 'Choose an action', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Block User', style: 'destructive', onPress: () => Alert.alert('Blocked', `${user.name} has been blocked.`) },
                                { text: 'Report', onPress: () => Alert.alert('Reported', 'Report submitted.') },
                                { text: 'Clear Chat', onPress: () => setMessages([]) },
                            ]);
                        }
                    }}>
                        <MoreVertical color={COLORS.background.slate[700]} size={22} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Context Info Section */}
            <View style={styles.contextInfo}>
                <View style={styles.routePill}>
                    <Typography weight="bold" color={COLORS.primary} size="xs" style={styles.routeText}>
                        LHR   →   JFK
                    </Typography>
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <View style={styles.statMain}>
                            <Typography weight="bold" size="lg">4.9</Typography>
                            <Star size={14} color="#FBBF24" fill="#FBBF24" style={{ marginLeft: 4 }} />
                        </View>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.statLabel}>RATING</Typography>
                    </View>

                    <View style={styles.statCard}>
                        <Typography weight="bold" size="lg" color={COLORS.primary}>Verified</Typography>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.statLabel}>BADGE</Typography>
                    </View>
                </View>
            </View>

            {/* Chat Area */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardView}
            >
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollContent}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
                >
                    <View style={styles.dateSeparator}>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.dateText}>
                            YESTERDAY
                        </Typography>
                    </View>

                    {messages.length === 0 && !isLoadingMessages && (
                        <View style={styles.emptyState}>
                            <Typography size="sm" color={COLORS.background.slate[400]} style={{ textAlign: 'center' }}>
                                Start a conversation with {user.name}. You can discuss pickup details, pricing, and package info.
                            </Typography>
                        </View>
                    )}

                    {messages.map(renderMessage)}

                    {otherIsTyping && (
                        <View style={[styles.messageRow, styles.otherMessageRow]}>
                            <Avatar
                                userId={user.userId}
                                uri={user.avatar || user.profilePhoto}
                                name={user.name}
                                size={32}
                                style={styles.inlineAvatar}
                                accessibilityLabel={`${user.name}'s avatar`}
                            />
                            <View style={[styles.bubble, styles.otherBubble, styles.typingBubble]}>
                                <Typography size="sm" color={COLORS.background.slate[500]}>typing…</Typography>
                            </View>
                        </View>
                    )}
                </ScrollView>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <TouchableOpacity
                        style={[styles.quickActionButton, styles.offerButton]}
                        onPress={() => {
                            Alert.prompt
                                ? Alert.prompt(
                                    'Send Offer',
                                    `Enter your price offer (${currency.code}):`,
                                    (price) => {
                                        if (price && !isNaN(Number(price))) {
                                            const offerMsg = `💰 Offer: ${currency.symbol}${price} — I'd like to handle this shipment for ${currency.symbol}${price}. Let me know if this works for you!`;
                                            setMessage(offerMsg);
                                        }
                                    },
                                    'plain-text',
                                    '',
                                    'numeric'
                                )
                                : Alert.alert('Send Offer', 'Enter your price offer', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: `${currency.symbol}50`, onPress: () => setMessage(`💰 Offer: ${currency.symbol}50 — I'd like to handle this shipment for ${currency.symbol}50.`) },
                                    { text: `${currency.symbol}100`, onPress: () => setMessage(`💰 Offer: ${currency.symbol}100 — I'd like to handle this shipment for ${currency.symbol}100.`) },
                                    { text: `${currency.symbol}150`, onPress: () => setMessage(`💰 Offer: ${currency.symbol}150 — I'd like to handle this shipment for ${currency.symbol}150.`) },
                                ]);
                        }}
                    >
                        <Wallet size={16} color={COLORS.white} />
                        <Typography weight="bold" color={COLORS.white} size="xs" style={{ marginLeft: 6 }}>Send Offer</Typography>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.quickActionButton, styles.infoButton]}
                        onPress={() => {
                            const infoMsg = '📦 Could you share more details? (package dimensions, fragility, special handling needed)';
                            setMessage(infoMsg);
                        }}
                    >
                        <Info size={16} color={COLORS.primary} />
                        <Typography weight="bold" color={COLORS.primary} size="xs" style={{ marginLeft: 6 }}>Request Info</Typography>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.quickActionButton, styles.reportButton]}
                        onPress={() => {
                            Alert.alert(
                                'Report User',
                                `Why are you reporting ${user.name}?`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Spam / Scam', onPress: () => Alert.alert('Reported', 'Thank you. Our team will review this report within 24 hours.') },
                                    { text: 'Inappropriate content', onPress: () => Alert.alert('Reported', 'Thank you. Our team will review this report within 24 hours.') },
                                    { text: 'Fake listing', onPress: () => Alert.alert('Reported', 'Thank you. Our team will review this report within 24 hours.') },
                                ]
                            );
                        }}
                    >
                        <AlertCircle size={16} color="#EF4444" />
                        <Typography weight="bold" color="#EF4444" size="xs" style={{ marginLeft: 6 }}>Report</Typography>
                    </TouchableOpacity>
                </View>

                {/* Input Area */}
                <View style={styles.inputArea}>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => {
                            Alert.alert('Attach', 'Choose attachment type', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: '📷 Photo', onPress: () => setMessage('📷 [Photo attached]') },
                                { text: '📍 Location', onPress: () => setMessage('📍 My pickup location: ') },
                                { text: '📄 Document', onPress: () => setMessage('📄 [Document attached]') },
                            ]);
                        }}
                    >
                        <Plus color={COLORS.background.slate[600]} size={24} />
                    </TouchableOpacity>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="Type a message..."
                            placeholderTextColor={COLORS.background.slate[400]}
                            value={message}
                            onChangeText={handleChangeText}
                            multiline
                        />
                        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
                            <Send color={COLORS.white} size={20} fill={COLORS.white} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        backgroundColor: COLORS.white,
    },
    backButton: {
        marginRight: SPACING.sm,
    },
    headerUserInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    headerIconButton: {
        padding: 4,
    },
    contextInfo: {
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[50],
    },
    routePill: {
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        paddingVertical: 10,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#EDF2F7',
    },
    routeText: {
        letterSpacing: 1,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EDF2F7',
    },
    statMain: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statLabel: {
        marginTop: 4,
        letterSpacing: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        padding: SPACING.lg,
        paddingBottom: 20,
    },
    dateSeparator: {
        alignItems: 'center',
        marginVertical: 20,
    },
    dateText: {
        backgroundColor: '#F1F5F9', // Light blue-grey background for date
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        letterSpacing: 1,
    },
    emptyState: {
        paddingHorizontal: 32,
        paddingVertical: 40,
        alignItems: 'center',
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 20,
        alignItems: 'flex-end',
    },
    myMessageRow: {
        justifyContent: 'flex-end',
    },
    otherMessageRow: {
        justifyContent: 'flex-start',
    },
    inlineAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginHorizontal: 8,
    },
    messageContent: {
        maxWidth: width * 0.7,
    },
    myMessageContent: {
        alignItems: 'flex-end',
    },
    otherMessageContent: {
        alignItems: 'flex-start',
    },
    bubble: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
    },
    myBubble: {
        backgroundColor: COLORS.primary,
        borderBottomRightRadius: 4,
    },
    otherBubble: {
        backgroundColor: '#F1F5F9',
        borderBottomLeftRadius: 4,
    },
    typingBubble: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: 0.7,
    },
    mapCard: {
        backgroundColor: '#F1F5F9',
        borderRadius: 20,
        overflow: 'hidden',
        width: width * 0.65,
    },
    mapImage: {
        width: '100%',
        height: 140,
        resizeMode: 'cover',
    },
    mapDetails: {
        padding: 12,
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        paddingHorizontal: 4,
    },
    quickActions: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 12,
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    quickActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    offerButton: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    infoButton: {
        backgroundColor: '#F0F9FF',
        borderColor: '#E0F2FE',
    },
    reportButton: {
        backgroundColor: '#FEF2F2',
        borderColor: '#FEE2E2',
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 12,
        gap: 12,
        backgroundColor: COLORS.white,
    },
    addButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 25,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: COLORS.background.slate[900],
        maxHeight: 100,
        paddingVertical: 8,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
});
