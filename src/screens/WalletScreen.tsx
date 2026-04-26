import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    StatusBar,
    ActivityIndicator,
    RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    ArrowLeft,
    ArrowDownToLine,
    ArrowUpFromLine,
    Clock,
    Plus,
    ShieldCheck,
    SendHorizontal,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    ChevronRight,
    Banknote,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { paymentsApi } from '../services/api';
import { useUserCurrency } from '../utils/currency';

interface WalletScreenProps {
    onDeposit?: () => void;
    onWithdraw?: () => void;
    onTransfer?: () => void;
    onBack: () => void;
}

type FilterTab = 'all' | 'income' | 'spending';

const TX_CONFIG: Record<string, { label: string; icon: (c: string) => React.ReactNode; credit: boolean }> = {
    DEPOSIT:       { label: 'Deposit', icon: (c) => <ArrowDownToLine size={18} color={c} />, credit: true },
    WITHDRAWAL:    { label: 'Withdrawal', icon: (c) => <ArrowUpFromLine size={18} color={c} />, credit: false },
    WITHDRAW:      { label: 'Withdrawal', icon: (c) => <ArrowUpFromLine size={18} color={c} />, credit: false },
    ESCROW:        { label: 'Escrow Hold', icon: (c) => <ShieldCheck size={18} color={c} />, credit: false },
    ESCROW_HOLD:   { label: 'Escrow Hold', icon: (c) => <ShieldCheck size={18} color={c} />, credit: false },
    ESCROW_RELEASE:{ label: 'Escrow Released', icon: (c) => <ShieldCheck size={18} color={c} />, credit: true },
    PAYMENT:       { label: 'Payment', icon: (c) => <SendHorizontal size={18} color={c} />, credit: true },
    REFUND:        { label: 'Refund', icon: (c) => <RefreshCw size={18} color={c} />, credit: true },
};

