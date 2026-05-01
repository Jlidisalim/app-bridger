import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    CheckCircle2,
    X,
    CheckCircle,
    Wallet,
    ShieldCheck,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface FinalSuccessScreenProps {
    onHome: () => void;
    onViewReceipt: () => void;
}

export const FinalSuccessScreen: React.FC<FinalSuccessScreenProps> = ({ onHome, onViewReceipt }) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={onHome} style={styles.closeButton}>
                    <X color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography weight="bold" size="lg">Success</Typography>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.content}>
                <View style={styles.checkContainer}>
                    <View style={styles.checkOutline}>
                        <View style={styles.checkFilled}>
                            <CheckCircle2 size={60} color={COLORS.white} strokeWidth={3} />
                        </View>
                    </View>
                </View>

                <Typography weight="bold" size="3xl" style={styles.title}>Delivery Confirmed!</Typography>
                <Typography color={COLORS.background.slate[400]} style={styles.subtitle}>
                    Your package has been successfully delivered and verified.
                </Typography>

                <View style={styles.summaryCard}>
                    {/* Reusing an existing image or using a colored placeholder for the city view */}
                    <View style={styles.imagePlaceholder}>
                        <Image
                            source={require('../../assets/adaptive-icon.png')}
                            style={styles.heroImage}
                            resizeMode="cover"
                        />
                        <View style={styles.imageOverlay} />
                    </View>

                    <View style={styles.summaryContent}>
                        <Typography weight="bold" size="lg" style={{ marginBottom: 16 }}>Transaction Summary</Typography>

                        <View style={styles.summaryRow}>
                            <View style={styles.iconBox}>
                                <Wallet size={20} color={COLORS.primary} />
                            </View>
                            <View style={styles.summaryText}>
                                <Typography weight="bold" size="sm">Funds Released</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>Payment sent to Traveler</Typography>
                            </View>
                            <CheckCircle size={20} color="#10B981" fill="#10B98100" />
                        </View>

                        <View style={styles.summaryRow}>
                            <View style={styles.iconBox}>
                                <ShieldCheck size={20} color={COLORS.primary} />
                            </View>
                            <View style={styles.summaryText}>
                                <Typography weight="bold" size="sm">Transaction Completed</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]}>Closing order #BR-99281</Typography>
                            </View>
                            <CheckCircle size={20} color="#10B981" fill="#10B98100" />
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.homeButton} onPress={onHome}>
                        <Typography weight="bold" color={COLORS.white}>Back to Home</Typography>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.receiptLink} onPress={onViewReceipt}>
                        <Typography weight="bold" color={COLORS.background.slate[400]}>View Receipt</Typography>
                    </TouchableOpacity>
                </View>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
    },
    closeButton: {
        padding: 10,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    checkContainer: {
        marginTop: 20,
        marginBottom: 30,
    },
    checkOutline: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: '#F0FDF4',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkFilled: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    title: {
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        textAlign: 'center',
        paddingHorizontal: 20,
        lineHeight: 22,
        marginBottom: 40,
    },
    summaryCard: {
        width: '100%',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: '#F1F5F9',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    imagePlaceholder: {
        height: 140,
        backgroundColor: '#F1F5F9',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    summaryContent: {
        padding: 20,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F0F7FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryText: {
        flex: 1,
        marginLeft: 12,
    },
    footer: {
        width: '100%',
        marginTop: 'auto',
        paddingBottom: 20,
    },
    homeButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    receiptLink: {
        paddingVertical: 16,
        alignItems: 'center',
    },
});
