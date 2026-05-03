import React, { useState, useEffect, useCallback } from 'react';
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
import { useStripe } from '@stripe/stripe-react-native';
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
    X,
    RefreshCw,
    Lock,
} from 'lucide-react-native';
import { paymentsApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Method = 'card' | 'd17' | 'flouci';
type Step = 'amount' | 'method' | 'details' | 'otp' | 'webview';

const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

// Tunisian phone format
function formatTunisianPhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`;
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────

export const DepositScreen: React.FC = () => {
    const navigation = useNavigation();
    const { fetchWalletBalance } = useAppStore();
    const currency = useUserCurrency();
    const { initPaymentSheet, presentPaymentSheet } = useStripe();

    const [step, setStep] = useState<Step>('amount');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<Method | null>(null);
    const [loading, setLoading] = useState(false);
    const [balance, setBalance] = useState(0);

    // D17 state
    const [d17Phone, setD17Phone] = useState('');
    const [d17SessionId, setD17SessionId] = useState('');
    const [d17Otp, setD17Otp] = useState('');

    // Flouci state
    const [flouciPhone, setFlouciPhone] = useState('');
    const [flouciUrl, setFlouciUrl] = useState('');
    const [flouciPaymentId, setFlouciPaymentId] = useState('');

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
            Alert.alert('Invalid Amount', `Minimum deposit is 1 ${currency.code}`);
            return false;
        }
        if (parsedAmount > 10000) {
            Alert.alert('Limit Exceeded', `Maximum single deposit is 10,000 ${currency.code}`);
            return false;
        }
        return true;
    }, [parsedAmount, currency.code]);

    // ── Step navigation ──────────────────────

    const goBack = () => {
        if (step === 'method') setStep('amount');
        else if (step === 'details') setStep('method');
        else if (step === 'otp') setStep('details');
        else if (step === 'webview') setStep('details');
        else navigation.goBack();
    };

    const stepProgress: Record<Step, number> = {
        amount: 25, method: 50, details: 75, otp: 90, webview: 90,
    };

    // ── Handlers ────────────────────────────

    const handleAmountNext = () => {
        if (!validateAmount()) return;
        setStep('method');
    };

    const handleMethodSelect = (m: Method) => {
        setMethod(m);
        if (m === 'card') {
            handleCardPayment();
        } else {
            setStep('details');
        }
    };

    // Card → Stripe PaymentSheet
    const handleCardPayment = async () => {
        setLoading(true);
        try {
            const res = await paymentsApi.deposit(parsedAmount);
            if (!res.success || !res.data?.clientSecret) {
                Alert.alert('Payment Error', res.error || 'Could not start the payment.');
                return;
            }

            const init = await initPaymentSheet({
                merchantDisplayName: 'Bridger',
                paymentIntentClientSecret: res.data.clientSecret,
                allowsDelayedPaymentMethods: false,
            });
            if (init.error) {
                Alert.alert('Payment Error', init.error.message);
                return;
            }

            const result = await presentPaymentSheet();
            if (result.error) {
                if (result.error.code !== 'Canceled') {
                    Alert.alert('Payment Failed', result.error.message);
                }
                return;
            }

            await onPaymentSuccess();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    // D17 → request OTP from backend
    const handleD17Request = async () => {
        const digits = d17Phone.replace(/\s/g, '');
        if (digits.length < 8) { Alert.alert('Invalid Phone', 'Enter your D17 phone number'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.initD17Payment(parsedAmount, `+216${digits}`);
            if (res.success && res.data?.sessionId) {
                setD17SessionId(res.data.sessionId);
                setStep('otp');
            } else {
                Alert.alert('D17 Error', res.error || 'Could not initiate D17 payment. Try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    // D17 OTP confirm → success
    const handleD17Confirm = async () => {
        if (d17Otp.length < 4) { Alert.alert('Invalid Code', 'Enter the OTP sent to your D17 app'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.confirmD17Payment(d17SessionId, d17Otp);
            if (res.success) {
                await onPaymentSuccess();
            } else {
                Alert.alert('Invalid Code', res.error || 'Incorrect OTP. Please try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    // Flouci → get redirect URL from backend
    const handleFlouciInit = async () => {
        const digits = flouciPhone.replace(/\s/g, '');
        if (digits.length < 8) { Alert.alert('Invalid Phone', 'Enter your Flouci phone number'); return; }
        setLoading(true);
        try {
            const res = await paymentsApi.initFlouciPayment(parsedAmount, `+216${digits}`);
            if (res.success && res.data?.paymentUrl) {
                setFlouciUrl(res.data.paymentUrl);
                setFlouciPaymentId(res.data.paymentId);
                setStep('webview');
            } else {
                Alert.alert('Flouci Error', res.error || 'Could not initiate Flouci payment. Try again.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    // Called after Flouci WebView URL changes (success/cancel redirect)
    const handleFlouciNavChange = async (url: string) => {
        if (url.includes('success') || url.includes('payment_success')) {
            setStep('amount'); // collapse webview
            setLoading(true);
            try {
                const res = await paymentsApi.verifyFlouciPayment(flouciPaymentId);
                if (res.success) {
                    await onPaymentSuccess();
                } else {
                    Alert.alert('Payment Failed', 'Flouci could not confirm the payment. Try again.');
                }
            } catch {
                Alert.alert('Error', 'Could not verify Flouci payment.');
            } finally {
                setLoading(false);
            }
        } else if (url.includes('cancel') || url.includes('payment_cancel')) {
            setStep('details');
            Alert.alert('Payment Cancelled', 'You cancelled the Flouci payment.');
        }
    };

    const onPaymentSuccess = async () => {
        // Backend webhook credits the wallet on payment_intent.succeeded.
        // Refresh after a short delay to give Stripe time to deliver the webhook.
        await fetchWalletBalance();
        setTimeout(() => { fetchWalletBalance(); }, 4000);
        Alert.alert(
            'Deposit Successful',
            `${parsedAmount.toFixed(2)} ${currency.code} will be added to your wallet shortly.`,
            [{ text: 'Done', onPress: () => navigation.goBack() }]
        );
    };

    // ─────────────────────────────────────────
    // Render helpers
    // ─────────────────────────────────────────

    const renderAmountStep = () => (
        <>
            <View style={styles.balanceChip}>
                <Typography size="xs" color={COLORS.background.slate[500]}>Current balance: </Typography>
                <Typography size="xs" weight="bold" color={COLORS.primary}>{balance.toFixed(2)} {currency.code}</Typography>
            </View>

            <View style={styles.amountCard}>
                <Typography size="xs" weight="semibold" color={COLORS.background.slate[400]} style={{ letterSpacing: 1 }}>
                    AMOUNT TO DEPOSIT
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
                {parsedAmount > 0 && (
                    <Typography size="xs" color={COLORS.background.slate[400]}>
                        After: <Typography size="xs" weight="bold" color={COLORS.primary}>{(balance + parsedAmount).toFixed(2)} {currency.code}</Typography>
                    </Typography>
                )}
            </View>

            <View style={styles.quickGrid}>
                {QUICK_AMOUNTS.map((q) => (
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
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, !parsedAmount && styles.primaryBtnDisabled]}
                onPress={handleAmountNext}
                disabled={!parsedAmount}
                activeOpacity={0.85}
            >
                <Typography size="md" weight="bold" color={COLORS.white}>Choose Payment Method</Typography>
                <ChevronRight size={18} color={COLORS.white} />
            </TouchableOpacity>
        </>
    );

    const renderMethodStep = () => (
        <>
            <View style={styles.amountSummary}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Depositing</Typography>
                <Typography size="xl" weight="bold" color={COLORS.background.slate[900]}>{parsedAmount.toFixed(2)} {currency.code}</Typography>
            </View>

            <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.sectionLabel}>
                SELECT PAYMENT METHOD
            </Typography>

            {/* Credit / Debit Card */}
            <TouchableOpacity
                style={[styles.methodCard, loading && styles.primaryBtnDisabled]}
                onPress={() => handleMethodSelect('card')}
                activeOpacity={0.8}
                disabled={loading}
            >
                <View style={[styles.methodIconBox, { backgroundColor: '#eef2ff' }]}>
                    {loading
                        ? <ActivityIndicator size="small" color="#4f46e5" />
                        : <CreditCard size={24} color="#4f46e5" />
                    }
                </View>
                <View style={styles.methodText}>
                    <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>Credit / Debit Card</Typography>
                    <Typography size="xs" color={COLORS.background.slate[400]}>Visa, Mastercard, AMEX</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            {/* D17 */}
            <TouchableOpacity
                style={[styles.methodCard, loading && styles.primaryBtnDisabled]}
                onPress={() => handleMethodSelect('d17')}
                activeOpacity={0.8}
                disabled={loading}
            >
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
                    <Typography size="xs" color={COLORS.background.slate[400]}>Pay with your D17 mobile wallet</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            {/* Flouci */}
            <TouchableOpacity
                style={[styles.methodCard, loading && styles.primaryBtnDisabled]}
                onPress={() => handleMethodSelect('flouci')}
                activeOpacity={0.8}
                disabled={loading}
            >
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
                    <Typography size="xs" color={COLORS.background.slate[400]}>Fast payment via Flouci app</Typography>
                </View>
                <ChevronRight size={18} color={COLORS.background.slate[300]} />
            </TouchableOpacity>

            <View style={styles.securityNote}>
                <Lock size={13} color={COLORS.background.slate[400]} />
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginLeft: 6 }}>
                    Payments are encrypted and processed securely
                </Typography>
            </View>
        </>
    );

    const renderD17Form = () => (
        <>
            <View style={styles.providerHeader}>
                <View style={[styles.providerIcon, { backgroundColor: '#fef3c7' }]}>
                    <Smartphone size={28} color="#d97706" />
                </View>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>D17 Mobile Wallet</Typography>
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 4 }}>
                    Enter your D17 phone number. You'll receive a confirmation code in your D17 app.
                </Typography>
            </View>

            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>
                    D17 PHONE NUMBER
                </Typography>
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
                <Typography size="sm" color={COLORS.background.slate[500]}>Amount to deposit</Typography>
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
                    : <>
                        <Typography size="md" weight="bold" color={COLORS.white}>Send D17 Code</Typography>
                        <ChevronRight size={18} color={COLORS.white} />
                    </>
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
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>
                    CONFIRMATION CODE
                </Typography>
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

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#d97706' }, loading && styles.primaryBtnDisabled]}
                onPress={handleD17Confirm}
                disabled={loading}
                activeOpacity={0.85}
            >
                {loading
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <>
                        <CircleCheck size={18} color={COLORS.white} />
                        <Typography size="md" weight="bold" color={COLORS.white}>Confirm Payment</Typography>
                    </>
                }
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendRow} onPress={handleD17Request}>
                <RefreshCw size={14} color={COLORS.primary} />
                <Typography size="xs" color={COLORS.primary} weight="semibold" style={{ marginLeft: 6 }}>
                    Resend code
                </Typography>
            </TouchableOpacity>
        </>
    );

    const renderFlouciForm = () => (
        <>
            <View style={styles.providerHeader}>
                <View style={[styles.providerIcon, { backgroundColor: '#d1fae5' }]}>
                    <WalletMinimal size={28} color="#059669" />
                </View>
                <Typography size="lg" weight="bold" color={COLORS.background.slate[900]}>Pay with Flouci</Typography>
                <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 4 }}>
                    Enter your Flouci phone number. You'll be redirected to approve the payment.
                </Typography>
            </View>

            <View style={styles.inputGroup}>
                <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.inputLabel}>
                    FLOUCI PHONE NUMBER
                </Typography>
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
                <Typography size="sm" color={COLORS.background.slate[500]}>Amount to deposit</Typography>
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
                    : <>
                        <Typography size="md" weight="bold" color={COLORS.white}>Proceed to Flouci</Typography>
                        <ChevronRight size={18} color={COLORS.white} />
                    </>
                }
            </TouchableOpacity>
        </>
    );

    const stepTitle: Record<Step, string> = {
        amount:  'Add Money',
        method:  'Payment Method',
        details: method === 'd17' ? 'D17 Wallet' : 'Flouci',
        otp:     'Confirm Code',
        webview: 'Flouci Payment',
    };

    // ─────────────────────────────────────────
    // Flouci WebView (full-screen modal)
    // ─────────────────────────────────────────
    if (step === 'webview' && flouciUrl) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <View style={styles.webviewHeader}>
                    <TouchableOpacity onPress={() => setStep('details')} style={{ padding: 8 }}>
                        <X size={22} color={COLORS.background.slate[800]} />
                    </TouchableOpacity>
                    <Typography size="base" weight="bold" color={COLORS.background.slate[900]}>Flouci Payment</Typography>
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
                    {step === 'details' && method === 'd17'    && renderD17Form()}
                    {step === 'details' && method === 'flouci' && renderFlouciForm()}
                    {step === 'otp'     && renderD17Otp()}
                    <View style={{ height: 40 }} />
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
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg,
        marginBottom: SPACING.xl, alignItems: 'center',
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

    // ── Shared input
    inputGroup: { marginBottom: SPACING.lg },
    inputLabel: { letterSpacing: 0.8, marginBottom: SPACING.xs },
    inputBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    textInput: { flex: 1, fontSize: 16, color: COLORS.background.slate[900], padding: 0 },
    flagBox: {
        backgroundColor: COLORS.background.slate[50], borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 6, marginRight: 10,
    },

    // ── Provider header
    providerHeader: {
        alignItems: 'center', marginBottom: SPACING.xl, gap: 4,
    },
    providerIcon: {
        width: 68, height: 68, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },

    // ── OTP resend
    resendRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', marginTop: SPACING.lg,
    },

    // ── Primary button
    primaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 16,
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    primaryBtnDisabled: { opacity: 0.5 },

    // ── Flouci WebView
    webviewHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
        backgroundColor: COLORS.white, borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
});

export default DepositScreen;