function getTxConfig(type: string, amount: number) {
    const cfg = TX_CONFIG[type?.toUpperCase()] || {
        label: type || 'Transaction',
        icon: (c: string) => <Banknote size={18} color={c} />,
        credit: amount >= 0,
    };
    return cfg;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDate(txs: any[]): Array<{ title: string; data: any[] }> {
    const map = new Map<string, any[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const tx of txs) {
        const d = new Date(tx.createdAt || tx.date || Date.now());
        d.setHours(0, 0, 0, 0);
        let key: string;
        if (d.getTime() === today.getTime()) key = 'Today';
        else if (d.getTime() === yesterday.getTime()) key = 'Yesterday';
        else key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(tx);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export const WalletScreen: React.FC<WalletScreenProps> = ({ onBack, onDeposit, onWithdraw }) => {
    const currency = useUserCurrency();
    const { walletBalance, transactions, fetchWalletBalance, fetchTransactions, isLoading } = useAppStore();
    const [refreshing, setRefreshing] = useState(false);
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [pendingBalance, setPendingBalance] = useState(0);
    const [availableBalance, setAvailableBalance] = useState(walletBalance);

    const loadData = useCallback(async () => {
        try {
            const [balRes] = await Promise.all([
                paymentsApi.getBalance(),
                fetchTransactions(),
            ]);
            if (balRes.success && balRes.data) {
                setAvailableBalance(balRes.data.availableBalance ?? balRes.data.balance ?? 0);
                setPendingBalance(balRes.data.pendingBalance ?? 0);
            } else {
                setAvailableBalance(walletBalance);
            }
        } catch {
            setAvailableBalance(walletBalance);
        }
    }, [fetchTransactions, walletBalance]);

    useEffect(() => { loadData(); }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    // Compute monthly stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTxs = transactions.filter(tx => new Date((tx as any).createdAt || (tx as any).date || 0) >= monthStart);
    const monthIncome = monthTxs.filter((tx: any) => getTxConfig(tx.type, tx.amount).credit).reduce((s: number, tx: any) => s + tx.amount, 0);
    const monthSpend = monthTxs.filter((tx: any) => !getTxConfig(tx.type, tx.amount).credit).reduce((s: number, tx: any) => s + tx.amount, 0);

    // Filtered txs
    const filtered = transactions.filter((tx: any) => {
        const cfg = getTxConfig(tx.type, tx.amount);
        if (filterTab === 'income') return cfg.credit;
        if (filterTab === 'spending') return !cfg.credit;
        return true;
    });

    const grouped = groupByDate(filtered as any[]);

    // Flatten for FlatList with section headers
    const flatData: Array<{ type: 'header'; title: string } | { type: 'tx'; tx: any }> = [];
    for (const section of grouped) {
        flatData.push({ type: 'header', title: section.title });
        for (const tx of section.data) flatData.push({ type: 'tx', tx });
    }

    const renderItem = ({ item }: { item: any }) => {
        if (item.type === 'header') {
            return (
                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.dateHeader}>
                    {item.title.toUpperCase()}
                </Typography>
            );
        }
        const tx = item.tx;
        const cfg = getTxConfig(tx.type, tx.amount);
        const isCredit = cfg.credit;
        const iconBg = isCredit ? '#f0fdf4' : '#fef2f2';
        const iconColor = isCredit ? '#16a34a' : '#dc2626';
        const amountColor = isCredit ? '#16a34a' : COLORS.background.slate[800];
        const amountStr = isCredit ? `+${currency.symbol}${(tx.amount || 0).toFixed(2)}` : `-${currency.symbol}${(tx.amount || 0).toFixed(2)}`;
        const statusColor = tx.status === 'COMPLETED' || tx.status === 'completed' ? '#16a34a'
            : tx.status === 'PENDING' || tx.status === 'pending' ? '#f59e0b' : '#ef4444';

        return (
            <TouchableOpacity style={styles.txRow} activeOpacity={0.7}>
                <View style={[styles.txIconWrap, { backgroundColor: iconBg }]}>
                    {cfg.icon(iconColor)}
                </View>
                <View style={styles.txBody}>
                    <Typography size="sm" weight="semibold" color={COLORS.background.slate[800]}>
                        {cfg.label}
                    </Typography>
                    <View style={styles.txMeta}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Typography size="xs" color={COLORS.background.slate[400]}>
                            {tx.status ? (tx.status.charAt(0) + tx.status.slice(1).toLowerCase()) : 'Completed'}
                            {' · '}{formatRelativeTime(tx.createdAt || tx.date || '')}
                        </Typography>
                    </View>
                </View>
                <Typography size="sm" weight="bold" color={amountColor}>
                    {amountStr}
                </Typography>
            </TouchableOpacity>
        );
    };

    const totalBalance = availableBalance + pendingBalance;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ArrowLeft color={COLORS.background.slate[800]} size={22} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>Wallet</Typography>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={flatData}
                keyExtractor={(item, i) => item.type === 'header' ? `h-${item.title}` : `tx-${(item as any).tx?.id || i}`}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
                ListHeaderComponent={
                    <>
                        {/* ── Balance Card ── */}
                        <View style={styles.card}>
                            {/* Decorative circles */}
                            <View style={styles.cardCircle1} />
                            <View style={styles.cardCircle2} />

                            <Typography size="xs" weight="semibold" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1 }}>
                                TOTAL BALANCE
                            </Typography>
                            {isLoading && !refreshing ? (
                                <ActivityIndicator color="#fff" style={{ marginTop: 12, marginBottom: 8 }} />
                            ) : (
                                <Typography size="4xl" weight="bold" color="#fff" style={styles.balanceText}>
                                    {currency.symbol}{totalBalance.toFixed(2)}
                                </Typography>
                            )}

                            {/* Available / Escrow split */}
                            <View style={styles.balanceSplit}>
                                <View style={styles.splitItem}>
                                    <Typography size="xs" color="rgba(255,255,255,0.65)">Available</Typography>
                                    <Typography size="base" weight="bold" color="#fff">{currency.symbol}{availableBalance.toFixed(2)}</Typography>
                                </View>
                                <View style={styles.splitDivider} />
                                <View style={styles.splitItem}>
                                    <Typography size="xs" color="rgba(255,255,255,0.65)">In Escrow</Typography>
                                    <Typography size="base" weight="bold" color="#fff">{currency.symbol}{pendingBalance.toFixed(2)}</Typography>
                                </View>
                            </View>
                        </View>

                        {/* ── Stats Row ── */}
                        <View style={styles.statsRow}>
                            <View style={[styles.statCard, { borderLeftColor: '#16a34a' }]}>
                                <View style={styles.statTop}>
                                    <TrendingUp size={16} color="#16a34a" />
                                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginLeft: 4 }}>This month</Typography>
                                </View>
                                <Typography size="lg" weight="bold" color={COLORS.background.slate[800]}>{currency.symbol}{monthIncome.toFixed(0)}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>Income</Typography>
                            </View>
                            <View style={[styles.statCard, { borderLeftColor: '#dc2626' }]}>
                                <View style={styles.statTop}>
                                    <TrendingDown size={16} color="#dc2626" />
                                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginLeft: 4 }}>This month</Typography>
                                </View>
                                <Typography size="lg" weight="bold" color={COLORS.background.slate[800]}>{currency.symbol}{monthSpend.toFixed(0)}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>Spending</Typography>
                            </View>
                        </View>

                        {/* ── Action Buttons ── */}
                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.actionBtn} onPress={onDeposit} activeOpacity={0.8}>
                                <View style={[styles.actionIcon, { backgroundColor: `${COLORS.primary}18` }]}>
                                    <Plus size={22} color={COLORS.primary} />
                                </View>
                                <Typography size="xs" weight="semibold" color={COLORS.background.slate[700]}>Add Money</Typography>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={onWithdraw} activeOpacity={0.8}>
                                <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
                                    <ArrowUpFromLine size={22} color="#dc2626" />
                                </View>
                                <Typography size="xs" weight="semibold" color={COLORS.background.slate[700]}>Withdraw</Typography>
                            </TouchableOpacity>
                        </View>

                        {/* ── Filter Tabs ── */}
                        <View style={styles.filterRow}>
                            {(['all', 'income', 'spending'] as FilterTab[]).map(tab => (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.filterTab, filterTab === tab && styles.filterTabActive]}
                                    onPress={() => setFilterTab(tab)}
                                >
                                    <Typography
                                        size="xs"
                                        weight={filterTab === tab ? 'bold' : 'semibold'}
                                        color={filterTab === tab ? COLORS.primary : COLORS.background.slate[400]}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </Typography>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Transactions Label ── */}
                        <View style={styles.txHeaderRow}>
                            <Typography size="sm" weight="bold" color={COLORS.background.slate[800]}>Transactions</Typography>
                            {filtered.length > 0 && (
                                <Typography size="xs" color={COLORS.background.slate[400]}>{filtered.length} total</Typography>
                            )}
                        </View>
                    </>
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Clock size={40} color="#d1d5db" />
                        <Typography size="sm" color={COLORS.background.slate[400]} style={{ marginTop: 12, textAlign: 'center' }}>
                            No transactions yet.{'\n'}Add money to get started.
                        </Typography>
                    </View>
                }
                ListFooterComponent={<View style={{ height: 40 }} />}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f4f6fb',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.md,
        backgroundColor: '#f4f6fb',
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    listContent: {
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.xl,
    },
    // ── Balance Card
    card: {
        backgroundColor: COLORS.primary,
        borderRadius: 24,
        padding: SPACING.xl,
        paddingTop: 28,
        paddingBottom: 24,
        marginBottom: SPACING.lg,
        overflow: 'hidden',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
        elevation: 10,
    },
    cardCircle1: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.07)',
        top: -60,
        right: -40,
    },
    cardCircle2: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.05)',
        bottom: -30,
        left: -20,
    },
    balanceText: {
        marginTop: 6,
        marginBottom: 20,
        letterSpacing: -1,
    },
    balanceSplit: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: SPACING.lg,
    },
    splitItem: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
    },
    splitDivider: {
        width: 1,
        height: 32,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: SPACING.md,
    },
    // ── Stats
    statsRow: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginBottom: SPACING.lg,
    },
    statCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
        gap: 2,
    },
    statTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    // ── Actions
    actionsRow: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginBottom: SPACING.xl,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        paddingVertical: SPACING.lg,
        alignItems: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    actionIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ── Filter tabs
    filterRow: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: 4,
        marginBottom: SPACING.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 10,
    },
    filterTabActive: {
        backgroundColor: `${COLORS.primary}15`,
    },
    txHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    // ── Date Group Header
    dateHeader: {
        marginTop: SPACING.md,
        marginBottom: SPACING.xs,
        letterSpacing: 0.8,
    },
    // ── Transaction Row
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        paddingVertical: 14,
        paddingHorizontal: SPACING.lg,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    txIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.md,
    },
    txBody: {
        flex: 1,
        gap: 3,
    },
    txMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
});
