import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useNavigation } from '@react-navigation/native';
import {
    ArrowLeft,
    CreditCard,
    Smartphone,
    WalletMinimal,
    ChevronRight,
    CircleCheck,
    Eye,
    EyeOff,
    X,
    RefreshCw,
    Lock,
    CircleAlert,
    Clock4,
} from 'lucide-react-native';
import { paymentsApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Method = 'card' | 'd17' | 'flouci';
type Step = 'amount' | 'method' | 'details' | 'otp' | 'webview' | 'confirm';

interface CardDetails {
    number: string;
    expiry: string;
    holder: string;
}

// ─────────────────────────────────────────────
// Card helpers
// ─────────────────────────────────────────────

type CardType = 'visa' | 'mastercard' | 'amex' | 'unknown';

function detectCardType(num: string): CardType {
    const n = num.replace(/\s/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return 'unknown';
}

function formatCardNumber(value: string): string {
    const digits = value.replace(/\D/g, '');
    const type = detectCardType(digits);
    if (type === 'amex') {
        const p = [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)];
        return p.filter(Boolean).join(' ');
    }
    return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
}

function maskCardNumber(num: string): string {
    const digits = num.replace(/\s/g, '');
    if (digits.length < 4) return num;
    return `•••• •••• •••• ${digits.slice(-4)}`;
}

function validateCard(card: CardDetails): string | null {
    const digits = card.number.replace(/\s/g, '');
    if (digits.length < 13) return 'Card number is too short';
    if (!card.expiry.includes('/')) return 'Invalid expiry date';
    const [mm, yy] = card.expiry.split('/');
    const month = parseInt(mm, 10);
    const year = parseInt(`20${yy}`, 10);
    const now = new Date();
    if (month < 1 || month > 12) return 'Invalid expiry month';
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
        return 'Your card has expired';
    }
    if (!card.holder.trim()) return 'Cardholder name is required';
    return null;
}

function formatTunisianPhone(value: string): string {
    const d = value.replace(/\D/g, '');
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)} ${d.slice(2)}`;
    if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4)}`;
    return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
}

// ─────────────────────────────────────────────
// Card Type Badge
// ─────────────────────────────────────────────

const CardTypeBadge: React.FC<{ type: CardType }> = ({ type }) => {
    if (type === 'visa') return (
        <View style={[badge.wrap, { backgroundColor: '#1a1f71' }]}>
            <Typography style={badge.text} color="#fff">VISA</Typography>
        </View>
    );
    if (type === 'mastercard') return (
        <View style={badge.mcWrap}>
            <View style={[badge.mcCircle, { backgroundColor: '#eb001b', left: 0 }]} />
            <View style={[badge.mcCircle, { backgroundColor: '#f79e1b', right: 0 }]} />
        </View>
    );
    if (type === 'amex') return (
        <View style={[badge.wrap, { backgroundColor: '#007bc1' }]}>
            <Typography style={badge.text} color="#fff">AMEX</Typography>
        </View>
    );
    return null;
};

const badge = StyleSheet.create({
    wrap: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    mcWrap: { width: 38, height: 24, position: 'relative' },
    mcCircle: {
        width: 24, height: 24, borderRadius: 12,
        position: 'absolute', top: 0, opacity: 0.9,
    },
});

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────

