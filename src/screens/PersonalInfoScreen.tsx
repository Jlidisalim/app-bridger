import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  User,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';

interface PersonalInfoScreenProps {
  onContinue: () => void;
  onBack: () => void;
}

// ── Date helpers ───────────────────────────────────────────────

function normalisedDate(s: string): string {
  return s.replace(/\D/g, '');
}

/** True when extracted birthday is partial — day+year known, month unknown ("16/?/2003") */
function isPartialBirthday(extracted: string | null): boolean {
  return !!extracted && extracted.includes('?');
}

function checkFirstName(val: string): string {
  if (val.trim().length < 2) return 'First name must be at least 2 characters';
  return '';
}

function checkLastName(val: string): string {
  if (val.trim().length < 2) return 'Last name must be at least 2 characters';
  return '';
}

function checkBirthday(val: string, extracted: string | null): string {
  const digits = val.replace(/\D/g, '');

  if (extracted) {
    if (digits.length === 0) return 'Required — enter your date of birth from your ID card';
    if (digits.length < 8)   return 'Enter full date dd/mm/yyyy';

    if (isPartialBirthday(extracted)) {
      // Month couldn't be read from OCR — validate day and year only
      const [extDay, , extYear] = extracted.split('/');
      const userDay  = digits.slice(0, 2);
      const userYear = digits.slice(4, 8);
      if (userDay !== extDay || userYear !== extYear)
        return `Day or year doesn't match your ID card (detected: day ${extDay}, year ${extYear})`;
      return '';
    }

    if (normalisedDate(val) !== normalisedDate(extracted))
      return `Does not match your ID card (expected: ${extracted})`;
    return '';
  }

  if (digits.length > 0 && digits.length < 8) return 'Enter full date dd/mm/yyyy';
  return '';
}

// ── Component ─────────────────────────────────────────────────

