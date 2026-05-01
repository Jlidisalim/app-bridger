import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api/client';

// Screen imports
import { SplashScreen } from '../screens/SplashScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PhoneEntryScreen } from '../screens/PhoneEntryScreen';
import { OTPVerificationScreen } from '../screens/OTPVerificationScreen';
import { FaceVerificationScreen } from '../screens/FaceVerificationScreen';
import { IDDocumentScanScreen } from '../screens/IDDocumentScanScreen';
import { PersonalInfoScreen } from '../screens/PersonalInfoScreen';
import { VerificationResultScreen } from '../screens/VerificationResultScreen';
import { SelfieVerificationScreen } from '../screens/SelfieVerificationScreen';
import { KYCStatusScreen } from '../screens/KYCStatusScreen';
import { ReceiverScanScreen } from '../screens/ReceiverScanScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// ============================================
// Wrapper screens that bridge props to navigation
// ============================================

const SplashWrapper = ({ navigation }: any) => {
  const advancedRef = React.useRef(false);
  const advance = React.useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    navigation.replace('Onboarding');
  }, [navigation]);

  // Safety net — advance even if the video never fires its end event.
  useEffect(() => {
    const timer = setTimeout(advance, 8000);
    return () => clearTimeout(timer);
  }, [advance]);

  return <SplashScreen onEnd={advance} />;
};

const OnboardingWrapper = ({ navigation }: any) => {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  return (
    <OnboardingScreen
      onSkip={() => {
        setOnboardingComplete(true);
        navigation.replace('PhoneEntry');
      }}
      onDone={() => {
        setOnboardingComplete(true);
        navigation.replace('PhoneEntry');
      }}
    />
  );
};

const PhoneEntryWrapper = ({ navigation }: any) => {
  const setPhone = useAppStore((s) => s.setPhone);
  return (
    <PhoneEntryScreen
      onContinue={(phone: string) => {
        setPhone(phone);
        navigation.navigate('OTPVerification', { phoneNumber: phone });
      }}
      onBack={() => navigation.goBack()}
      onReceiverMode={() => navigation.navigate('ReceiverScan')}
    />
  );
};

const OTPVerificationWrapper = ({ navigation, route }: any) => {
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setKYCStatus = useAppStore((s) => s.setKYCStatus);

  const handleVerify = () => {
    // After OTP verification, check if user is already verified
    // If kycStatus is APPROVED and user is verified, skip the full verification flow
    const user = useAppStore.getState().currentUser;
    const kyc = user?.kycStatus?.toLowerCase();
    if (user && (kyc === 'approved' || kyc === 'submitted') && user.verified) {
      // Already verified — skip FaceVerification/IDDocumentScan/PersonalInfo
      // Go directly to authenticated state
      setKYCStatus('approved');
      setAuthenticated(true);
    } else {
      // New user or not yet verified — continue with verification flow
      navigation.navigate('FaceVerification');
    }
  };

  return (
    <OTPVerificationScreen
      phoneNumber={route.params.phoneNumber}
      onVerify={handleVerify}
      onBack={() => navigation.goBack()}
    />
  );
};

const FaceVerificationWrapper = ({ navigation }: any) => {
  return (
    <FaceVerificationScreen
      onCapture={() => navigation.navigate('IDDocumentScan')}
      onBack={() => navigation.goBack()}
    />
  );
};

const IDDocumentScanWrapper = ({ navigation }: any) => {
  return (
    <IDDocumentScanScreen
      onContinue={() => navigation.navigate('PersonalInfo')}
      onBack={() => navigation.goBack()}
    />
  );
};

const PersonalInfoWrapper = ({ navigation }: any) => {
  return (
    <PersonalInfoScreen
      onContinue={() => navigation.navigate('VerificationResult')}
      onBack={() => navigation.goBack()}
    />
  );
};

const VerificationResultWrapper = ({ navigation }: any) => {
  return (
    <VerificationResultScreen
      onComplete={() => navigation.navigate('KYCStatus')}
      onRetry={() => navigation.navigate('FaceVerification')}
      // If the scanned ID card already belongs to another account, send the
      // user back to phone entry so they can log in with their existing account.
      onLoginInstead={() => navigation.replace('PhoneEntry')}
    />
  );
};

const SelfieVerificationWrapper = ({ navigation }: any) => {
  return (
    <SelfieVerificationScreen
      onCapture={() => navigation.navigate('KYCStatus')}
      onBack={() => navigation.goBack()}
    />
  );
};

const ReceiverScanWrapper = ({ navigation }: any) => {
  return (
    <ReceiverScanScreen
      onBack={() => navigation.goBack()}
      onSuccess={() => navigation.navigate('PhoneEntry')}
    />
  );
};

// FIX 17: KYCStatusWrapper fetches real user from /users/me instead of creating a dummy
const KYCStatusWrapper = ({ navigation }: any) => {
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setCurrentUser   = useAppStore((s) => s.setCurrentUser);
  const setKYCStatus     = useAppStore((s) => s.setKYCStatus);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<any>('/users/me')
      .then((res) => {
        if (res.success && res.data) {
          setCurrentUser(res.data);
          setKYCStatus((res.data.kycStatus?.toLowerCase() as any) || 'pending');
        } else {
          // Token invalid — send back to login
          navigation.replace('PhoneEntry');
        }
      })
      .catch(() => navigation.replace('PhoneEntry'))
      .finally(() => setLoading(false));
  }, []);

  const handleReturn = () => {
    setAuthenticated(true);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1E3B8A" />
      </View>
    );
  }

  return (
    <KYCStatusScreen
      onReturn={handleReturn}
      onBack={() => navigation.goBack()}
    />
  );
};

// ============================================
// Auth Stack Navigator
// New flow: Splash → Onboarding → PhoneEntry → OTPVerification
//           → FaceVerification → IDDocumentScan → PersonalInfo
//           → VerificationResult
// ============================================
export const AuthStack = () => {
  return (
    <Stack.Navigator
      id="AuthStack"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashWrapper} />
      <Stack.Screen name="Onboarding" component={OnboardingWrapper} />
      <Stack.Screen name="PhoneEntry" component={PhoneEntryWrapper} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationWrapper} />
      <Stack.Screen name="FaceVerification" component={FaceVerificationWrapper} />
      <Stack.Screen name="IDDocumentScan" component={IDDocumentScanWrapper} />
      <Stack.Screen name="PersonalInfo" component={PersonalInfoWrapper} />
      <Stack.Screen name="VerificationResult" component={VerificationResultWrapper} />
      <Stack.Screen name="SelfieVerification" component={SelfieVerificationWrapper} />
      <Stack.Screen name="ReceiverScan" component={ReceiverScanWrapper} />
      <Stack.Screen name="KYCStatus" component={KYCStatusWrapper} />
    </Stack.Navigator>
  );
};
