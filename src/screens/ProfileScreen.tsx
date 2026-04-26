import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Dimensions,
    Alert,
    Linking,
    Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useAppStore } from '../store/useAppStore';
import {
    User,
    UserCircle,
    ShieldCheck,
    Star,
    ChevronRight,
    Bell,
    Lock,
    CreditCard,
    HelpCircle,
    FileText,
    LogOut,
    Home,
    Search as ExploreIcon,
    Plus,
    MessageCircle,
    Wallet
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface ProfileScreenProps {
    onHome: () => void;
    onExplore: () => void;
    onCreate: () => void;
    onMessages: () => void;
    onProfile: () => void;
    onWallet: () => void;
    onSettings?: () => void;
    onEditProfile?: () => void;
    onHelp?: () => void;
    onNotifications?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onHome, onExplore, onCreate, onMessages, onProfile, onWallet, onSettings, onEditProfile, onHelp, onNotifications }) => {
    const logout = useAppStore((s) => s.logout);
    const user = useAppStore((s) => s.currentUser);

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: () => logout(),
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Profile Header */}
                <View style={styles.header}>
                    <View style={styles.avatarWrapper}>
                        {(user?.profilePhoto || user?.avatar) ? (
                            <Image
                                source={{ uri: user.profilePhoto || user.avatar }}
                                style={styles.avatar}
                            />
                        ) : (
                            <View style={styles.avatar}>
                                <User color={COLORS.primary} size={48} />
                            </View>
                        )}
                        <View style={styles.verifiedBadge}>
                            <ShieldCheck color={COLORS.white} size={16} />
                        </View>
                    </View>
                    <Typography size="2xl" weight="bold">{user?.name || 'User'}</Typography>
                    <Typography weight="bold" color={COLORS.primary} style={styles.roleText}>{user?.verified ? 'Verified' : 'Not Verified'}</Typography>
                    <Typography size="xs" color={COLORS.background.slate[400]}>Member since {user?.memberSince ? new Date(user.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}</Typography>
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Typography size="lg" weight="bold" color={COLORS.primary}>{user?.completionRate ?? 0}%</Typography>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>Completion</Typography>
                    </View>
                    <View style={styles.statCard}>
                        <Typography size="lg" weight="bold" color={COLORS.primary}>{user?.totalDeals ?? 0}</Typography>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>Total Deals</Typography>
                    </View>
                    <View style={styles.statCard}>
                        <View style={styles.ratingRow}>
                            <Typography size="lg" weight="bold" color={COLORS.primary}>{user?.rating?.toFixed(1) || '0.0'}</Typography>
                            <Star color={COLORS.primary} size={14} fill={COLORS.primary} />
                        </View>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>Avg Rating</Typography>
                    </View>
                </View>

                {/* Settings List */}
                <View style={styles.section}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase tracking={2} style={styles.sectionTitle}>
                        Account Settings
                    </Typography>
                    <View style={styles.listCard}>
                        <TouchableOpacity style={styles.listItem} onPress={onEditProfile}>
                            <User color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Personal Information</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.listItem} onPress={onSettings}>
                            <ShieldCheck color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Verification Status</Typography>
                            <View style={styles.verifiedTag}>
                                <Typography size="xs" weight="bold" color="#15803d">VERIFIED</Typography>
                            </View>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.listItem} onPress={onWallet}>
                            <Wallet color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Wallet & Payments</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.listItem} onPress={onNotifications}>
                            <Bell color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Notifications</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.listItem, styles.lastItem]} onPress={onSettings}>
                            <Lock color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Privacy & Security</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Support Section */}
                <View style={styles.section}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase tracking={2} style={styles.sectionTitle}>
                        Support & About
                    </Typography>
                    <View style={styles.listCard}>
                        <TouchableOpacity style={styles.listItem} onPress={onHelp}>
                            <HelpCircle color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Help Center</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.listItem, styles.lastItem]} onPress={() => Linking.openURL('https://bridger.app/terms')}>
                            <FileText color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Terms of Service</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <LogOut color={COLORS.error} size={20} />
                    <Typography weight="bold" color={COLORS.error}>Logout</Typography>
                </TouchableOpacity>

                <Typography align="center" size="xs" color={COLORS.background.slate[400]} style={styles.versionText}>
                    Version 2.4.1 (Build 82)
                </Typography>

                <View style={{ height: 120 }} />
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
                    <MessageCircle size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} weight="bold">Messages</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={onProfile} style={styles.tabItem}>
                    <UserCircle size={24} color={COLORS.primary} />
                    <Typography size="xs" color={COLORS.primary} weight="bold">Profile</Typography>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    scrollContent: {
        paddingTop: SPACING.xxl,
    },
    header: {
        alignItems: 'center',
        marginBottom: SPACING.xxl,
    },
    avatarWrapper: {
        position: 'relative',
        marginBottom: SPACING.lg,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: `${COLORS.primary}0D`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: `${COLORS.primary}1A`,
        overflow: 'hidden',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: COLORS.white,
    },
    roleText: {
        marginTop: 4,
    },
    statsGrid: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.xl,
        gap: 12,
        marginBottom: SPACING.xxl,
    },
    statCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        padding: SPACING.lg,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: `${COLORS.primary}08`,
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    section: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    sectionTitle: {
        marginLeft: 4,
        marginBottom: 12,
    },
    listCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: `${COLORS.primary}08`,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.lg,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: `${COLORS.primary}08`,
    },
    lastItem: {
        borderBottomWidth: 0,
    },
    flex1: {
        flex: 1,
    },
    verifiedTag: {
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 4,
    },
    logoutBtn: {
        marginHorizontal: SPACING.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.lg,
        backgroundColor: '#fef2f2',
        borderRadius: RADIUS.xl,
        gap: 12,
        borderWidth: 1,
        borderColor: '#fee2e2',
        marginTop: SPACING.lg,
    },
    versionText: {
        marginTop: 24,
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