export const PersonalInfoScreen: React.FC<PersonalInfoScreenProps> = ({
  onContinue,
  onBack,
}) => {
  const {
    extractedIdNumber,
    extractedBirthday,
    setCurrentUser,
    currentUser,
    phone,
  } = useAppStore();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  // Don't pre-fill partial dates ("16/?/2003") — user must enter the full date
  const [birthday,  setBirthday]  = useState(
    extractedBirthday && !isPartialBirthday(extractedBirthday) ? extractedBirthday : ''
  );

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError,  setLastNameError]  = useState('');
  const [birthdayError,  setBirthdayError]  = useState('');

  // Run birthday validation on mount so pre-filled value shows correct state
  useEffect(() => {
    setBirthdayError(checkBirthday(birthday, extractedBirthday));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isValid = useMemo(
    () =>
      !checkFirstName(firstName) &&
      !checkLastName(lastName) &&
      !checkBirthday(birthday, extractedBirthday),
    [firstName, lastName, birthday, extractedBirthday]
  );

  // ── Birthday formatter ────────────────────────────────────────

  const formatBirthdayInput = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  };

  // ── Continue ──────────────────────────────────────────────────

  const handleContinue = () => {
    const fnErr = checkFirstName(firstName);
    const lnErr = checkLastName(lastName);
    const bdErr = checkBirthday(birthday, extractedBirthday);
    setFirstNameError(fnErr);
    setLastNameError(lnErr);
    setBirthdayError(bdErr);
    if (fnErr || lnErr || bdErr) return;

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const user = currentUser
      ? { ...currentUser, name: fullName }
      : {
          id: '0',
          name: fullName,
          phone,
          verified: false,
          rating: 5.0,
          memberSince: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          completionRate: 100,
          totalDeals: 0,
          kycStatus: 'pending' as const,
        };
    setCurrentUser(user);
    onContinue();
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Personal Information</Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Banner */}
        <View style={styles.infoBanner}>
          <AlertCircle size={16} color="#2563EB" />
          <Typography size="sm" color="#1E40AF" style={{ marginLeft: 8, flex: 1 }}>
            Enter your name exactly as it appears on your ID card.
          </Typography>
        </View>

        {/* First Name */}
        <View style={styles.fieldGroup}>
          <Typography size="sm" weight="semibold" color={COLORS.background.slate[700]} style={styles.label}>
            First Name
          </Typography>
          <View style={[
            styles.inputRow,
            firstNameError ? styles.inputError
              : (firstName && !checkFirstName(firstName) ? styles.inputSuccess : null),
          ]}>
            <User size={18} color={COLORS.background.slate[400]} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(v) => {
                setFirstName(v);
                setFirstNameError(checkFirstName(v));
              }}
              onBlur={() => setFirstNameError(checkFirstName(firstName))}
              placeholder="Enter your first name"
              placeholderTextColor={COLORS.background.slate[400]}
              autoCapitalize="words"
            />
            {firstNameError
              ? <XCircle size={16} color={COLORS.error} />
              : firstName.trim().length >= 2
                ? <CheckCircle2 size={16} color={COLORS.success} />
                : null}
          </View>
          {firstNameError ? (
            <Typography size="xs" color={COLORS.error} style={{ marginTop: 4 }}>
              {firstNameError}
            </Typography>
          ) : null}
        </View>

        {/* Last Name */}
        <View style={styles.fieldGroup}>
          <Typography size="sm" weight="semibold" color={COLORS.background.slate[700]} style={styles.label}>
            Last Name (Surname)
          </Typography>
          <View style={[
            styles.inputRow,
            lastNameError ? styles.inputError
              : (lastName && !checkLastName(lastName) ? styles.inputSuccess : null),
          ]}>
            <User size={18} color={COLORS.background.slate[400]} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(v) => {
                setLastName(v);
                setLastNameError(checkLastName(v));
              }}
              onBlur={() => setLastNameError(checkLastName(lastName))}
              placeholder="Enter your last name"
              placeholderTextColor={COLORS.background.slate[400]}
              autoCapitalize="words"
            />
            {lastNameError
              ? <XCircle size={16} color={COLORS.error} />
              : lastName.trim().length >= 2
                ? <CheckCircle2 size={16} color={COLORS.success} />
                : null}
          </View>
          {lastNameError ? (
            <Typography size="xs" color={COLORS.error} style={{ marginTop: 4 }}>
              {lastNameError}
            </Typography>
          ) : null}
        </View>

        {/* Birthday */}
        <View style={styles.fieldGroup}>
          <Typography size="sm" weight="semibold" color={COLORS.background.slate[700]} style={styles.label}>
            Date of Birth
          </Typography>
          <View style={[
            styles.inputRow,
            birthdayError ? styles.inputError
              : (birthday && !checkBirthday(birthday, extractedBirthday) ? styles.inputSuccess : null),
          ]}>
            <Calendar size={18} color={COLORS.background.slate[400]} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={birthday}
              onChangeText={(t) => {
                const formatted = formatBirthdayInput(t);
                setBirthday(formatted);
                setBirthdayError(checkBirthday(formatted, extractedBirthday));
              }}
              onBlur={() => setBirthdayError(checkBirthday(birthday, extractedBirthday))}
              placeholder="dd/mm/yyyy"
              placeholderTextColor={COLORS.background.slate[400]}
              keyboardType="numeric"
              maxLength={10}
            />
            {birthdayError
              ? <XCircle size={16} color={COLORS.error} />
              : birthday && !checkBirthday(birthday, extractedBirthday)
                ? <CheckCircle2 size={16} color={COLORS.success} />
                : null}
          </View>
          {birthdayError ? (
            <Typography size="xs" color={COLORS.error} style={{ marginTop: 4 }}>
              {birthdayError}
            </Typography>
          ) : isPartialBirthday(extractedBirthday) ? (
            <Typography size="xs" color="#D97706" style={{ marginTop: 4 }}>
              {`Month couldn't be read — enter full date (detected: day ${extractedBirthday!.split('/')[0]}, year ${extractedBirthday!.split('/')[2]})`}
            </Typography>
          ) : extractedBirthday ? (
            <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>
              {`Detected from your ID: ${extractedBirthday}`}
            </Typography>
          ) : (
            <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>
              Format: dd/mm/yyyy
            </Typography>
          )}
        </View>

        {/* ID Number (read-only, detected from card) */}
        {extractedIdNumber ? (
          <View style={styles.fieldGroup}>
            <Typography size="sm" weight="semibold" color={COLORS.background.slate[700]} style={styles.label}>
              ID Card Number (detected)
            </Typography>
            <View style={[styles.inputRow, styles.inputReadOnly]}>
              <CreditCard size={18} color={COLORS.primary} style={{ marginRight: 10 }} />
              <Typography style={styles.idNumberText}>{extractedIdNumber}</Typography>
              <CheckCircle2 size={16} color={COLORS.success} />
            </View>
            <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>
              Read from your ID card — verify this matches
            </Typography>
          </View>
        ) : null}

        <Button
          label="Confirm & Continue"
          onPress={handleContinue}
          disabled={!isValid}
          style={styles.button}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}1A`,
  },
  backButton:   { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  content:      { padding: SPACING.xl },
  infoBanner:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', borderRadius: RADIUS.sm,
    padding: SPACING.md, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  fieldGroup:   { marginBottom: SPACING.lg },
  label:        { marginBottom: 8 },
  inputRow:     {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
  },
  inputSuccess: { borderColor: COLORS.success, backgroundColor: '#F0FDF4' },
  inputError:   { borderColor: COLORS.error,   backgroundColor: '#FEF2F2' },
  inputReadOnly: { borderColor: COLORS.success, backgroundColor: '#F0FDF4' },
  input:        { flex: 1, fontSize: 15, color: COLORS.background.slate[900], padding: 0 },
  idNumberText: { flex: 1, fontSize: 15, color: COLORS.background.slate[900], fontWeight: '600', letterSpacing: 1 },
  button: {},
});
