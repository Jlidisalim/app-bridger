import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Switch,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Clock, CalendarClock } from 'lucide-react-native';

interface FlightDetailsScreenProps {
    onNext: (flight: any) => void;
    onBack: () => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function getCalendarDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
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
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const FlightDetailsScreen: React.FC<FlightDetailsScreenProps> = ({ onNext, onBack }) => {
    const now = new Date();
    const [currentYear, setCurrentYear] = useState(now.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(now.getMonth());
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [selectedHour, setSelectedHour] = useState(14);
    const [selectedMinute, setSelectedMinute] = useState(30);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [isFlexible, setIsFlexible] = useState(true);

    const calendarDays = getCalendarDays(currentYear, currentMonth);
    const today = new Date();

    const goToPrevMonth = () => {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
        else setCurrentMonth(m => m - 1);
        setSelectedDay(null);
    };
    const goToNextMonth = () => {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
        else setCurrentMonth(m => m + 1);
        setSelectedDay(null);
    };

    const isPastDate = (day: number) => {
        const d = new Date(currentYear, currentMonth, day);
        const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return d < t;
    };

    const formatTime = (h: number, m: number) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hh = h % 12 || 12;
        return `${hh.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    const getSelectedDate = () => {
        if (!selectedDay) return null;
        return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    };

    const getSelectedDateDisplay = () => {
        if (!selectedDay) return 'No date selected';
        return `${MONTH_NAMES[currentMonth]} ${selectedDay}, ${currentYear}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Flight Details
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Step Info */}
                <View style={styles.stepInfoContainer}>
                    <View style={styles.stepHeaderRow}>
                        <Typography size="xs" weight="bold" color="#1E3B8A" style={{ letterSpacing: 1 }}>
                            STEP 2: FLIGHT DETAILS
                        </Typography>
                        <Typography size="sm" color={COLORS.background.slate[500]}>2 of 5</Typography>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: '40%' }]} />
                    </View>
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Typography size="3xl" weight="bold" color="#0F172A" style={{ lineHeight: 40 }}>
                        Flight Schedule
                    </Typography>
                    <Typography size="md" color={COLORS.background.slate[600]} style={{ marginTop: 12, lineHeight: 24 }}>
                        Tell us when you are traveling so we can match you with shipments.
                    </Typography>
                </View>

                {/* Calendar Card */}
                <View style={styles.calendarCard}>
                    <View style={styles.calendarHeader}>
                        <TouchableOpacity onPress={goToPrevMonth}>
                            <ChevronLeft color={COLORS.background.slate[900]} size={20} />
                        </TouchableOpacity>
                        <Typography size="md" weight="bold">{MONTH_NAMES[currentMonth]} {currentYear}</Typography>
                        <TouchableOpacity onPress={goToNextMonth}>
                            <ChevronRight color={COLORS.background.slate[900]} size={20} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.daysRow}>
                        {DAYS.map((day, i) => (
                            <Typography key={i} size="sm" weight="bold" color={COLORS.background.slate[400]} style={styles.dayText}>
                                {day}
                            </Typography>
                        ))}
                    </View>

                    <View style={styles.datesGrid}>
                        {calendarDays.map((item, i) => {
                            const isSelected = item.currentMonth && item.date === selectedDay;
                            const past = item.currentMonth && isPastDate(item.date);
                            return (
                                <View key={i} style={styles.dateCellWrapper}>
                                    <TouchableOpacity
                                        style={[
                                            styles.dateCell,
                                            isSelected && styles.dateCellSelected
                                        ]}
                                        onPress={() => {
                                            if (item.currentMonth && !past) setSelectedDay(item.date);
                                        }}
                                        disabled={!item.currentMonth || past}
                                    >
                                        <Typography
                                            size="sm"
                                            weight={isSelected ? 'bold' : 'medium'}
                                            color={
                                                isSelected
                                                    ? COLORS.white
                                                    : past
                                                        ? COLORS.background.slate[200]
                                                        : item.currentMonth
                                                            ? COLORS.background.slate[900]
                                                            : COLORS.background.slate[300]
                                            }
                                        >
                                            {item.date}
                                        </Typography>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>

                    {selectedDay && (
                        <View style={{ marginTop: 12, alignItems: 'center' }}>
                            <Typography size="sm" weight="semibold" color="#1E3B8A">
                                Selected: {getSelectedDateDisplay()}
                            </Typography>
                        </View>
                    )}
                </View>

                {/* Time Selection */}
                <View style={styles.timeSection}>
                    <Typography size="sm" weight="semibold" color="#0F172A" style={{ marginBottom: 8 }}>
                        Departure Time
                    </Typography>
                    <TouchableOpacity style={styles.timeInputBox} onPress={() => setShowTimePicker(!showTimePicker)}>
                        <Clock color={COLORS.background.slate[400]} size={20} />
                        <Typography size="base" color="#0F172A" style={{ flex: 1, marginLeft: 12 }}>
                            {formatTime(selectedHour, selectedMinute)}
                        </Typography>
                        <Clock color={COLORS.background.slate[900]} size={20} />
                    </TouchableOpacity>
                    {showTimePicker && (
                        <View style={styles.timePickerRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
                                {HOURS.map((h) => (
                                    <TouchableOpacity
                                        key={h}
                                        style={[styles.timePill, selectedHour === h && styles.timePillActive]}
                                        onPress={() => setSelectedHour(h)}
                                    >
                                        <Typography size="xs" weight={selectedHour === h ? 'bold' : 'medium'}
                                            color={selectedHour === h ? COLORS.white : COLORS.background.slate[700]}>
                                            {h.toString().padStart(2, '0')}
                                        </Typography>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 8 }}>
                                {MINUTES.map((m) => (
                                    <TouchableOpacity
                                        key={m}
                                        style={[styles.timePill, selectedMinute === m && styles.timePillActive]}
                                        onPress={() => { setSelectedMinute(m); setShowTimePicker(false); }}
                                    >
                                        <Typography size="xs" weight={selectedMinute === m ? 'bold' : 'medium'}
                                            color={selectedMinute === m ? COLORS.white : COLORS.background.slate[700]}>
                                            :{m.toString().padStart(2, '0')}
                                        </Typography>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* Flexible Dates Card */}
                <View style={styles.flexibleCard}>
                    <View style={styles.flexibleIcon}>
                        <CalendarClock color="#1E3B8A" size={24} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Typography size="sm" weight="bold" color="#0F172A">Flexible dates</Typography>
                        <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>
                            ± 3 days for better matches
                        </Typography>
                    </View>
                    <Switch
                        value={isFlexible}
                        onValueChange={setIsFlexible}
                        trackColor={{ false: COLORS.background.slate[200], true: '#1E3B8A' }}
                        thumbColor={COLORS.white}
                        ios_backgroundColor={COLORS.background.slate[200]}
                    />
                </View>

            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    <Button
                        label="Back"
                        variant="outline"
                        onPress={onBack}
                        style={styles.backCta}
                        textStyle={{ color: '#1E3B8A' }}
                    />
                    <Button
                        label="Continue"
                        onPress={() => {
                            const date = getSelectedDate();
                            if (!date) {
                                Alert.alert('Select a Date', 'Please select a departure date to continue.');
                                return;
                            }
                            onNext({
                                date,
                                time: formatTime(selectedHour, selectedMinute),
                                flexible: isFlexible,
                            });
                        }}
                        style={styles.nextCta}
                        icon={<ArrowRight color={COLORS.white} size={20} />}
                        iconPosition="right"
                    />
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
        paddingHorizontal: SPACING.xl,
        paddingVertical: 16,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerTitle: {
        color: COLORS.background.slate[900],
        fontSize: 18,
    },
    scrollContent: {
        paddingTop: SPACING.xl,
        paddingBottom: 40,
    },
    stepInfoContainer: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    stepHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1E3B8A',
        borderRadius: 3,
    },
    titleSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    calendarCard: {
        backgroundColor: '#F8FAFC',
        marginHorizontal: SPACING.xl,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        marginBottom: SPACING.xl,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    dayText: {
        width: 32,
        textAlign: 'center',
    },
    datesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    dateCellWrapper: {
        width: '14.28%', // 100 / 7
        alignItems: 'center',
        marginBottom: 8,
    },
    dateCell: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateCellSelected: {
        backgroundColor: '#1E3B8A',
        shadowColor: '#1E3B8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    timeSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    timeInputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
    },
    flexibleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: 16,
        padding: 16,
        marginHorizontal: SPACING.xl,
        backgroundColor: '#F8FAFC',
    },
    flexibleIcon: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
    footerButtons: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    backCta: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        borderColor: COLORS.background.slate[200],
    },
    nextCta: {
        flex: 2,
        backgroundColor: '#1E3B8A',
        height: 56,
        borderRadius: 28,
    },
    timePickerRow: {
        marginTop: 12,
        paddingVertical: 8,
    },
    timePill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: COLORS.background.slate[100],
        marginRight: 6,
    },
    timePillActive: {
        backgroundColor: '#1E3B8A',
    },
});