export const WithdrawScreen: React.FC = () => {
    const navigation = useNavigation();
    const { fetchWalletBalance } = useAppStore();
    const currency = useUserCurrency();

    const [step, setStep] = useState<Step>('amount');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<Method | null>(null);
    const [loading, setLoading] = useState(false);
    const [balance, setBalance] = useState(0);

    // Card state
    const [card, setCard] = useState<CardDetails>({ number: '', expiry: '', holder: '' });
    const [showCardNum, setShowCardNum] = useState(true);
    const cardType = detectCardType(card.number);

    // D17 state
    const [d17Phone, setD17Phone] = useState('');
    const [d17SessionId, setD17SessionId] = useState('');
    const [d17Otp, setD17Otp] = useState('');

    // Flouci state
    const [flouciPhone, setFlouciPhone] = useState('');
    const [flouciUrl, setFlouciUrl] = useState('');
    const [flouciPaymentId, setFlouciPaymentId] = useState('');

    const expiryRef = useRef<TextInput>(null);
    const holderRef = useRef<TextInput>(null);

    const parsedAmount = parseFloat(amount) || 0;

    useEffect(() => {
        paymentsApi.getBalance().then((res) => {
            if (res.success && res.data) {
                setBalance(res.data.availableBalance ?? res.data.balance ?? 0);
            }
        });
    }, []);

    const validateAmount = useCallback((): boolean => {
        if (!parsedAmount || parsedAmount < 1) {
            Alert.alert('Invalid Amount', `Minimum withdrawal is 1 ${currency.code}`);
            return false;
        }
        if (parsedAmount > 5000) {
            Alert.alert('Daily Limit', `Maximum single withdrawal is 5,000 ${currency.code}`);
            return false;
        }
        if (parsedAmount > balance) {
            Alert.alert('Insufficient Funds', `You only have ${balance.toFixed(2)} ${currency.code} available.`);
            return false;
        }
        return true;
    }, [parsedAmount, balance]);

    // ── Navigation ──────────────────────────

    const goBack = () => {
        if (step === 'method')  { setStep('amount');  return; }
        if (step === 'details') { setStep('method');  return; }
        if (step === 'otp')     { setStep('details'); return; }
        if (step === 'webview') { setStep('details'); return; }
        if (step === 'confirm') { setStep('details'); return; }
        navigation.goBack();
    };

    const stepProgress: Record<Step, number> = {
        amount: 20, method: 40, details: 65, otp: 80, webview: 80, confirm: 100,
    };

    const stepTitle: Record<Step, string> = {
        amount:  'Withdraw Funds',
        method:  'Withdrawal Method',
        details: method === 'card' ? 'Card Details' : method === 'd17' ? 'D17 Wallet' : 'Flouci',
        otp:     'Confirm Code',
        webview: 'Flouci Payout',
        confirm: 'Confirm Withdrawal',
    };

    const handleSetMax = () => setAmount(Math.min(balance, 5000).toFixed(2));

    // ── Amount → Method ──────────────────────
    const handleAmountNext = () => {
        if (!validateAmount()) return;
        setStep('method');
    };

    const handleMethodSelect = (m: Method) => {
        setMethod(m);
        setStep('details');
    };

    // ── Card → Confirm ───────────────────────
    const handleCardNext = () => {
        const err = validateCard(card);
        if (err) { Alert.alert('Invalid Card', err); return; }
        setStep('confirm');
    };

    const handleCardWithdraw = async () => {
        setLoading(true);
        try {
            const res = await paymentsApi.withdraw(parsedAmount, 'card', {
                card: {
                    number: card.number.replace(/\s/g, ''),
                    expiry: card.expiry,
                    holder: card.holder.trim(),
                },
            });
            if (res.success) {
                await onWithdrawSuccess('card');
            } else {
                Alert.alert('Withdrawal Failed', (res as any).error || 'Card was declined. Try another card.');
                setStep('details');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
            setStep('details');
        } finally {
            setLoading(false);
        }
    };

    // ── D17 ──────────────────────────────────
    const handleD17Request = async () => {
        const digits = d17Phone.replace(/\s/g, '');
        if (digits.length < 8) { Alert.alert('Invalid Phone', 'Enter your 8-digit D17 phone number'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.initD17Withdraw(parsedAmount, `+216${digits}`);
            if (res.success && res.data?.sessionId) {
                setD17SessionId(res.data.sessionId);
                setStep('otp');
            } else {
                Alert.alert('D17 Error', (res as any).error || 'Could not initiate D17 withdrawal. Try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleD17Confirm = async () => {
        if (d17Otp.length < 4) { Alert.alert('Invalid Code', 'Enter the OTP sent to your D17 app'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.confirmD17Withdraw(d17SessionId, d17Otp);
            if (res.success) {
                await onWithdrawSuccess('d17');
            } else {
                Alert.alert('Invalid Code', (res as any).error || 'Incorrect OTP. Please try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    // ── Flouci ───────────────────────────────
    const handleFlouciInit = async () => {
        const digits = flouciPhone.replace(/\s/g, '');
        if (digits.length < 8) { Alert.alert('Invalid Phone', 'Enter your 8-digit Flouci phone number'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.initFlouciWithdraw(parsedAmount, `+216${digits}`);
            if (res.success && res.data?.paymentUrl) {
                setFlouciUrl(res.data.paymentUrl);
                setFlouciPaymentId(res.data.paymentId);
                setStep('webview');
            } else {
                Alert.alert('Flouci Error', (res as any).error || 'Could not initiate Flouci withdrawal. Try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleFlouciNavChange = async (url: string) => {
        if (url.includes('success') || url.includes('payment_success')) {
            setStep('amount');
            setLoading(true);
            try {
                const res = await paymentsApi.verifyFlouciWithdraw(flouciPaymentId);
                if (res.success) {
                    await onWithdrawSuccess('flouci');
                } else {
                    Alert.alert('Verification Failed', 'Flouci could not confirm the withdrawal.');
                }
            } catch {
                Alert.alert('Error', 'Could not verify Flouci withdrawal.');
            } finally {
                setLoading(false);
            }
        } else if (url.includes('cancel') || url.includes('payment_cancel')) {
            setStep('details');
            Alert.alert('Cancelled', 'You cancelled the Flouci withdrawal.');
        }
    };

    // ── Success ──────────────────────────────
    const onWithdrawSuccess = async (m: Method) => {
        await fetchWalletBalance();
        const methodLabel = m === 'card' ? 'your card'
            : m === 'd17' ? 'your D17 wallet'
            : 'your Flouci account';
        const timing = m === 'card' ? '3–5 business days' : 'within minutes';
        Alert.alert(
            'Withdrawal Initiated ✓',
            `${parsedAmount.toFixed(2)} ${currency.code} will be sent to ${methodLabel} (${timing}).`,
            [{ text: 'Done', onPress: () => navigation.goBack() }]
        );
    };

    // ─────────────────────────────────────────
    // Render steps
    // ─────────────────────────────────────────

    const renderAmountStep = () => (
        <>
            {/* Balance chip — matches DepositScreen */}
            <View style={styles.balanceChip}>
                <Typography size="xs" color={COLORS.background.slate[500]}>Available balance: </Typography>
                <Typography size="xs" weight="bold" color={COLORS.primary}>{balance.toFixed(2)} {currency.code}</Typography>
            </View>

            {/* Amount input */}
            <View style={styles.amountCard}>
                <Typography size="xs" weight="semibold" color={COLORS.background.slate[400]} style={{ letterSpacing: 1 }}>
                    AMOUNT TO WITHDRAW
                </Typography>
                <View style={styles.amountRow}>
                    <TextInput
                        style={[styles.amountInput, { color: parsedAmount ? COLORS.background.slate[900] : '#c7cdd8' }]}
                        value={amount}
                        onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#c7cdd8"
                        autoFocus
                    />
                    <Typography style={styles.currencyLabel} color={COLORS.background.slate[400]}>{currency.code}</Typography>
                </View>
                {parsedAmount > 0 && parsedAmount <= balance && (
                    <Typography size="xs" color={COLORS.background.slate[400]}>
                        Remaining: <Typography size="xs" weight="bold" color={COLORS.background.slate[600]}>{(balance - parsedAmount).toFixed(2)} {currency.code}</Typography>
                    </Typography>
                )}
                {parsedAmount > balance && parsedAmount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <CircleAlert size={12} color={COLORS.error} />
                        <Typography size="xs" color={COLORS.error}>Exceeds available balance</Typography>
                    </View>
                )}
            </View>

            {/* Quick amounts + MAX */}
            <View style={styles.quickGrid}>
                {[50, 100, 200, 500].map((q) => (
                    <TouchableOpacity
                        key={q}
                        style={[styles.quickBtn, amount === q.toString() && styles.quickBtnActive]}
                        onPress={() => setAmount(q.toString())}
                        activeOpacity={0.7}
                    >
                        <Typography size="sm" weight="semibold" color={amount === q.toString() ? COLORS.white : COLORS.primary}>
                            {q} {currency.code}
                        </Typography>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity
                    style={[styles.quickBtn, amount === Math.min(balance, 5000).toFixed(2) && styles.quickBtnActive]}
                    onPress={handleSetMax}
                    activeOpacity={0.7}
                >
                    <Typography size="sm" weight="semibold" color={amount === Math.min(balance, 5000).toFixed(2) ? COLORS.white : COLORS.primary}>
                        MAX
                    </Typography>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, (!parsedAmount || parsedAmount > balance) && styles.primaryBtnDisabled]}
                onPress={handleAmountNext}
                disabled={!parsedAmount || parsedAmount > balance}
                activeOpacity={0.85}
            >
                <Typography size="md" weight="bold" color={COLORS.white}>Choose Withdrawal Method</Typography>
                <ChevronRight size={18} color={COLORS.white} />
            </TouchableOpacity>
        </>
    );

    const renderMethodStep = () => (
        <>
            <View style={styles.amountSummary}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Withdrawing</Typography>
                <Typography size="xl" weight="bold" color={COLORS.background.slate[900]}>{parsedAmount.toFixed(2)} {currency.code}</Typography>
            </View>

            <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.sectionLabel}>
                SELECT WITHDRAWAL METHOD
            </Typography>

            {/* Credit / Debit Card */}
            <TouchableOpacity style={styles.methodCard} onPress={() => handleMethodSelect('card')} activeOpacity={0.8}>
                <View style={[styles.methodIconBox, { backgroundColor: '#eef2ff' }]}>
                    <CreditCard size={24} color="#4f46e5" />
                </View>
                <View style={styles.methodText}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>Credit / Debit Card</Typography>
                        <View style={[styles.tagBadge, { backgroundColor: '#eef2ff' }]}>
                            <Typography style={{ fontSize: 10, fontWeight: '700', color: '#4f46e5' }}>3–5 days</Typography>
                        </View>
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]}>Visa, Mastercard, AMEX</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            {/* D17 */}
            <TouchableOpacity style={styles.methodCard} onPress={() => handleMethodSelect('d17')} activeOpacity={0.8}>
                <View style={[styles.methodIconBox, { backgroundColor: '#fef3c7' }]}>
                    <Smartphone size={24} color="#d97706" />
                </View>
                <View style={styles.methodText}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>D17</Typography>
                        <View style={styles.tagBadge}>
                            <Typography style={{ fontSize: 10, fontWeight: '700', color: '#d97706' }}>Poste Tunisienne</Typography>
                        </View>
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]}>D17 mobile wallet — within minutes</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            {/* Flouci */}
            <TouchableOpacity style={styles.methodCard} onPress={() => handleMethodSelect('flouci')} activeOpacity={0.8}>
                <View style={[styles.methodIconBox, { backgroundColor: '#d1fae5' }]}>
                    <WalletMinimal size={24} color="#059669" />
                </View>
                <View style={styles.methodText}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>Flouci</Typography>
                        <View style={[styles.tagBadge, { backgroundColor: '#d1fae5' }]}>
                            <Typography style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>Instant</Typography>
                        </View>
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]}>Flouci account — within minutes</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            <View style={styles.securityNote}>
                <Lock size={13} color={COLORS.background.slate[400]} />
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginLeft: 6 }}>
                    All withdrawals are encrypted and processed securely
                </Typography>
            </View>
        </>
    );

    const renderCardForm = () => (
        <>
            {/* Card preview */}
            <View style={styles.cardPreview}>
                <View style={styles.cardPreviewCircle1} />
                <View style={styles.cardPreviewCircle2} />
                <View style={styles.cardPreviewTop}>
                    <View style={styles.chip} />
                    <CardTypeBadge type={cardType} />
                </View>
                <Typography style={styles.cardPreviewNumber} color="rgba(255,255,255,0.9)">
                    {card.number ? maskCardNumber(card.number) : '•••• •••• •••• ••••'}
                </Typography>
                <View style={styles.cardPreviewBottom}>
                    <View>
                        <Typography size="xs" color="rgba(255,255,255,0.55)">CARDHOLDER</Typography>
                        <Typography size="sm" weight="bold" color="rgba(255,255,255,0.9)">
                            {card.holder.toUpperCase() || 'YOUR NAME'}
                        </Typography>
                    </View>
                    <View>
                        <Typography size="xs" color="rgba(255,255,255,0.55)">EXPIRES</Typography>
                        <Typography size="sm" weight="bold" color="rgba(255,255,255,0.9)">
                            {card.expiry || 'MM/YY'}
                        </Typography>
                    </View>
                </View>
            </View>

            <View style={styles.infoBox}>
                <CircleAlert size={14} color="#2563eb" />
                <Typography size="xs" color="#2563eb" style={{ flex: 1, marginLeft: 8 }}>
                    Funds will be refunded to this card within 3–5 business days.
                </Typography>
            </View>

            {/* Card Number */}
            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>CARD NUMBER</Typography>
                <View style={styles.inputBox}>
                    <CreditCard size={18} color={COLORS.background.slate[400]} style={{ marginRight: 10 }} />
                    <TextInput
                        style={styles.textInput}
                        value={card.number}
                        onChangeText={(v) => {
                            const fmt = formatCardNumber(v);
                            const max = detectCardType(v) === 'amex' ? 17 : 19;
                            if (fmt.length <= max) setCard(c => ({ ...c, number: fmt }));
                            const digits = fmt.replace(/\s/g, '');
                            const maxD = detectCardType(v) === 'amex' ? 15 : 16;
                            if (digits.length === maxD) expiryRef.current?.focus();
                        }}
                        placeholder="0000 0000 0000 0000"
                        placeholderTextColor="#bfc5d0"
                        keyboardType="number-pad"
                        maxLength={19}
                    />
                </View>
            </View>

            {/* Expiry */}
            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>EXPIRY DATE</Typography>
                <View style={styles.inputBox}>
                    <TextInput
                        ref={expiryRef}
                        style={styles.textInput}
                        value={card.expiry}
                        onChangeText={(v) => {
                            const fmt = formatExpiry(v);
                            if (fmt.length <= 5) setCard(c => ({ ...c, expiry: fmt }));
                            if (fmt.length === 5) holderRef.current?.focus();
                        }}
                        placeholder="MM/YY"
                        placeholderTextColor="#bfc5d0"
                        keyboardType="number-pad"
                        maxLength={5}
                    />
                </View>
            </View>

            {/* Cardholder */}
            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>CARDHOLDER NAME</Typography>
                <View style={styles.inputBox}>
                    <TextInput
                        ref={holderRef}
                        style={styles.textInput}
                        value={card.holder}
                        onChangeText={(v) => setCard(c => ({ ...c, holder: v }))}
                        placeholder="Name as on card"
                        placeholderTextColor="#bfc5d0"
                        autoCapitalize="characters"
                        autoCorrect={false}
                    />
                </View>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleCardNext} activeOpacity={0.85}>
                <Typography size="md" weight="bold" color={COLORS.white}>Review Withdrawal</Typography>
                <ChevronRight size={18} color={COLORS.white} />
            </TouchableOpacity>
        </>
    );

    const renderD17Form = () => (
        <>
            <View style={styles.providerHeader}>
                <View style={[styles.providerIcon, { backgroundColor: '#fef3c7' }]}>
                    <Smartphone size={28} color="#d97706" />
                </View>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>D17 Wallet Withdrawal</Typography>
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 4 }}>
                    Enter your D17 phone number. You'll receive a confirmation code to approve the payout.
                </Typography>
            </View>

            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>D17 PHONE NUMBER</Typography>
                <View style={styles.inputBox}>
                    <View style={styles.flagBox}>
                        <Typography size="sm" weight="bold" color={COLORS.background.slate[600]}>+216</Typography>
                    </View>
                    <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        value={d17Phone}
                        onChangeText={(v) => {
                            const fmt = formatTunisianPhone(v);
                            if (fmt.replace(/\s/g, '').length <= 8) setD17Phone(fmt);
                        }}
                        placeholder="XX XX XX XX"
                        placeholderTextColor="#bfc5d0"
                        keyboardType="phone-pad"
                        maxLength={11}
                    />
                </View>
            </View>

            <View style={styles.amountSummarySmall}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Withdrawal amount</Typography>
                <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>{parsedAmount.toFixed(2)} {currency.code}</Typography>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#d97706' }, loading && styles.primaryBtnDisabled]}
                onPress={handleD17Request}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <><Typography size="md" weight="bold" color={COLORS.white}>Send D17 Code</Typography><ChevronRight size={18} color={COLORS.white} /></>
                }
            </TouchableOpacity>
        </>
    );

    const renderD17Otp = () => (
        <>
            <View style={styles.providerHeader}>
                <View style={[styles.providerIcon, { backgroundColor: '#fef3c7' }]}>
                    <Smartphone size={28} color="#d97706" />
                </View>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>Enter D17 Code</Typography>
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 4 }}>
                    A confirmation code was sent to your D17 app on +216 {d17Phone}
                </Typography>
            </View>

            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>CONFIRMATION CODE</Typography>
                <View style={[styles.inputBox, { justifyContent: 'center' }]}>
                    <TextInput
                        style={[styles.textInput, { fontSize: 28, letterSpacing: 12, textAlign: 'center', fontWeight: 'bold' }]}
                        value={d17Otp}
                        onChangeText={(v) => setD17Otp(v.replace(/\D/g, '').slice(0, 6))}
                        placeholder="······"
                        placeholderTextColor="#bfc5d0"
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                    />
                </View>
            </View>

            <View style={styles.amountSummarySmall}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Withdrawal amount</Typography>
                <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>{parsedAmount.toFixed(2)} {currency.code}</Typography>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#d97706' }, loading && styles.primaryBtnDisabled]}
                onPress={handleD17Confirm}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <><CircleCheck size={18} color={COLORS.white} /><Typography size="md" weight="bold" color={COLORS.white}>Confirm Withdrawal</Typography></>
                }
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendRow} onPress={handleD17Request} disabled={loading}>
                <RefreshCw size={14} color={COLORS.primary} />
                <Typography size="xs" color={COLORS.primary} weight="semibold" style={{ marginLeft: 6 }}>Resend code</Typography>
            </TouchableOpacity>
        </>
    );

    const renderFlouciForm = () => (
        <>
            <View style={styles.providerHeader}>
                <View style={[styles.providerIcon, { backgroundColor: '#d1fae5' }]}>
                    <WalletMinimal size={28} color="#059669" />
                </View>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>Flouci Withdrawal</Typography>
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 4 }}>
                    Enter your Flouci phone number. You'll be redirected to approve the payout.
                </Typography>
            </View>

            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>FLOUCI PHONE NUMBER</Typography>
                <View style={styles.inputBox}>
                    <View style={styles.flagBox}>
                        <Typography size="sm" weight="bold" color={COLORS.background.slate[600]}>+216</Typography>
                    </View>
                    <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        value={flouciPhone}
                        onChangeText={(v) => {
                            const fmt = formatTunisianPhone(v);
                            if (fmt.replace(/\s/g, '').length <= 8) setFlouciPhone(fmt);
                        }}
                        placeholder="XX XX XX XX"
                        placeholderTextColor="#bfc5d0"
                        keyboardType="phone-pad"
                        maxLength={11}
                    />
                </View>
            </View>

            <View style={styles.amountSummarySmall}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Withdrawal amount</Typography>
                <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>{parsedAmount.toFixed(2)} {currency.code}</Typography>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#059669' }, loading && styles.primaryBtnDisabled]}
                onPress={handleFlouciInit}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <><Typography size="md" weight="bold" color={COLORS.white}>Proceed to Flouci</Typography><ChevronRight size={18} color={COLORS.white} /></>
                }
            </TouchableOpacity>
        </>
    );

    const renderConfirm = () => (
        <>
            <View style={styles.confirmCard}>
                <View style={styles.confirmCircle}>
                    <CreditCard size={30} color={COLORS.primary} />
                </View>
                <Typography size="xs" weight="semibold" color={COLORS.background.slate[400]} style={{ letterSpacing: 1, marginTop: 16 }}>
                    WITHDRAWAL SUMMARY
                </Typography>
                <Typography style={styles.confirmAmount} weight="bold" color={COLORS.background.slate[900]}>
                    {parsedAmount.toFixed(2)} {currency.code}
                </Typography>
                <View style={styles.confirmDivider} />
                <View style={styles.confirmRow}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>Card</Typography>
                    <Typography size="sm" weight="semibold">{maskCardNumber(card.number)}</Typography>
                </View>
                <View style={styles.confirmRow}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>Name</Typography>
                    <Typography size="sm" weight="semibold">{card.holder}</Typography>
                </View>
                <View style={styles.confirmRow}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>Current Balance</Typography>
                    <Typography size="sm" weight="semibold">{balance.toFixed(2)} {currency.code}</Typography>
                </View>
                <View style={styles.confirmRow}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>Balance After</Typography>
                    <Typography size="sm" weight="bold" color={COLORS.primary}>{(balance - parsedAmount).toFixed(2)} {currency.code}</Typography>
                </View>
                <View style={styles.confirmRow}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>Arrival</Typography>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Clock4 size={13} color={COLORS.background.slate[500]} />
                        <Typography size="sm" weight="semibold">3–5 business days</Typography>
                    </View>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleCardWithdraw}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <><Lock size={16} color={COLORS.white} /><Typography size="md" weight="bold" color={COLORS.white}>Confirm Withdrawal</Typography></>
                }
            </TouchableOpacity>

            <Typography size="xs" color={COLORS.background.slate[400]} style={styles.disclaimer}>
                Once confirmed, funds cannot be recalled. Processing takes 3–5 business days.
            </Typography>
        </>
    );

    // ─────────────────────────────────────────
    // Flouci WebView (full-screen)
    // ─────────────────────────────────────────

    if (step === 'webview' && flouciUrl) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <View style={styles.webviewHeader}>
                    <TouchableOpacity onPress={() => setStep('details')} style={{ padding: 8 }}>
                        <X size={22} color={COLORS.background.slate[800]} />
                    </TouchableOpacity>
                    <Typography size="base" weight="bold">Flouci Withdrawal</Typography>
                    <View style={{ width: 38 }} />
                </View>
                <WebView
                    source={{ uri: flouciUrl }}
                    onNavigationStateChange={(state) => handleFlouciNavChange(state.url)}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                        </View>
                    )}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={goBack} style={styles.backBtn}>
                    <ArrowLeft color={COLORS.background.slate[800]} size={22} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold">{stepTitle[step]}</Typography>
                <View style={{ width: 40 }} />
            </View>

            {/* Progress bar */}
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${stepProgress[step]}%` }]} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {step === 'amount'  && renderAmountStep()}
                    {step === 'method'  && renderMethodStep()}
                    {step === 'details' && method === 'card'   && renderCardForm()}
                    {step === 'details' && method === 'd17'    && renderD17Form()}
                    {step === 'details' && method === 'flouci' && renderFlouciForm()}
                    {step === 'otp'     && renderD17Otp()}
                    {step === 'confirm' && renderConfirm()}
                    <View style={{ height: 48 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6fb' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
        backgroundColor: '#f4f6fb',
    },
    backBtn: {
        width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    progressBar: {
        height: 3, backgroundColor: COLORS.background.slate[100],
        marginHorizontal: SPACING.xl, borderRadius: 2, marginBottom: SPACING.xl,
    },
    progressFill: { height: 3, backgroundColor: COLORS.primary, borderRadius: 2 },
    content: { paddingHorizontal: SPACING.xl },

    // ── Amount step
    balanceChip: {
        flexDirection: 'row', alignSelf: 'center',
        backgroundColor: COLORS.white, borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 6, marginBottom: SPACING.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    amountCard: {
        backgroundColor: COLORS.white, borderRadius: 20, padding: SPACING.xl,
        alignItems: 'center', marginBottom: SPACING.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 8 },
    amountInput: { fontSize: 52, fontWeight: 'bold', minWidth: 120, textAlign: 'center', padding: 0 },
    currencyLabel: { fontSize: 20, fontWeight: '600', marginBottom: 8, marginLeft: 8 },
    quickGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 10,
        marginBottom: SPACING.xl, justifyContent: 'space-between',
    },
    quickBtn: {
        width: '30%', paddingVertical: 10, borderRadius: 12,
        borderWidth: 1.5, borderColor: `${COLORS.primary}40`,
        alignItems: 'center', backgroundColor: COLORS.white,
    },
    quickBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },

    // ── Method step
    amountSummary: {
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        padding: SPACING.lg, marginBottom: SPACING.xl, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    amountSummarySmall: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        padding: SPACING.lg, marginBottom: SPACING.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    sectionLabel: { letterSpacing: 0.8, marginBottom: SPACING.sm },
    methodCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        padding: SPACING.lg, marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    methodIconBox: {
        width: 50, height: 50, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
    },
    methodText: { flex: 1, gap: 2 },
    tagBadge: {
        backgroundColor: '#fef3c7', borderRadius: 6,
        paddingHorizontal: 6, paddingVertical: 2,
    },
    securityNote: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', marginTop: SPACING.lg,
    },

    // ── Info box
    infoBox: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: '#eff6ff', borderRadius: RADIUS.lg,
        padding: SPACING.md, marginBottom: SPACING.lg,
        borderWidth: 1, borderColor: '#bfdbfe',
    },

    // ── Card preview
    cardPreview: {
        backgroundColor: '#1a2b5e', borderRadius: 20,
        padding: SPACING.xl, marginBottom: SPACING.xl, overflow: 'hidden',
        shadowColor: '#1a2b5e', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
    },
    cardPreviewCircle1: {
        position: 'absolute', width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(255,255,255,0.07)', top: -50, right: -30,
    },
    cardPreviewCircle2: {
        position: 'absolute', width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: -10,
    },
    cardPreviewTop: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: SPACING.xl,
    },
    chip: {
        width: 36, height: 26, borderRadius: 5,
        backgroundColor: '#e6c870', borderWidth: 1, borderColor: '#c9a84c',
    },
    cardPreviewNumber: { fontSize: 18, letterSpacing: 3, fontWeight: '600', marginBottom: SPACING.xl },
    cardPreviewBottom: { flexDirection: 'row', justifyContent: 'space-between' },

    // ── Shared input
    inputGroup: { marginBottom: SPACING.lg },
    inputLabel: { letterSpacing: 0.8, marginBottom: SPACING.xs },
    inputBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg,
        paddingVertical: Platform.OS === 'ios' ? 14 : 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    textInput: { flex: 1, fontSize: 16, color: COLORS.background.slate[900], padding: 0 },
    flagBox: {
        backgroundColor: COLORS.background.slate[50], borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 6, marginRight: 10,
    },

    // ── Provider header
    providerHeader: { alignItems: 'center', marginBottom: SPACING.xl, gap: 4 },
    providerIcon: {
        width: 68, height: 68, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },

    // ── OTP resend
    resendRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', marginTop: SPACING.lg,
    },

    // ── Confirm
    confirmCard: {
        backgroundColor: COLORS.white, borderRadius: 24, padding: SPACING.xl,
        alignItems: 'center', marginBottom: SPACING.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    confirmCircle: {
        width: 68, height: 68, borderRadius: 34,
        backgroundColor: `${COLORS.primary}15`,
        alignItems: 'center', justifyContent: 'center',
    },
    confirmAmount: { fontSize: 42, marginTop: 6, marginBottom: 20 },
    confirmDivider: {
        height: 1, backgroundColor: COLORS.background.slate[100],
        width: '100%', marginBottom: SPACING.lg,
    },
    confirmRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        width: '100%', paddingVertical: 8,
    },
    disclaimer: { textAlign: 'center', marginTop: SPACING.lg, lineHeight: 18 },

    // ── Primary button
    primaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 16,
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    primaryBtnDisabled: { opacity: 0.5 },

    // ── Flouci WebView header
    webviewHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
        backgroundColor: COLORS.white, borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
});

export default WithdrawScreen;
