// Full-screen live tracking map. Shows GPS or flight based on session mode.
// Traveler can activate / switch / stop tracking. Sender sees live position only.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Plane, MapPin, Power, RefreshCcw } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useTrackingStore, selectDeal } from '../store/tracking.store';
import { useTrackingSocket } from '../hooks/useTrackingSocket';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useMapInterpolation } from '../hooks/useMapInterpolation';
import { GPSMapView } from '../components/tracking/GPSMapView';
import { FlightMapView } from '../components/tracking/FlightMapView';
import { TrackingModeSheet } from '../components/tracking/TrackingModeSheet';
import { SmartSwitchAlert } from '../components/tracking/SmartSwitchAlert';
import { trackingApi } from '../services/tracking/trackingApi';

interface LiveTrackingScreenProps {
  deal: any;
  currentUserId?: string;
  onBack: () => void;
}

export const LiveTrackingScreen: React.FC<LiveTrackingScreenProps> = ({
  deal,
  currentUserId,
  onBack,
}) => {
  const dealId = deal?.id;
  const isTraveler = currentUserId != null && currentUserId === deal?.travelerId;

  const state = useTrackingStore(selectDeal(dealId));
  const dismissSmartSwitch = useTrackingStore((s) => s.dismissSmartSwitch);
  const resetDeal = useTrackingStore((s) => s.resetDeal);

  const [showModeSheet, setShowModeSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // Join socket room + subscribe to events for this deal.
  useTrackingSocket(dealId);

  // Traveler-owned GPS subscription.
  useGPSTracking({
    dealId,
    enabled: isTraveler && state.mode === 'gps',
    isTraveler,
  });

  // Plane interpolation runs only in flight mode.
  useMapInterpolation(dealId, state.mode === 'flight');

  // Hydrate session from server on mount.
  useEffect(() => {
    if (!dealId) return;
    setHydrating(true);
    trackingApi
      .getSession(dealId)
      .then((res) => {
        if (res.success && res.data?.session) {
          useTrackingStore.getState().hydrateFromSession(res.data.session);
        }
      })
      .catch(() => {})
      .finally(() => setHydrating(false));
  }, [dealId]);

  const origin = useMemo(() => {
    if (deal?.origin?.lat != null && deal?.origin?.lng != null) {
      return { lat: deal.origin.lat, lng: deal.origin.lng };
    }
    if (deal?.fromLat != null && deal?.fromLng != null) {
      return { lat: deal.fromLat, lng: deal.fromLng };
    }
    return null;
  }, [deal]);

  const destination = useMemo(() => {
    if (deal?.destination?.lat != null && deal?.destination?.lng != null) {
      return { lat: deal.destination.lat, lng: deal.destination.lng };
    }
    if (deal?.toLat != null && deal?.toLng != null) {
      return { lat: deal.toLat, lng: deal.toLng };
    }
    return null;
  }, [deal]);

  const fromIata: string | undefined = deal?.fromIata ?? undefined;
  const toIata: string | undefined = deal?.toIata ?? undefined;
  const fromCity: string | undefined = deal?.fromCity ?? undefined;
  const toCity: string | undefined = deal?.toCity ?? undefined;
  const travelerAvatar: string | null = deal?.traveler?.profilePhoto ?? deal?.traveler?.avatar ?? null;

  const handleActivate = async (mode: 'gps' | 'flight', callsign?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await trackingApi.activate(dealId, mode, callsign);
      if (res.success) {
        setShowModeSheet(false);
        if (res.data?.session) {
          useTrackingStore.getState().hydrateFromSession(res.data.session);
        }
      } else {
        Alert.alert('Could not start tracking', res.error ?? 'Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Could not start tracking', e?.message ?? 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = () => {
    Alert.alert('Stop tracking?', 'Your location will no longer be shared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await trackingApi.deactivate(dealId);
            resetDeal(dealId);
          } catch {
            /* non-fatal */
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleSwitchToFlight = async () => {
    const callsign = state.flight.callsign ?? undefined;
    if (!callsign) {
      dismissSmartSwitch(dealId);
      return;
    }
    setBusy(true);
    try {
      await trackingApi.switchMode(dealId, 'flight', callsign);
      dismissSmartSwitch(dealId);
    } catch (e: any) {
      Alert.alert('Could not switch mode', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!dealId) {
    return (
      <SafeAreaView style={styles.center}>
        <Typography color={COLORS.background.slate[600]}>Missing deal.</Typography>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map layer */}
      {state.mode === 'flight' ? (
        <FlightMapView
          dealId={dealId}
          origin={origin ? { ...origin, iata: fromIata, city: fromCity } : null}
          destination={destination ? { ...destination, iata: toIata, city: toCity } : null}
          style={{ ...StyleSheet.absoluteFillObject }}
        />
      ) : (
        <GPSMapView
          dealId={dealId}
          origin={origin ? { ...origin, label: fromCity ?? fromIata } : null}
          destination={destination ? { ...destination, label: toCity ?? toIata } : null}
          travelerAvatar={travelerAvatar}
          style={{ ...StyleSheet.absoluteFillObject }}
        />
      )}

      {/* Header overlay */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={10}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Typography size="sm" weight="bold" color="#fff">
              {deal?.traveler?.name ?? deal?.travelerName ?? 'Traveler'}
            </Typography>
            <Typography size="xs" color="rgba(255,255,255,0.75)">
              {(fromCity ?? fromIata ?? '—')} → {(toCity ?? toIata ?? '—')}
            </Typography>
          </View>
          <View style={[styles.pill, { backgroundColor: pillColor(state.mode) }]}>
            <Typography size="xs" weight="bold" color="#fff">
              {pillLabel(state.mode)}
            </Typography>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom action bar */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafeArea} pointerEvents="box-none">
        {hydrating ? (
          <View style={styles.footerCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography size="sm" color={COLORS.background.slate[600]} style={{ marginTop: 6 }}>
              Loading live tracking…
            </Typography>
          </View>
        ) : isTraveler ? (
          state.mode === 'idle' ? (
            <TouchableOpacity
              style={[styles.ctaPrimary, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={() => setShowModeSheet(true)}
            >
              <Power size={18} color="#fff" />
              <Typography size="md" weight="bold" color="#fff" style={{ marginLeft: 8 }}>
                Activate tracking
              </Typography>
            </TouchableOpacity>
          ) : (
            <View style={styles.travelerActions}>
              <TouchableOpacity
                style={styles.ghostBtn}
                disabled={busy}
                onPress={() => setShowModeSheet(true)}
              >
                <RefreshCcw size={16} color={COLORS.primary} />
                <Typography size="sm" weight="bold" color={COLORS.primary} style={{ marginLeft: 6 }}>
                  Switch mode
                </Typography>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} disabled={busy} onPress={handleStop}>
                <Power size={16} color="#fff" />
                <Typography size="sm" weight="bold" color="#fff" style={{ marginLeft: 6 }}>
                  Stop
                </Typography>
              </TouchableOpacity>
            </View>
          )
        ) : (
          // Sender view — read-only status footer.
          state.mode === 'idle' ? (
            <View style={styles.footerCard}>
              <MapPin size={18} color={COLORS.background.slate[500]} />
              <Typography size="sm" color={COLORS.background.slate[700]} style={{ marginLeft: 8 }}>
                Tracking not yet activated by the traveler.
              </Typography>
            </View>
          ) : (
            <View style={styles.footerCard}>
              {state.mode === 'flight' ? (
                <Plane size={18} color={COLORS.info} />
              ) : (
                <MapPin size={18} color={COLORS.success} />
              )}
              <Typography size="sm" color={COLORS.background.slate[800]} style={{ marginLeft: 8, flex: 1 }}>
                {statusLine(state)}
              </Typography>
            </View>
          )
        )}
      </SafeAreaView>

      <TrackingModeSheet
        visible={showModeSheet}
        onClose={() => setShowModeSheet(false)}
        defaultMode={state.mode === 'flight' ? 'flight' : 'gps'}
        defaultCallsign={state.flight.callsign ?? ''}
        loading={busy}
        onActivate={handleActivate}
      />

      <SmartSwitchAlert
        visible={!!state.smartSwitch.pendingPrompt && isTraveler}
        callsign={state.flight.callsign}
        onDismiss={() => dismissSmartSwitch(dealId)}
        onSwitchToFlight={handleSwitchToFlight}
      />
    </View>
  );
};

function pillColor(mode: 'idle' | 'gps' | 'flight'): string {
  if (mode === 'gps') return COLORS.success;
  if (mode === 'flight') return COLORS.info;
  return 'rgba(15,23,42,0.6)';
}

function pillLabel(mode: 'idle' | 'gps' | 'flight'): string {
  if (mode === 'gps') return 'LIVE';
  if (mode === 'flight') return 'IN AIR';
  return 'IDLE';
}

function statusLine(state: ReturnType<ReturnType<typeof selectDeal>>): string {
  if (state.mode === 'flight') {
    const p = state.flight.interpolatedPosition ?? state.flight.currentPosition;
    if (!p) return 'Awaiting flight data…';
    if (p.onGround) return `${p.callsign} is on the ground`;
    return `${p.callsign}  ·  ${p.velocityKmh} km/h  ·  ${Math.round(p.altitudeM)}m`;
  }
  if (state.mode === 'gps') {
    const p = state.gps.currentPosition ?? state.gps.lastKnownPosition;
    if (!p) return 'Awaiting GPS fix…';
    const ago = Math.max(0, Math.floor((Date.now() - p.updatedAt) / 1000));
    return `Updated ${ago}s ago`;
  }
  return '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: '#fff',
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: SPACING.md,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, marginLeft: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  footerSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: Platform.OS === 'android' ? SPACING.md : 0,
  },
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    marginBottom: 12,
  },
  travelerActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  ghostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  stopBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.error,
  },
});
