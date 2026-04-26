import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { StepIndicator } from '../components/StepIndicator';
import { ArrowLeft, Calendar, Search } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { AirportAutocomplete } from '../components/AirportAutocomplete';

interface RouteSelectionScreenProps {
    onNext: (route: any) => void;
    onBack: () => void;
}

export const RouteSelectionScreen: React.FC<RouteSelectionScreenProps> = ({ onNext, onBack }) => {
    const senderRoute = useAppStore((s) => s.senderRoute);
    const [from, setFrom] = useState(senderRoute?.from || '');
    const [to, setTo] = useState(senderRoute?.to || '');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(
        senderRoute?.departureDate ? new Date(senderRoute.departureDate) : null
    );

    const now = new Date();
    const [calYear, setCalYear] = useState(now.getFullYear());
    const [calMonth, setCalMonth] = useState(now.getMonth());

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const getCalendarDays = () => {
        const firstDay = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
        const days: { date: number; currentMonth: boolean }[] = [];
        for (let i = firstDay - 1; i >= 0; i--) {
            days.push({ date: daysInPrevMonth - i, currentMonth: false });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: i, currentMonth: true });
        }
        const remaining = 7 - (days.length % 7);
        if (remaining < 7) {
            for (let i = 1; i <= remaining; i++) {
                days.push({ date: i, currentMonth: false });
            }
        }
        return days;
    };

    const isPastDate = (day: number) => {
        const d = new Date(calYear, calMonth, day);
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return d < t;
    };

    const isSelectedDate = (day: number) => {
        if (!selectedDate) return false;
        return selectedDate.getFullYear() === calYear && selectedDate.getMonth() === calMonth && selectedDate.getDate() === day;
    };

    const formatDate = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    const formatDateISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        Route Selection
                    </Typography>
                </View>
                <StepIndicator currentStep={3} totalSteps={5} label="Travel Route" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.titleSection}>
                    <Typography size="2xl" weight="bold">Where is it going?</Typography>
                    <Typography size="base" color={COLORS.background.slate[600]}>
                        Enter the origin and destination for your package delivery.
                    </Typography>
                </View>

                <View style={styles.inputSection}>
                    <AirportAutocomplete
                        label="From (Origin)"
                        value={from}
                        onChange={setFrom}
                        placeholder="City, country or IATA"
                    />
                    <View style={styles.verticalSpacer} />
                    <AirportAutocomplete
                        label="To (Destination)"
                        value={to}
                        onChange={setTo}
                        placeholder="City, country or IATA"
                    />
                </View>

                <View style={styles.dateSection}>
                    <Typography weight="bold" style={styles.sectionTitle}>Departure Window</Typography>
                    <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(!showDatePicker)}>
                        <Calendar color={COLORS.background.slate[400]} size={20} />
                        <Typography color={selectedDate ? COLORS.background.slate[900] : COLORS.background.slate[600]}>
                            {selectedDate ? formatDate(selectedDate) : 'Select preferred date'}
                        </Typography>
                    </TouchableOpacity>

                    {showDatePicker && (
                        <View style={styles.calendarCard}>
                            <View style={styles.calendarHeader}>
                                <TouchableOpacity onPress={() => {
                                    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                                    else setCalMonth(m => m - 1);
                                }}>
                                    <ArrowLeft color={COLORS.background.slate[900]} size={18} />
                                </TouchableOpacity>
                                <Typography size="sm" weight="bold">{MONTH_NAMES[calMonth]} {calYear}</Typography>
                                <TouchableOpacity onPress={() => {
                                    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                                    else setCalMonth(m => m + 1);
                                }}>
                                    <ArrowLeft color={COLORS.background.slate[900]} size={18} style={{ transform: [{ rotate: '180deg' }] }} />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.daysRow}>
                                {DAY_NAMES.map((d, i) => (
                                    <Typography key={i} size="xs" weight="bold" color={COLORS.background.slate[400]} style={styles.dayCell}>{d}</Typography>
                                ))}
                            </View>
                            <View style={styles.datesGrid}>
                                {getCalendarDays().map((item, i) => {
                                    const selected = item.currentMonth && isSelectedDate(item.date);
                                    const past = item.currentMonth && isPastDate(item.date);
                                    return (
                                        <TouchableOpacity
                                            key={i}
                                            style={[styles.dateCell, selected && styles.dateCellSelected]}
                                            onPress={() => {
                                                if (item.currentMonth && !past) {
                                                    setSelectedDate(new Date(calYear, calMonth, item.date));
                                                    setShowDatePicker(false);
                                                }
                                            }}
                                            disabled={!item.currentMonth || past}
                                        >
                                            <Typography
                                                size="xs"
                                                weight={selected ? 'bold' : 'medium'}
                                                color={selected ? COLORS.white : past ? COLORS.background.slate[200] : item.currentMonth ? COLORS.background.slate[900] : COLORS.background.slate[300]}
                                            >
                                                {item.date}
                                            </Typography>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.searchSection}>
                    <Button
                        label="Find Available Carriers"
                        onPress={() => {
                            if (!from.trim()) {
                                Alert.alert('Origin required', 'Please enter the origin city or airport.');
                                return;
                            }
                            if (!to.trim()) {
                                Alert.alert('Destination required', 'Please enter the destination city or airport.');
                                return;
                            }
                            if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
                                Alert.alert('Invalid route', 'Origin and destination cannot be the same.');
                                return;
                            }
                            onNext({ from: from.trim(), to: to.trim(), departureDate: selectedDate ? formatDateISO(selectedDate) : undefined });
                        }}
                        icon={<Search color={COLORS.white} size={20} />}
                    />
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Button label="Back" variant="outline" onPress={onBack} />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    header: {
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    scrollContent: {
        padding: SPACING.xl,
    },
    titleSection: {
        marginBottom: SPACING.xxl,
        gap: 8,
    },
    inputSection: {
        backgroundColor: COLORS.white,
        padding: SPACING.lg,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        marginBottom: SPACING.xxl,
    },
    verticalSpacer: {
        height: 8,
    },
    dateSection: {
        marginBottom: SPACING.xxl,
    },
    sectionTitle: {
        marginBottom: SPACING.md,
    },
    datePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: SPACING.lg,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    searchSection: {
        marginTop: SPACING.lg,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
    calendarCard: {
        marginTop: SPACING.md,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    daysRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    dayCell: {
        flex: 1,
        textAlign: 'center',
    },
    datesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dateCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
    },
    dateCellSelected: {
        backgroundColor: COLORS.primary,
    },
});
