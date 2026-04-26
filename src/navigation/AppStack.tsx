import React, { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList, RootStackParamList } from './types';
import { useAppStore } from '../store/useAppStore';
import { dealsAPI, chatAPI } from '../services/api';
import { Alert, ActivityIndicator, View, TouchableOpacity } from 'react-native';
import { COLORS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { MainTabs } from './MainTabs';

// Screen imports
import { CreateSelectionScreen } from '../screens/CreateSelectionScreen';
import { PackageDetailsScreen } from '../screens/PackageDetailsScreen';
import { RouteSelectionScreen } from '../screens/RouteSelectionScreen';
import { ReceiverDetailsScreen } from '../screens/ReceiverDetailsScreen';
import { PricingScreen } from '../screens/PricingScreen';
import { ReviewPublishScreen } from '../screens/ReviewPublishScreen';
import { SuccessScreen } from '../screens/SuccessScreen';
import { TravelerRouteScreen } from '../screens/TravelerRouteScreen';
import { FlightDetailsScreen } from '../screens/FlightDetailsScreen';
import { CapacityScreen } from '../screens/CapacityScreen';
import { TravelerPricingScreen } from '../screens/TravelerPricingScreen';
import { TravelerReviewScreen } from '../screens/TravelerReviewScreen';
import { TravelerSuccessScreen } from '../screens/TravelerSuccessScreen';
import { DealDetailsScreen } from '../screens/DealDetailsScreen';
import { TrackingScreen } from '../screens/TrackingScreen';
import { LiveTrackingScreen } from '../screens/LiveTrackingScreen';
import { TrackingFullScreen } from '../screens/TrackingFullScreen';
import { DeliveryConfirmationScreen } from '../screens/DeliveryConfirmationScreen';
import { FinalSuccessScreen } from '../screens/FinalSuccessScreen';
import { DisputeScreen } from '../screens/DisputeScreen';
import { ChatDetailScreen } from '../screens/ChatDetailScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { HelpSupportScreen } from '../screens/HelpSupportScreen';
import { DepositScreen } from '../screens/DepositScreen';
import { WithdrawScreen } from '../screens/WithdrawScreen';
import { ReceiverCodeScreen } from '../screens/ReceiverCodeScreen';
import { ReservationScreen } from '../screens/ReservationScreen';

const Stack = createNativeStackNavigator<AppStackParamList>();

// ============================================
// Screen Wrappers
// ============================================

const CreateSelectionWrapper = ({ navigation }: any) => {
  const setMode = useAppStore((s) => s.setMode);
  return (
    <CreateSelectionScreen
      onBack={() => navigation.goBack()}
      onSelectSender={() => {
        setMode('sender');
        navigation.navigate('PackageDetails');
      }}
      onSelectTraveler={() => {
        setMode('traveler');
        navigation.navigate('TravelerRoute');
      }}
    />
  );
};

// --- Sender Flow Wrappers ---
const PackageDetailsWrapper = ({ navigation }: any) => {
  const setSenderPackage = useAppStore((s) => s.setSenderPackage);
  return (
    <PackageDetailsScreen
      onNext={(data) => {
        setSenderPackage({ category: data.category, weight: data.weight, images: data.images });
        navigation.navigate('RouteSelection');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const RouteSelectionWrapper = ({ navigation }: any) => {
  const setSenderRoute = useAppStore((s) => s.setSenderRoute);
  return (
    <RouteSelectionScreen
      onNext={(data) => {
        setSenderRoute({ from: data.from, to: data.to, departureDate: data.departureDate });
        navigation.navigate('ReceiverDetails');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const ReceiverDetailsWrapper = ({ navigation }: any) => {
  const setSenderReceiver = useAppStore((s) => s.setSenderReceiver);
  return (
    <ReceiverDetailsScreen
      onNext={(data) => {
        setSenderReceiver({ name: data.name, phone: data.phone });
        navigation.navigate('Pricing');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const PricingWrapper = ({ navigation }: any) => {
  const setSenderPricing = useAppStore((s) => s.setSenderPricing);
  return (
    <PricingScreen
      onConfirm={(data) => {
        setSenderPricing({ amount: parseFloat(data.price) || 0, negotiable: data.isNegotible, currency: 'USD' });
        navigation.navigate('ReviewPublish');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const ReviewPublishWrapper = ({ navigation }: any) => {
  const { senderPackage, senderRoute, senderReceiver, senderPricing, clearSenderFlow, fetchDeals } = useAppStore();

  const handlePublish = async () => {
    try {
      const result = await dealsAPI.createSenderDeal({
        package: senderPackage,
        route: senderRoute,
        receiver: senderReceiver,
        pricing: senderPricing,
      });
      if (result.success) {
        clearSenderFlow();
        // Refresh the deals list immediately so the new post appears on HomeTab
        fetchDeals(1, false).catch(() => {});
        navigation.navigate('SenderSuccess');
      } else {
        Alert.alert('Error', result.error || 'Failed to publish shipment. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to publish shipment. Please check your connection.');
    }
  };

  return (
    <ReviewPublishScreen
      onPublish={handlePublish}
      onBack={() => navigation.goBack()}
      onEditPackage={() => navigation.navigate('PackageDetails')}
      onEditRoute={() => navigation.navigate('RouteSelection')}
      onEditReceiver={() => navigation.navigate('ReceiverDetails')}
    />
  );
};

const SenderSuccessWrapper = ({ navigation }: any) => (
  <SuccessScreen
    onDone={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
  />
);

// --- Traveler Flow Wrappers ---
const TravelerRouteWrapper = ({ navigation }: any) => {
  const setTravelerRoute = useAppStore((s) => s.setTravelerRoute);
  return (
    <TravelerRouteScreen
      onNext={(data) => {
        setTravelerRoute({ from: data.from, to: data.to });
        navigation.navigate('FlightDetails');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const FlightDetailsWrapper = ({ navigation }: any) => {
  const setTravelerFlight = useAppStore((s) => s.setTravelerFlight);
  return (
    <FlightDetailsScreen
      onNext={(data) => {
        setTravelerFlight({ date: data.date || new Date().toISOString().slice(0, 10), time: data.time || '14:30', flexible: data.flexible ?? true });
        navigation.navigate('Capacity');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const CapacityWrapper = ({ navigation }: any) => {
  const setTravelerCapacity = useAppStore((s) => s.setTravelerCapacity);
  const setTravelerPackageTypes = useAppStore((s) => s.setTravelerPackageTypes);
  const setTravelerDescription = useAppStore((s) => s.setTravelerDescription);
  return (
    <CapacityScreen
      onNext={(data) => {
        setTravelerCapacity(data.weight);
        setTravelerPackageTypes([data.type === 'documents' ? 'Documents' : 'Small Parcel']);
        setTravelerDescription(data.description || '');
        navigation.navigate('TravelerPricing');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const TravelerPricingWrapper = ({ navigation }: any) => {
  const setTravelerPricing = useAppStore((s) => s.setTravelerPricing);
  return (
    <TravelerPricingScreen
      onNext={(data) => {
        setTravelerPricing({ amount: parseFloat(data.fee) || 0, negotiable: data.negotiable, currency: 'USD' });
        navigation.navigate('TravelerReview');
      }}
      onBack={() => navigation.goBack()}
    />
  );
};

const TravelerReviewWrapper = ({ navigation }: any) => {
  const { travelerRoute, travelerFlight, travelerCapacity, travelerPricing, travelerDescription, clearTravelerFlow, fetchDeals } = useAppStore();

  const handlePublish = async () => {
    try {
      const result = await dealsAPI.createTravelerTrip({
        route: travelerRoute,
        flight: travelerFlight,
        capacity: travelerCapacity,
        pricing: travelerPricing,
        description: travelerDescription,
      } as any);
      if (result.success) {
        clearTravelerFlow();
        fetchDeals(1, false).catch(() => {});
        navigation.navigate('TravelerSuccess', { tripId: result.tripId });
      } else {
        Alert.alert('Error', 'Failed to publish trip. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to publish trip. Please check your connection.');
    }
  };

  return (
    <TravelerReviewScreen
      onPublish={handlePublish}
      onBack={() => navigation.goBack()}
    />
  );
};

const TravelerSuccessWrapper = ({ navigation, route }: any) => (
  <TravelerSuccessScreen
    tripId={route.params?.tripId}
    onDone={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
  />
);

// --- Deal Flow Wrappers ---
// Maps a raw DB deal record to the shape expected by DealDetailsScreen.
function mapDealToScreen(raw: any) {
  const person = raw.sender || raw.traveler;
  const userAvatar = person?.profilePhoto || person?.avatar || raw.avatar || raw.profilePhoto || raw.userAvatar || raw.owner?.avatar || raw.owner?.profilePhoto;
  return {
    id: raw.id,
    title: raw.title || raw.name,
    name: person?.name || raw.senderName || raw.travelerName || raw.ownerName || raw.name || 'Unknown',
    price: raw.price ?? 0,
    negotiable: raw.negotiable ?? false,
    verified: person?.verified ?? raw.verified ?? false,
    status: raw.status,
    avatar: userAvatar,
    profilePhoto: userAvatar,
    rating: person?.rating ?? raw.rating,
    totalDeals: person?.totalDeals ?? raw.totalDeals,
    sender: raw.sender,
    traveler: raw.traveler,
    route: {
      from: raw.fromCity,
      to: raw.toCity,
      departureDate: raw.pickupDate || raw.departureDate
        ? new Date(raw.pickupDate || raw.departureDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : undefined,
    },
    package: {
      category: raw.packageSize || raw.packageTypes,
      weight: raw.weight || raw.maxWeight,
      description: raw.description,
    },
    // Backend (both list and detail) now always provide images as a parsed array.
    images: Array.isArray(raw.images) ? raw.images : [],
  };
}

const DealDetailsWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const type: 'deal' | 'trip' = route.params.type || 'deal';
  const isOwner: boolean = route.params.isOwner || false;

  const deals = useAppStore((s) => s.deals);
  const trips = useAppStore((s) => s.trips);
  const fetchDeals = useAppStore((s) => s.fetchDeals);
  const fetchTrips = useAppStore((s) => s.fetchTrips);

  // Seed from store so screen shows instantly (no blank state while fetching)
  const storeItem = type === 'trip'
    ? trips.find((t: any) => t.id === dealId)
    : deals.find((d: any) => d.id === dealId);

  const [deal, setDeal] = useState<any>(storeItem ? mapDealToScreen(storeItem) : null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    const fetch = type === 'trip'
      ? dealsAPI.getTrip(dealId)
      : dealsAPI.getDeal(dealId);

    fetch
      .then((raw) => {
        if (raw) setDeal(mapDealToScreen(raw));
        else if (!storeItem) setFetchFailed(true);
      })
      .catch(() => {
        if (!storeItem) setFetchFailed(true);
      });
  }, [dealId, type]);

  // Show error screen instead of infinite spinner when fetch fails and no cache
  if (fetchFailed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Typography weight="bold" color={COLORS.background.slate[500]}>Could not load post details</Typography>
        <TouchableOpacity
          style={{ marginTop: 16, padding: 12, backgroundColor: COLORS.primary, borderRadius: 12 }}
          onPress={() => navigation.goBack()}
        >
          <Typography color="#fff" weight="bold">Go Back</Typography>
        </TouchableOpacity>
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1E3B8A" />
      </View>
    );
  }

  return (
    <DealDetailsScreen
      deal={deal}
      isOwner={isOwner}
      isAccepting={accepting}
      entityType={type}
      onBack={() => navigation.goBack()}
      onAccept={async (price: number) => {
        if (accepting) return;
        setAccepting(true);
        try {
          const result = await dealsAPI.acceptDeal(dealId, price);
          if (result && (result as any).success !== false) {
            navigation.navigate('Tracking', { dealId });
          } else {
            const msg = (result as any)?.error || (result as any)?.message || 'Failed to accept deal. Please try again.';
            Alert.alert('Error', msg);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Network error. Please try again.';
          Alert.alert('Failed to Accept Deal', message);
        } finally {
          setAccepting(false);
        }
      }}
      onChat={(user: any) => navigation.navigate('ChatDetail', { user: { ...user, dealId: dealId } })}
      isDeleting={deleting}
      onDelete={isOwner ? () => {
        // CancelDialog already called the API — just refresh lists and go back
        if (type === 'trip') fetchTrips(1, false).catch(() => {});
        else fetchDeals(1, false).catch(() => {});
        navigation.goBack();
      } : undefined}
    />
  );
};

const TrackingWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const currentUser = useAppStore((s) => s.currentUser);
  const deal = deals.find((d) => d.id === dealId) || { id: dealId, name: 'Unknown', routeString: 'N/A' };

  const isSender = currentUser?.id === deal?.senderId;

  return (
    <TrackingScreen
      deal={deal}
      currentUserId={currentUser?.id}
      isSender={isSender}
      onBack={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onGenerateQR={() => navigation.navigate('DeliveryConfirmation', { dealId })}
      onScanQR={() => navigation.navigate('PickupScan', { dealId })}
      onCancel={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
      onDispute={() => navigation.navigate('Dispute', { dealId })}
      onReceiverCode={() => navigation.navigate('ReceiverCode', { dealId })}
      onLiveTracking={() => navigation.navigate('LiveTracking', { dealId })}
      onChat={() => {
        const otherUser = isSender ? deal?.traveler : deal?.sender;
        if (otherUser) {
          navigation.navigate('ChatDetail', { 
            user: { 
              ...otherUser, 
              userId: otherUser.id, 
              avatar: otherUser.profilePhoto,
              dealId 
            } 
          });
        }
      }}
    />
  );
};

const LiveTrackingWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const currentUser = useAppStore((s) => s.currentUser);
  const deal = deals.find((d: any) => d.id === dealId) || { id: dealId };

  return (
    <TrackingFullScreen
      deal={deal}
      currentUserId={currentUser?.id}
      onBack={() => navigation.goBack()}
    />
  );
};

// Retained for any older call sites that still expect the simpler screen.
void LiveTrackingScreen;

const DeliveryConfirmationWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const deal = deals.find((d) => d.id === dealId) || { id: dealId, name: 'Unknown' };

  return (
    <DeliveryConfirmationScreen
      deal={deal}
      onBack={() => navigation.goBack()}
      onConfirm={() => navigation.navigate('FinalSuccess')}
      onDecline={() => navigation.goBack()}
      onReserve={() => navigation.navigate('Reservation', { dealId })}
    />
  );
};

const FinalSuccessWrapper = ({ navigation }: any) => (
  <FinalSuccessScreen
    onHome={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
    onViewReceipt={() => navigation.navigate('Wallet')}
  />
);

const DisputeWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const deal = deals.find((d) => d.id === dealId) || { id: dealId, name: 'Unknown' };

  return (
    <DisputeScreen
      deal={deal}
      onBack={() => navigation.goBack()}
    />
  );
};

// --- Receiver Code Wrapper ---
const ReceiverCodeWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const deal = deals.find((d) => d.id === dealId) || { id: dealId };
  return <ReceiverCodeScreen deal={deal} onBack={() => navigation.goBack()} />;
};

// --- Reservation Wrapper ---
const ReservationWrapper = ({ navigation, route }: any) => {
  const dealId = route.params.dealId;
  const deals = useAppStore((s) => s.deals);
  const deal = deals.find((d) => d.id === dealId) || { id: dealId };
  return (
    <ReservationScreen
      deal={deal}
      onBack={() => navigation.goBack()}
      onComplete={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
    />
  );
};

// --- Auxiliary Wrappers ---
const ChatDetailWrapper = ({ navigation, route }: any) => {
  const [resolvedUser, setResolvedUser] = React.useState(() => route.params.user);

  React.useEffect(() => {
    const { user } = route.params;
    if (user.conversationId) return; // already have a room ID
    if (!user.dealId && !user.tripId) return; // nothing to create room for

    const promise = user.tripId
      ? chatAPI.getOrCreateRoom(user.tripId, 'trip')
      : chatAPI.getOrCreateRoom(user.dealId);

    promise
      .then((roomId: string) => {
        if (roomId) setResolvedUser((prev: any) => ({ ...prev, conversationId: roomId }));
      })
      .catch(() => {});
  }, [route.params.user.dealId, route.params.user.tripId, route.params.user.conversationId]);

  return (
    <ChatDetailScreen
      user={resolvedUser}
      onBack={() => navigation.goBack()}
    />
  );
};

const WalletWrapper = ({ navigation }: any) => (
  <WalletScreen
    onBack={() => navigation.goBack()}
    onDeposit={() => navigation.navigate('Deposit')}
    onWithdraw={() => navigation.navigate('Withdraw')}
    onTransfer={() => navigation.navigate('Withdraw')}
  />
);

const NotificationsWrapper = ({ navigation }: any) => (
  <NotificationsScreen />
);

const SettingsWrapper = ({ navigation }: any) => (
  <SettingsScreen />
);

const EditProfileWrapper = ({ navigation }: any) => (
  <EditProfileScreen />
);

const HelpSupportWrapper = ({ navigation }: any) => (
  <HelpSupportScreen />
);

// ============================================
// App Stack Navigator
// ============================================
export const AppStack = () => {
  return (
    <Stack.Navigator
      id="AppStack"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      {/* Sender Flow */}
      <Stack.Screen name="CreateSelection" component={CreateSelectionWrapper} />
      <Stack.Screen name="PackageDetails" component={PackageDetailsWrapper} />
      <Stack.Screen name="RouteSelection" component={RouteSelectionWrapper} />
      <Stack.Screen name="ReceiverDetails" component={ReceiverDetailsWrapper} />
      <Stack.Screen name="Pricing" component={PricingWrapper} />
      <Stack.Screen name="ReviewPublish" component={ReviewPublishWrapper} />
      <Stack.Screen name="SenderSuccess" component={SenderSuccessWrapper} />
      {/* Traveler Flow */}
      <Stack.Screen name="TravelerRoute" component={TravelerRouteWrapper} />
      <Stack.Screen name="FlightDetails" component={FlightDetailsWrapper} />
      <Stack.Screen name="Capacity" component={CapacityWrapper} />
      <Stack.Screen name="TravelerPricing" component={TravelerPricingWrapper} />
      <Stack.Screen name="TravelerReview" component={TravelerReviewWrapper} />
      <Stack.Screen name="TravelerSuccess" component={TravelerSuccessWrapper} />
      {/* Deal Flow */}
      <Stack.Screen name="DealDetails" component={DealDetailsWrapper} />
      <Stack.Screen name="Tracking" component={TrackingWrapper} />
      <Stack.Screen name="LiveTracking" component={LiveTrackingWrapper} />
      <Stack.Screen name="DeliveryConfirmation" component={DeliveryConfirmationWrapper} />
      <Stack.Screen name="FinalSuccess" component={FinalSuccessWrapper} />
      <Stack.Screen name="Dispute" component={DisputeWrapper} />
      <Stack.Screen name="ReceiverCode" component={ReceiverCodeWrapper} />
      <Stack.Screen name="Reservation" component={ReservationWrapper} />
      {/* Auxiliary */}
      <Stack.Screen name="ChatDetail" component={ChatDetailWrapper} />
      <Stack.Screen name="Wallet" component={WalletWrapper} />
      <Stack.Screen name="Deposit" component={DepositScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="Notifications" component={NotificationsWrapper} />
      <Stack.Screen name="Settings" component={SettingsWrapper} />
      <Stack.Screen name="EditProfile" component={EditProfileWrapper} />
      <Stack.Screen name="HelpSupport" component={HelpSupportWrapper} />
    </Stack.Navigator>
  );
};
