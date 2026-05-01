import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Dimensions,
    Alert,
    Linking,
    Image,
    Modal,
    TextInput,
    ActivityIndicator,
    Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useAppStore } from '../store/useAppStore';
import { userApi } from '../services/api/index';
import apiClient from '../services/api/client';
import {
    User,
    UserCircle,
    ShieldCheck,
    ShieldAlert,
    Star,
    ChevronRight,
    Bell,
    Lock,
    HelpCircle,
    FileText,
    LogOut,
    Home,
    Search as ExploreIcon,
    Plus,
    MessageCircle,
    Wallet,
    ExternalLink,
    Trash2,
    AlertTriangle,
    ScrollText,
    X,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Public legal-document URLs.  Served by the backend (see backend/public/) but
// can be overridden per environment via EXPO_PUBLIC_LEGAL_BASE_URL.
const LEGAL_BASE_URL =
    process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.replace(/\/$/, '') ||
    'https://bridger.app/legal';
const TERMS_URL = `${LEGAL_BASE_URL}/terms.html`;
const PRIVACY_URL = `${LEGAL_BASE_URL}/privacy.html`;

const DELETE_CONFIRMATION_PHRASE = 'DELETE';

type VerificationLevel = 'verified' | 'pending' | 'unverified' | 'rejected';

function deriveVerification(user: any): { level: VerificationLevel; label: string } {
    const kyc = (user?.kycStatus || '').toString().toUpperCase();
    const face = (user?.faceVerificationStatus || '').toString().toUpperCase();
    if (user?.verified || kyc === 'APPROVED' || face === 'VERIFIED') {
        return { level: 'verified', label: 'VERIFIED' };
    }
    if (kyc === 'REJECTED' || face === 'FAILED') {
        return { level: 'rejected', label: 'REJECTED' };
    }
    if (kyc === 'SUBMITTED' || kyc === 'PENDING_REVIEW' || face === 'PENDING') {
        return { level: 'pending', label: 'IN REVIEW' };
    }
    return { level: 'unverified', label: 'UNVERIFIED' };
}

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
    const setCurrentUser = useAppStore((s) => s.setCurrentUser);
    const deals = useAppStore((s) => s.deals);
    const fetchDeals = useAppStore((s) => s.fetchDeals);

    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<{ completionRate: number; totalDeals: number; rating: number } | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletePhrase, setDeletePhrase] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Fetch authoritative stats on mount and whenever the screen regains focus.
    const refreshProfile = useCallback(async () => {
        setRefreshing(true);
        try {
            const [profile, statsResult] = await Promise.all([
                userApi.getProfile(),
                userApi.getStats(),
            ]);
            if (profile.success && profile.data) {
                setCurrentUser({ ...(user as any), ...profile.data });
            }
            if (statsResult.success && statsResult.data) {
                const s: any = statsResult.data;
                setStats({
                    completionRate: typeof s.completionRate === 'number'
                        ? s.completionRate
                        : (s.completedDeals && s.totalDeals
                            ? Math.round((s.completedDeals / s.totalDeals) * 100)
                            : (profile.data as any)?.completionRate ?? 0),
                    totalDeals: typeof s.totalDeals === 'number' ? s.totalDeals : (profile.data as any)?.totalDeals ?? 0,
                    rating: typeof s.rating === 'number' ? s.rating : (profile.data as any)?.rating ?? 0,
                });
            }
            // Pull deals so the locally derived completion fallback stays current.
            fetchDeals().catch(() => {});
        } catch {
            // non-critical — keep current values
        } finally {
            setRefreshing(false);
        }
    }, [setCurrentUser, fetchDeals, user]);

    useEffect(() => {
        refreshProfile();
        // Intentionally run once on mount; the dependency would re-fire on every user change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Local fallback derivation from the deals list if the backend stats
    // endpoint is unreachable — keeps the UI honest in offline mode.
    const localStats = useMemo(() => {
        const myId = user?.id;
        if (!myId) return null;
        const mine = deals.filter((d: any) => d.senderId === myId || d.travelerId === myId);
        const completed = mine.filter((d: any) => d.status === 'COMPLETED').length;
        const total = mine.length;
        return {
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
            totalDeals: total,
        };
    }, [deals, user?.id]);

    const completionRate = stats?.completionRate ?? user?.completionRate ?? localStats?.completionRate ?? 0;
    const totalDeals = stats?.totalDeals ?? user?.totalDeals ?? localStats?.totalDeals ?? 0;
    const rating = stats?.rating ?? user?.rating ?? 0;

    const verification = useMemo(() => deriveVerification(user), [user]);

    const verificationStyle = useMemo(() => {
        switch (verification.level) {
            case 'verified': return { bg: '#f0fdf4', fg: '#15803d', Icon: ShieldCheck };
            case 'pending':  return { bg: '#fef3c7', fg: '#b45309', Icon: ShieldAlert };
            case 'rejected': return { bg: '#fee2e2', fg: '#b91c1c', Icon: ShieldAlert };
            default:         return { bg: '#e2e8f0', fg: '#475569', Icon: ShieldAlert };
        }
    }, [verification.level]);
    const VerificationIcon = verificationStyle.Icon;

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

    const openLegal = useCallback(async (url: string) => {
        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Cannot open link', `Unable to open ${url} on this device.`);
                return;
            }
            await Linking.openURL(url);
        } catch {
            Alert.alert('Cannot open link', 'Please try again later.');
        }
    }, []);

    const resetDeleteState = () => {
        setDeletePhrase('');
        setDeletePassword('');
        setDeleteAcknowledged(false);
        setDeleteError(null);
        setDeleteSubmitting(false);
    };

    const closeDeleteModal = () => {
        if (deleteSubmitting) return;
        setDeleteOpen(false);
        resetDeleteState();
    };

    const submitDelete = async () => {
        if (!deleteAcknowledged) {
            setDeleteError('Please acknowledge that account deletion is permanent.');
            return;
        }
        if (deletePhrase.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE) {
            setDeleteError(`Type "${DELETE_CONFIRMATION_PHRASE}" exactly to confirm.`);
            return;
        }
        setDeleteError(null);
        setDeleteSubmitting(true);
        try {
            const res = await apiClient.delete<{ success: boolean; deletedAt?: string; error?: string }>('/users/me', {
                confirm: DELETE_CONFIRMATION_PHRASE,
                acknowledge: true,
                otp: deletePassword || undefined,
            });
            if (!res.success) {
                setDeleteError(res.error || 'Account deletion failed. Please try again.');
                setDeleteSubmitting(false);
                return;
            }
            setDeleteOpen(false);
            resetDeleteState();
            Alert.alert(
                'Account scheduled for deletion',
                'Your account and personal data have been permanently removed. You will now be signed out.',
                [{ text: 'OK', onPress: () => logout() }],
            );
        } catch (e: any) {
            setDeleteError(e?.message || 'Account deletion failed. Please try again.');
            setDeleteSubmitting(false);
        }
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
                        {verification.level === 'verified' && (
                            <View style={styles.verifiedBadge}>
                                <ShieldCheck color={COLORS.white} size={16} />
                            </View>
                        )}
                    </View>
                    <Typography size="2xl" weight="bold">{user?.name || 'User'}</Typography>
                    <Typography weight="bold" color={verificationStyle.fg} style={styles.roleText}>
                        {verification.label}
                    </Typography>
                    <Typography size="xs" color={COLORS.background.slate[400]}>
                        Member since {user?.memberSince ? new Date(user.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
                    </Typography>
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        {refreshing && stats === null
                            ? <ActivityIndicator size="small" color={COLORS.primary} />
                            : <Typography size="lg" weight="bold" color={COLORS.primary}>{Math.round(completionRate)}%</Typography>}
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>Completion</Typography>
                    </View>
                    <View style={styles.statCard}>
                        {refreshing && stats === null
                            ? <ActivityIndicator size="small" color={COLORS.primary} />
                            : <Typography size="lg" weight="bold" color={COLORS.primary}>{totalDeals}</Typography>}
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>Total Deals</Typography>
                    </View>
                    <View style={styles.statCard}>
                        <View style={styles.ratingRow}>
                            {refreshing && stats === null
                                ? <ActivityIndicator size="small" color={COLORS.primary} />
                                : <Typography size="lg" weight="bold" color={COLORS.primary}>{(rating || 0).toFixed(1)}</Typography>}
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
                            <VerificationIcon color={verificationStyle.fg} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Verification Status</Typography>
                            <View style={[styles.verificationTag, { backgroundColor: verificationStyle.bg }]}>
                                <Typography size="xs" weight="bold" color={verificationStyle.fg}>{verification.label}</Typography>
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

                {/* Legal & Support */}
                <View style={styles.section}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase tracking={2} style={styles.sectionTitle}>
                        Support & Legal
                    </Typography>
                    <View style={styles.listCard}>
                        <TouchableOpacity style={styles.listItem} onPress={onHelp}>
                            <HelpCircle color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Help Center</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={18} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => openLegal(TERMS_URL)}
                            accessibilityRole="link"
                            accessibilityLabel="Open Terms of Service in browser"
                        >
                            <ScrollText color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Terms of Service</Typography>
                            <ExternalLink color={COLORS.background.slate[300]} size={16} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.listItem, styles.lastItem]}
                            onPress={() => openLegal(PRIVACY_URL)}
                            accessibilityRole="link"
                            accessibilityLabel="Open Privacy Policy in browser"
                        >
                            <FileText color={COLORS.background.slate[500]} size={20} />
                            <Typography size="sm" weight="semibold" style={styles.flex1}>Privacy Policy</Typography>
                            <ExternalLink color={COLORS.background.slate[300]} size={16} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Danger zone */}
                <View style={styles.section}>
                    <Typography size="xs" weight="bold" color={COLORS.error} uppercase tracking={2} style={styles.sectionTitle}>
                        Danger Zone
                    </Typography>
                    <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => setDeleteOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Permanently delete account"
                    >
                        <Trash2 color={COLORS.error} size={20} />
                        <Typography weight="bold" color={COLORS.error}>Delete Account</Typography>
                    </TouchableOpacity>
                    <Typography size="xs" color={COLORS.background.slate[500]} style={styles.dangerHint}>
                        Permanently removes your profile, deals history, KYC documents, and chat messages.
                    </Typography>
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

            {/* Delete-account confirmation modal */}
            <Modal
                visible={deleteOpen}
                animationType="fade"
                transparent
                onRequestClose={closeDeleteModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalIconWrap}>
                                <AlertTriangle color={COLORS.error} size={22} />
                            </View>
                            <View style={styles.flex1}>
                                <Typography size="lg" weight="bold">Delete account</Typography>
                                <Typography size="xs" color={COLORS.background.slate[500]}>
                                    This action cannot be undone.
                                </Typography>
                            </View>
                            <TouchableOpacity onPress={closeDeleteModal} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                                <X color={COLORS.background.slate[500]} size={20} />
                            </TouchableOpacity>
                        </View>

                        <Typography size="sm" color={COLORS.background.slate[700]} style={styles.modalBody}>
                            We will permanently erase your profile, KYC documents, payment instruments,
                            chat messages, and notifications. Open deals must be completed or cancelled
                            before we can delete your account.
                        </Typography>

                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1} style={styles.fieldLabel}>
                            Type "{DELETE_CONFIRMATION_PHRASE}" to confirm
                        </Typography>
                        <TextInput
                            style={styles.input}
                            value={deletePhrase}
                            onChangeText={setDeletePhrase}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            placeholder={DELETE_CONFIRMATION_PHRASE}
                            placeholderTextColor={COLORS.background.slate[300]}
                            editable={!deleteSubmitting}
                        />

                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1} style={styles.fieldLabel}>
                            One-time SMS code (optional)
                        </Typography>
                        <TextInput
                            style={styles.input}
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                            keyboardType="number-pad"
                            maxLength={6}
                            placeholder="6-digit code"
                            placeholderTextColor={COLORS.background.slate[300]}
                            editable={!deleteSubmitting}
                            secureTextEntry={Platform.OS === 'ios' ? false : true}
                        />

                        <TouchableOpacity
                            style={styles.checkboxRow}
                            onPress={() => setDeleteAcknowledged((v) => !v)}
                            disabled={deleteSubmitting}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: deleteAcknowledged }}
                        >
                            <View style={[styles.checkbox, deleteAcknowledged && styles.checkboxChecked]}>
                                {deleteAcknowledged && <Typography size="xs" color={COLORS.white} weight="bold">✓</Typography>}
                            </View>
                            <Typography size="xs" color={COLORS.background.slate[700]} style={styles.flex1}>
                                I understand this is permanent and my data cannot be recovered.
                            </Typography>
                        </TouchableOpacity>

                        {deleteError && (
                            <View style={styles.errorBanner}>
                                <Typography size="xs" color="#b91c1c">{deleteError}</Typography>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnSecondary]}
                                onPress={closeDeleteModal}
                                disabled={deleteSubmitting}
                            >
                                <Typography weight="bold" color={COLORS.background.slate[700]}>Cancel</Typography>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modalBtn,
                                    styles.modalBtnDanger,
                                    (deleteSubmitting || !deleteAcknowledged
                                      || deletePhrase.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE) && styles.modalBtnDisabled,
                                ]}
                                onPress={submitDelete}
                                disabled={deleteSubmitting || !deleteAcknowledged
                                    || deletePhrase.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE}
                            >
                                {deleteSubmitting
                                    ? <ActivityIndicator size="small" color={COLORS.white} />
                                    : <Typography weight="bold" color={COLORS.white}>Delete forever</Typography>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

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
    verificationTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 4,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.lg,
        backgroundColor: '#fef2f2',
        borderRadius: RADIUS.xl,
        gap: 12,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    dangerHint: {
        marginTop: 8,
        marginHorizontal: 4,
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
    },
    modalCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        padding: SPACING.xl,
        gap: 12,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    modalIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fef2f2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBody: {
        marginBottom: 8,
    },
    fieldLabel: {
        marginTop: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: RADIUS.default,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm + 2,
        fontSize: 15,
        color: COLORS.background.slate[900],
        backgroundColor: COLORS.background.slate[50],
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: COLORS.background.slate[300],
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: COLORS.error,
        borderColor: COLORS.error,
    },
    errorBanner: {
        backgroundColor: '#fef2f2',
        borderRadius: RADIUS.default,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    modalBtn: {
        flex: 1,
        paddingVertical: SPACING.md,
        borderRadius: RADIUS.default,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBtnSecondary: {
        backgroundColor: COLORS.background.slate[100],
    },
    modalBtnDanger: {
        backgroundColor: COLORS.error,
    },
    modalBtnDisabled: {
        opacity: 0.5,
    },
});
