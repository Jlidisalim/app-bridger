import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    Search,
    MoreVertical,
    ChevronRight,
    ShieldCheck,
    User,
    UserCircle,
    Home,
    Search as ExploreIcon,
    Plus,
    MessageCircle,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { Avatar } from '../components/Avatar';

interface MessagesScreenProps {
    onBack: () => void;
    onHome: () => void;
    onExplore: () => void;
    onCreate: () => void;
    onMessages: () => void;
    onProfile: () => void;
    onSelectChat: (user: { name: string; verified?: boolean; conversationId?: string; phone?: string; dealId?: string; avatar?: string; userId?: string }) => void;
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ onBack, onHome, onExplore, onCreate, onMessages, onProfile, onSelectChat }) => {
    const [search, setSearch] = useState('');
    const { conversations, fetchConversations, isLoading, currentUser } = useAppStore();
    const { socket } = useSocket();

    useFocusEffect(
        useCallback(() => {
            fetchConversations();
        }, [fetchConversations])
    );

    // Real-time: refresh conversation list when a new message arrives or conversations change
    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchConversations();
        socket.on('conversations_updated', refresh);
        socket.on('new_message', refresh);
        return () => {
            socket.off('conversations_updated', refresh);
            socket.off('new_message', refresh);
        };
    }, [socket, fetchConversations]);

    const chats = conversations.map((c: any, i: number) => {
        // Find the other participant (not the current user) from the participants array
        const otherParticipant = Array.isArray(c.participants)
            ? c.participants.find((p: any) => p.id !== currentUser?.id) || c.participants[0]
            : null;

        return {
            id: c.id || i,
            conversationId: c.id,
            dealId: c.dealId,
            // Support both backend shape (participants[]) and fake-data shape (user.name)
            name: c.user?.name || otherParticipant?.name || c.name || 'User',
            verified: c.user?.verified ?? otherParticipant?.verified ?? true,
            active: c.user?.active ?? (c.unreadCount || 0) > 0,
            // Stable user ID — required for avatar cache subscriptions
            userId: c.user?.id || otherParticipant?.id,
            // Use profilePhoto with fallback to avatar, from the other participant
            avatar: c.user?.profilePhoto || c.user?.avatar
                || otherParticipant?.profilePhoto || otherParticipant?.avatar,
            // Support both backend shape (lastMessage.content) and fake-data shape (string)
            message: typeof c.lastMessage === 'string'
                ? c.lastMessage
                : c.lastMessage?.content || 'No messages yet',
            time: c.lastMessageTime || (c.lastMessage?.createdAt
                ? new Date(c.lastMessage.createdAt).toLocaleDateString()
                : ''),
            isSystem: c.isSystem || false,
        };
    });

    const filtered = search.trim()
        ? chats.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        : chats;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <Typography size="2xl" weight="bold">Messages</Typography>
                <TouchableOpacity style={styles.moreBtn}>
                    <MoreVertical color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
                <View style={styles.searchWrapper}>
                    <Search color={COLORS.background.slate[400]} size={20} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search conversations..."
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {isLoading && conversations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MessageCircle color={COLORS.background.slate[300]} size={56} />
                        <Typography size="lg" weight="bold" color={COLORS.background.slate[500]} style={{ marginTop: 16, textAlign: 'center' }}>
                            No conversations yet
                        </Typography>
                        <Typography size="sm" color={COLORS.background.slate[400]} style={{ marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
                            Start chatting by tapping "Message" on a deal in the Home or Explore screen.
                        </Typography>
                    </View>
                ) : (
                    filtered.map((chat) => (
                        <TouchableOpacity
                            key={chat.id}
                            style={styles.chatItem}
                            onPress={() => onSelectChat({ name: chat.name, verified: chat.verified, conversationId: chat.conversationId, dealId: chat.dealId, avatar: chat.avatar, userId: chat.userId })}
                        >
                            <View style={styles.avatarContainer}>
                                <Avatar
                                    userId={chat.userId}
                                    uri={chat.avatar}
                                    name={chat.name}
                                    size={56}
                                    style={{ borderWidth: 1, borderColor: COLORS.background.slate[100] }}
                                    accessibilityLabel={`${chat.name}'s avatar`}
                                />
                                {chat.active && <View style={styles.activeDot} />}
                                {chat.verified && <View style={styles.verifiedBadge}><ShieldCheck color={COLORS.white} size={8} /></View>}
                            </View>

                            <View style={styles.chatContent}>
                                <View style={styles.chatHeader}>
                                    <Typography weight="bold" style={styles.flex1}>{chat.name}</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[400]}>{chat.time}</Typography>
                                </View>
                                <Typography size="sm" color={COLORS.background.slate[500]} numberOfLines={1} style={styles.messageText}>
                                    {chat.message}
                                </Typography>
                            </View>
                            <ChevronRight color={COLORS.background.slate[200]} size={20} />
                        </TouchableOpacity>
                    ))
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom Tab Bar */}
            <View style={styles.tabBar}>
                <TouchableOpacity onPress={onHome} style={styles.tabItem}>
                    <Home size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} weight="bold">Home</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={onExplore} style={styles.tabItem}>
                    <ExploreIcon size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]}>Explore</Typography>
                </TouchableOpacity>
                <View style={styles.tabItem}>
                    <TouchableOpacity onPress={onCreate} style={styles.createPulseButton}>
                        <Plus size={28} color={COLORS.white} />
                    </TouchableOpacity>
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 32 }}>Create</Typography>
                </View>
                <TouchableOpacity onPress={onMessages} style={styles.tabItem}>
                    <MessageCircle size={24} color={COLORS.primary} />
                    <Typography size="xs" color={COLORS.primary} weight="bold">Messages</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={onProfile} style={styles.tabItem}>
                    <UserCircle size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} weight="bold">Profile</Typography>
                </TouchableOpacity>
            </View>
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
    },
    moreBtn: {
        padding: 4,
    },
    searchSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.lg,
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg,
        height: 52,
        gap: 12,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: COLORS.background.slate[900],
        padding: 0,
    },
    scrollContent: {
        flexGrow: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[50],
        gap: 16,
    },
    avatarContainer: {
        position: 'relative',
    },
    activeDot: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: COLORS.white,
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: COLORS.white,
    },
    chatContent: {
        flex: 1,
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    flex1: {
        flex: 1,
    },
    messageText: {
        lineHeight: 20,
    },
    tabBar: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: 90,
        backgroundColor: COLORS.white,
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 10,
        paddingBottom: 25,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createPulseButton: {
        position: 'absolute',
        top: -30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 5,
        borderColor: COLORS.white,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
});
