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
    ActionSheetIOS,
    ActivityIndicator,
    Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Avatar } from '../components/Avatar';
import { ReportUserModal } from '../components/ReportUserModal';
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
    Wallet,
    Ban
} from 'lucide-react-native';
import { chatAPI, userModerationAPI } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { useUserCurrency } from '../utils/currency';
import { FAKE_MESSAGES } from '../mocks/fakeData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
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
    type?: 'text' | 'map' | 'image';
    location?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    imageUrl?: string;
    isRead?: boolean;
    pending?: boolean;
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
    const { joinRoom, leaveRoom, onNewMessage, onUserTyping, onUserStopTyping, sendMessage, sendStructuredMessage, startTyping, stopTyping, socket, isConnected } = useSocket({
        autoConnect: !!(user.conversationId || user.dealId || user.tripId),
    });

    // Block + report state
    const [blockedByMe, setBlockedByMe] = useState(false);
    const [blockedByThem, setBlockedByThem] = useState(false);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isSharingLocation, setIsSharingLocation] = useState(false);
    const isBlocked = blockedByMe || blockedByThem;

    // Sync roomId when ChatDetailWrapper resolves the conversationId asynchronously
    // (useState init only runs once — this picks up prop changes from the wrapper)
    useEffect(() => {
        if (user.conversationId && user.conversationId !== roomId) {
            setRoomId(user.conversationId);
        }
    }, [user.conversationId]);

    // Helper to convert API message to local Message format
    const mapApiMessage = useCallback((m: any, idx: number): Message => {
        const apiType = (m.type || 'TEXT').toUpperCase();
        let localType: Message['type'] = 'text';
        if (apiType === 'IMAGE') localType = 'image';
        else if (apiType === 'LOCATION') localType = 'map';
        return {
            id: m.id || idx,
            text: m.content || m.text,
            sender: m.senderId === currentUser?.id ? 'me' : 'other',
            time: new Date(m.createdAt || m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: localType,
            imageUrl: m.imageUrl,
            latitude: typeof m.latitude === 'number' ? m.latitude : undefined,
            longitude: typeof m.longitude === 'number' ? m.longitude : undefined,
            address: m.address,
            location: m.address,
            isRead: !!m.readAt,
        };
    }, [currentUser?.id]);

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

    // Load block status whenever the other user changes
    useEffect(() => {
        if (!user.userId) return;
        let cancelled = false;
        (async () => {
            try {
                const status = await userModerationAPI.getBlockStatus(user.userId!);
                if (!cancelled) {
                    setBlockedByMe(status.blockedByMe);
                    setBlockedByThem(status.blockedByThem);
                }
            } catch {
                // Non-fatal — assume not blocked, send will fail loudly if backend rejects
            }
        })();
        return () => { cancelled = true; };
    }, [user.userId]);

    const handleBlockUser = useCallback(() => {
        if (!user.userId) {
            Alert.alert('Cannot block', 'This conversation has no linked user account.');
            return;
        }
        Alert.alert(
            blockedByMe ? `Unblock ${user.name}?` : `Block ${user.name}?`,
            blockedByMe
                ? 'You will be able to send and receive messages with this user again.'
                : 'You will no longer be able to send or receive messages with this user.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: blockedByMe ? 'Unblock' : 'Block',
                    style: blockedByMe ? 'default' : 'destructive',
                    onPress: async () => {
                        try {
                            const res = blockedByMe
                                ? await userModerationAPI.unblockUser(user.userId!)
                                : await userModerationAPI.blockUser(user.userId!);
                            if (res.success) {
                                setBlockedByMe(!blockedByMe);
                                Alert.alert(
                                    blockedByMe ? 'Unblocked' : 'Blocked',
                                    blockedByMe
                                        ? `You can now message ${user.name} again.`
                                        : `${user.name} can no longer send you messages.`,
                                );
                            } else {
                                Alert.alert('Could not update', res.error || 'Please try again.');
                            }
                        } catch (e: any) {
                            Alert.alert('Could not update', e?.message || 'Please try again.');
                        }
                    },
                },
            ],
        );
    }, [blockedByMe, user.userId, user.name]);

    const openReportModal = useCallback(() => {
        if (!user.userId) {
            Alert.alert('Cannot report', 'This conversation has no linked user account.');
            return;
        }
        setReportModalVisible(true);
    }, [user.userId]);

    // Listen for incoming real-time messages
    useEffect(() => {
        if (!roomId || !socket) return;

        const handleNewMessage = (msg: any) => {
            // Only handle messages for this room
            if (msg.chatRoomId !== roomId) return;

            // Skip messages sent by the current user — we already show them
            // optimistically. (The backend broadcasts to ALL including sender.)
            if (msg.senderId === currentUser?.id) return;

            const apiType = (msg.type || 'TEXT').toUpperCase();
            let localType: Message['type'] = 'text';
            if (apiType === 'IMAGE') localType = 'image';
            else if (apiType === 'LOCATION') localType = 'map';

            const mapped: Message = {
                id: msg.id || Date.now(),
                text: msg.content || msg.text,
                sender: 'other',
                time: new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: localType,
                imageUrl: msg.imageUrl,
                latitude: typeof msg.latitude === 'number' ? msg.latitude : undefined,
                longitude: typeof msg.longitude === 'number' ? msg.longitude : undefined,
                address: msg.address,
                location: msg.address,
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
        if (isBlocked) {
            Alert.alert(
                blockedByMe ? 'You blocked this user' : 'You can’t reply',
                blockedByMe
                    ? 'Unblock them from the menu to start messaging again.'
                    : 'You are no longer able to message this user.',
            );
            return;
        }

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
                if (!result.success && result.error) {
                    // Surface block / permission errors back to the user
                    Alert.alert('Could not send', result.error);
                    setMessages((prev) => prev.filter((m) => m.id !== tempId));
                    return;
                }
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

    // Resolve (or create) the room for attachments — shared by image + location senders.
    const resolveActiveRoomId = useCallback(async (): Promise<string | undefined> => {
        if (roomId) return roomId;
        if (!user.dealId && !user.tripId) return undefined;
        try {
            const id = user.tripId
                ? await chatAPI.getOrCreateRoom(user.tripId, 'trip')
                : await chatAPI.getOrCreateRoom(user.dealId!);
            setRoomId(id);
            if (isConnected) joinRoom(id);
            return id;
        } catch {
            return undefined;
        }
    }, [roomId, user.dealId, user.tripId, isConnected, joinRoom]);

    const handlePickImage = async () => {
        if (isBlocked) {
            Alert.alert('Messaging blocked', 'You can’t send attachments to this user.');
            return;
        }
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission needed', 'Please allow photo library access to attach images.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'] as ImagePicker.MediaType[],
                allowsMultipleSelection: false,
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await sendImageAttachment(asset.uri, asset.mimeType || 'image/jpeg');
        } catch (e: any) {
            Alert.alert('Could not attach image', e?.message || 'Please try again.');
        }
    };

    const sendImageAttachment = async (uri: string, mimeType: string) => {
        const activeRoomId = await resolveActiveRoomId();
        if (!activeRoomId) {
            Alert.alert('No conversation', 'This conversation isn’t linked to a deal or trip yet.');
            return;
        }
        const tempId = `temp-${uuidv4()}`;
        const optimistic: Message = {
            id: tempId as any,
            sender: 'me',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'image',
            imageUrl: uri,
            pending: true,
        };
        setMessages((prev) => {
            const updated = [...prev, optimistic];
            saveMessages(activeRoomId, updated);
            return updated;
        });
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

        setIsUploadingImage(true);
        try {
            const url = await chatAPI.uploadImage(uri, mimeType);
            const placeholder = '[Photo]';
            // Replace optimistic with uploaded URL
            setMessages((prev) =>
                prev.map((m) => m.id === tempId ? { ...m, imageUrl: url, pending: true } : m)
            );

            if (isConnected && socket) {
                sendStructuredMessage({
                    roomId: activeRoomId,
                    content: placeholder,
                    type: 'IMAGE',
                    imageUrl: url,
                });
                // Drop pending flag after a brief moment — server echo will arrive shortly
                setTimeout(() => {
                    setMessages((prev) =>
                        prev.map((m) => m.id === tempId ? { ...m, pending: false } : m)
                    );
                }, 200);
            } else {
                const res = await chatAPI.sendStructuredMessage(activeRoomId, {
                    content: placeholder,
                    type: 'IMAGE',
                    imageUrl: url,
                });
                if (!res.success) {
                    Alert.alert('Could not send', res.error || 'Please try again.');
                    setMessages((prev) => prev.filter((m) => m.id !== tempId));
                    return;
                }
                if (res.messageId) {
                    setMessages((prev) =>
                        prev.map((m) => m.id === tempId ? { ...m, id: res.messageId, pending: false } : m)
                    );
                }
            }
        } catch (e: any) {
            Alert.alert('Upload failed', e?.message || 'Could not upload image.');
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleShareLocation = async () => {
        if (isBlocked) {
            Alert.alert('Messaging blocked', 'You can’t share your location with this user.');
            return;
        }
        try {
            setIsSharingLocation(true);
            const perm = await Location.requestForegroundPermissionsAsync();
            if (perm.status !== 'granted') {
                Alert.alert('Permission needed', 'Please allow location access to share your current position.');
                return;
            }
            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            const { latitude, longitude } = pos.coords;

            // Reverse-geocode for a friendly address — best-effort
            let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            try {
                const places = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (places && places.length > 0) {
                    const p = places[0];
                    const parts = [p.name, p.street, p.city, p.region, p.country].filter(Boolean);
                    if (parts.length > 0) address = parts.join(', ');
                }
            } catch { /* keep coord-only address */ }

            await sendLocationMessage(latitude, longitude, address);
        } catch (e: any) {
            Alert.alert('Could not share location', e?.message || 'Please try again.');
        } finally {
            setIsSharingLocation(false);
        }
    };

    const sendLocationMessage = async (latitude: number, longitude: number, address: string) => {
        const activeRoomId = await resolveActiveRoomId();
        if (!activeRoomId) {
            Alert.alert('No conversation', 'This conversation isn’t linked to a deal or trip yet.');
            return;
        }
        const tempId = `temp-${uuidv4()}`;
        const optimistic: Message = {
            id: tempId as any,
            sender: 'me',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'map',
            latitude,
            longitude,
            address,
            location: address,
            text: '📍 Shared location',
        };
        setMessages((prev) => {
            const updated = [...prev, optimistic];
            saveMessages(activeRoomId, updated);
            return updated;
        });
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

        const payload = {
            roomId: activeRoomId,
            content: `📍 ${address}`,
            type: 'LOCATION' as const,
            latitude,
            longitude,
            address,
        };
        if (isConnected && socket) {
            sendStructuredMessage(payload);
        } else {
            const res = await chatAPI.sendStructuredMessage(activeRoomId, {
                content: `📍 ${address}`,
                type: 'LOCATION',
                latitude,
                longitude,
                address,
            });
            if (!res.success) {
                Alert.alert('Could not send', res.error || 'Please try again.');
                setMessages((prev) => prev.filter((m) => m.id !== tempId));
                return;
            }
            if (res.messageId) {
                setMessages((prev) =>
                    prev.map((m) => m.id === tempId ? { ...m, id: res.messageId } : m)
                );
            }
        }
    };

    const openMapForLocation = (lat?: number, lng?: number) => {
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const url = Platform.select({
            ios: `http://maps.apple.com/?ll=${lat},${lng}&q=Shared+location`,
            android: `geo:${lat},${lng}?q=${lat},${lng}(Shared+location)`,
            default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        }) as string;
        Linking.openURL(url).catch(() => {
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
        });
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
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => openMapForLocation(msg.latitude, msg.longitude)}
                            style={styles.mapCard}
                        >
                            <Image
                                source={require('../../assets/map_placeholder.png')}
                                style={styles.mapImage}
                            />
                            <View style={styles.mapDetails}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MapPin size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
                                    <Typography weight="bold" size="sm">Shared location</Typography>
                                </View>
                                {!!msg.address && (
                                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 2 }}>
                                        {msg.address}
                                    </Typography>
                                )}
                            </View>
                        </TouchableOpacity>
                    ) : msg.type === 'image' && msg.imageUrl ? (
                        <View style={styles.imageBubble}>
                            <Image
                                source={{ uri: msg.imageUrl }}
                                style={styles.attachedImage}
                                resizeMode="cover"
                            />
                            {msg.pending && (
                                <View style={styles.imageOverlay}>
                                    <ActivityIndicator color={COLORS.white} />
                                </View>
                            )}
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
                    <TouchableOpacity
                        style={styles.headerIconButton}
                        accessibilityLabel="More options"
                        onPress={() => {
                            const blockLabel = blockedByMe ? 'Unblock User' : 'Block User';
                            if (Platform.OS === 'ios') {
                                ActionSheetIOS.showActionSheetWithOptions(
                                    {
                                        options: ['Cancel', blockLabel, 'Report User', 'Clear Chat'],
                                        destructiveButtonIndex: blockedByMe ? undefined : 1,
                                        cancelButtonIndex: 0,
                                    },
                                    (idx) => {
                                        if (idx === 1) handleBlockUser();
                                        if (idx === 2) openReportModal();
                                        if (idx === 3) {
                                            setMessages([]);
                                            if (roomId) saveMessages(roomId, []);
                                        }
                                    },
                                );
                            } else {
                                Alert.alert('Options', 'Choose an action', [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: blockLabel,
                                        style: blockedByMe ? 'default' : 'destructive',
                                        onPress: handleBlockUser,
                                    },
                                    { text: 'Report User', onPress: openReportModal },
                                    {
                                        text: 'Clear Chat',
                                        onPress: () => {
                                            setMessages([]);
                                            if (roomId) saveMessages(roomId, []);
                                        },
                                    },
                                ]);
                            }
                        }}
                    >
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
                        onPress={openReportModal}
                        accessibilityLabel="Report user"
                    >
                        <AlertCircle size={16} color="#EF4444" />
                        <Typography weight="bold" color="#EF4444" size="xs" style={{ marginLeft: 6 }}>Report</Typography>
                    </TouchableOpacity>
                </View>

                {/* Block banner — replaces input area when blocked */}
                {isBlocked && (
                    <View style={styles.blockedBanner}>
                        <Ban size={16} color="#B91C1C" />
                        <Typography size="xs" weight="bold" color="#B91C1C" style={{ marginLeft: 8, flex: 1 }}>
                            {blockedByMe
                                ? `You blocked ${user.name}. Unblock from the menu to message again.`
                                : `${user.name} is unavailable. You can’t exchange messages.`}
                        </Typography>
                    </View>
                )}

                {/* Bottom Report link — secondary entry point per requirement */}
                <TouchableOpacity
                    style={styles.bottomReportLink}
                    onPress={openReportModal}
                    accessibilityLabel="Report this conversation"
                >
                    <AlertCircle size={12} color={COLORS.background.slate[500]} />
                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginLeft: 6 }}>
                        Something wrong? <Typography size="xs" color="#EF4444" weight="bold">Report this conversation</Typography>
                    </Typography>
                </TouchableOpacity>

                {/* Input Area */}
                <View style={styles.inputArea}>
                    <TouchableOpacity
                        style={[styles.addButton, (isBlocked || isUploadingImage || isSharingLocation) && styles.addButtonDisabled]}
                        disabled={isBlocked || isUploadingImage || isSharingLocation}
                        accessibilityLabel="Attach photo or location"
                        onPress={() => {
                            const options: any[] = [
                                { text: 'Cancel', style: 'cancel' },
                                { text: '📷 Photo', onPress: handlePickImage },
                                { text: '📍 Share Location', onPress: handleShareLocation },
                            ];
                            if (Platform.OS === 'ios') {
                                ActionSheetIOS.showActionSheetWithOptions(
                                    {
                                        options: ['Cancel', 'Photo', 'Share Location'],
                                        cancelButtonIndex: 0,
                                    },
                                    (idx) => {
                                        if (idx === 1) handlePickImage();
                                        if (idx === 2) handleShareLocation();
                                    },
                                );
                            } else {
                                Alert.alert('Attach', 'Choose attachment type', options);
                            }
                        }}
                    >
                        {isUploadingImage || isSharingLocation ? (
                            <ActivityIndicator color={COLORS.background.slate[600]} />
                        ) : (
                            <Plus color={COLORS.background.slate[600]} size={24} />
                        )}
                    </TouchableOpacity>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder={isBlocked ? 'Messaging is blocked' : 'Type a message...'}
                            placeholderTextColor={COLORS.background.slate[400]}
                            value={message}
                            onChangeText={handleChangeText}
                            multiline
                            editable={!isBlocked}
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, isBlocked && styles.sendButtonDisabled]}
                            onPress={handleSend}
                            disabled={isBlocked}
                            accessibilityLabel="Send message"
                        >
                            <Send color={COLORS.white} size={20} fill={COLORS.white} />
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {user.userId && (
                <ReportUserModal
                    visible={reportModalVisible}
                    reportedUserId={user.userId}
                    reportedUserName={user.name}
                    chatRoomId={roomId}
                    onSubmitted={() => setReportModalVisible(false)}
                    onDismiss={() => setReportModalVisible(false)}
                />
            )}
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
    sendButtonDisabled: {
        opacity: 0.4,
    },
    addButtonDisabled: {
        opacity: 0.4,
    },
    imageBubble: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F1F5F9',
        maxWidth: width * 0.65,
        position: 'relative',
    },
    attachedImage: {
        width: width * 0.6,
        height: width * 0.6,
    },
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    blockedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: SPACING.lg,
        marginTop: 4,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: RADIUS.lg,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    bottomReportLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: SPACING.lg,
    },
});
