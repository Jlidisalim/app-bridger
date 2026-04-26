// Single screen that morphs between three visual personalities based on
// detected transport mode (walking / car / flight). Auto-detection runs
// off the tracking store, but the traveler can still manually activate /
// switch / stop via the action bar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, MapPin, Plane, Power, RefreshCcw } from 'lucide-react-native';

import { COLORS, RADIUS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useTrackingStore, selectDeal } from '../store/tracking.store';
import { useTrackingSocket } from '../hooks/useTrackingSocket';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useMapInterpolation } from '../hooks/useMapInterpolation';
import { useTransportMode, TransportMode } from '../hooks/useTransportMode';
import { useSmoothPosition } from '../hooks/useSmoothPosition';
import { trackingApi } from '../services/tracking/trackingApi';

import { WalkingMap } from '../components/tracking/maps/WalkingMap';
import { CarMap } from '../components/tracking/maps/CarMap';
import { FlightMap } from '../components/tracking/maps/FlightMap';
import { WalkingStatusCard } from '../components/tracking/cards/WalkingStatusCard';
import { CarStatusCard } from '../components/tracking/cards/CarStatusCard';
import { FlightStatusCard } from '../components/tracking/cards/FlightStatusCard';
import { ModeTransitionOverlay } from '../components/tracking/overlays/ModeTransitionOverlay';
import { StarsOverlay } from '../components/tracking/overlays/StarsOverlay';
import { TrackingModeSheet } from '../components/tracking/TrackingModeSheet';
import { SmartSwitchAlert } from '../components/tracking/SmartSwitchAlert';

interface Props {
  deal: any;
  currentUserId?: string;
  onBack: () => void;
}

export const TrackingFullScreen: React.FC<Props> = ({ deal, currentUserId, onBack }) => {
  const dealId = deal?.id;
  const isTraveler = currentUserId != null && currentUserId === deal?.travelerId;

  const state              = useTrackingStore(selectDeal(dealId));
  const dismissSmartSwitch = useTrackingStore((s) => s.dismissSmartSwitch);
  const resetDeal          = useTrackingStore((s) => s.resetDeal);

  const [showModeSheet, setShowModeSheet] = useState(false);
  const [busy,           setBusy]         = useState(false);
  const [hydrating,      setHydrating]    = useState(true);

  useTrackingSocket(dealId);
  useGPSTracking({
    dealId,
    enabled: isTraveler && state.mode === 'gps',
    isTraveler,
  });
  useMapInterpolation(dealId, state.mode === 'flight');

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

  // Transport mode + smoothed position for the active marker.
  const { mode, speedKmh, altitudeM, headingDeg, onGround, isStale, updatedAt } =
    useTransportMode(dealId);

  const smoothTarget = useMemo(() => {
    if (state.mode === 'flight') {
      const p = state.flight.interpolatedPosition ?? state.flight.currentPosition;
      if (!p) return null;
      return {
        lat: p.lat,
        lng: p.lng,
        heading: p.headingDeg,
        speedMs: p.velocityMs,
        updatedAt: p.updatedAt,
      };
    }
    const p = state.gps.currentPosition ?? state.gps.lastKnownPosition;
    if (!p) return null;
    return {
      lat: p.lat,
      lng: p.lng,
      heading: p.heading ?? 0,
      speedMs: p.speed ?? 0,
      updatedAt: p.updatedAt,
    };
  }, [
    state.mode,
    state.flight.interpolatedPosition,
    state.flight.currentPosition,
    state.gps.currentPosition,
    state.gps.lastKnownPosition,
  ]);

  const smoothPos = useSmoothPosition(smoothTarget, { enabled: true });

  // Fire the transition overlay whenever the effective mode flips.
  const [overlayMode, setOverlayMode] = useState<TransportMode | null>(null);
  const overlayNonce = useRef(0);
  const prevMode = useRef<TransportMode | null>(null);
  useEffect(() => {
    if (state.mode === 'idle') {
      prevMode.current = null;
      setOverlayMode(null);
      return;
    }
    if (prevMode.current !== mode) {
      overlayNonce.current += 1;
      setOverlayMode(mode);
      prevMode.current = mode;
    }
  }, [mode, state.mode]);

  const origin = useMemo(() => {
    if (deal?.origin?.lat != null && deal?.origin?.lng != null) return { lat: deal.origin.lat, lng: deal.origin.lng };
    if (deal?.fromLat != null && deal?.fromLng != null) return { lat: deal.fromLat, lng: deal.fromLng };
    return null;
  }, [deal]);

  const destination = useMemo(() => {
    if (deal?.destination?.lat != null && deal?.destination?.lng != null) return { lat: deal.destination.lat, lng: deal.destination.lng };
    if (deal?.toLat != null && deal?.toLng != null) return { lat: deal.toLat, lng: deal.toLng };
    return null;
  }, [deal]);

  const fromIata: string | undefined = deal?.fromIata ?? undefined;
  const toIata:   string | undefined = deal?.toIata   ?? undefined;
  const fromCity: string | undefined = deal?.fromCity ?? undefined;
  const toCity:   string | undefined = deal?.toCity   ?? undefined;
  const travelerAvatar: string | null = deal?.traveler?.profilePhoto ?? deal?.traveler?.avatar ?? null;
  const travelerName:   string | null = deal?.traveler?.name ?? deal?.travelerName ?? null;

  const handleActivate = async (modeToActivate: 'gps' | 'flight', callsign?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await trackingApi.activate(dealId, modeToActivate, callsign);
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

  const handleStop = useCallback(() => {
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
  }, [dealId, resetDeal]);

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

  const isFlight = state.mode === 'flight';
  const tint     = modeTint(isFlight ? 'flight' : mode);

  return (
    <View style={[styles.container, { backgroundColor: tint.bg }]}>
      {/* Map layer — swaps per mode */}
       {state.mode === 'idle' ? (
         <View style={[StyleSheet.absoluteFill, { backgroundColor: '#f1f5f9' }]} />
       ) : isFlight ? (
         <FlightMap
           dealId={dealId}
           origin={origin ? { ...origin, iata: fromIata, city: fromCity } : null}
           destination={destination ? { ...destination, iata: toIata, city: toCity } : null}
           style={{ ...StyleSheet.absoluteFillObject }}
         />
       ) : mode === 'walking' ? (
         <WalkingMap
           dealId={dealId}
           travelerAvatar={travelerAvatar}
           style={{ ...StyleSheet.absoluteFillObject }}
         />
       ) : (
         <CarMap
           dealId={dealId}
           style={{ ...StyleSheet.absoluteFillObject }}
         />
       )}

      {isFlight && <StarsOverlay />}

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe} pointerEvents="box-none">
        <View style={[styles.headerRow, { backgroundColor: tint.header }]}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={10}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Typography size="sm" weight="bold" color="#fff">
              {travelerName ?? 'Traveler'}
            </Typography>
            <Typography size="xs" color="rgba(255,255,255,0.75)">
              {(fromCity ?? fromIata ?? '—')} → {(toCity ?? toIata ?? '—')}
            </Typography>
          </View>
          <View style={[styles.pill, { backgroundColor: tint.pill }]}>
            <Typography size="xs" weight="bold" color="#fff">{tint.label}</Typography>
          </View>
        </View>
      </SafeAreaView>

      {/* Status card + action bar */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafe} pointerEvents="box-none">
        {hydrating ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Typography size="sm" color={COLORS.background.slate[600]} style={{ marginTop: 6 }}>
              Loading live tracking…
            </Typography>
          </View>
        ) : state.mode === 'idle' ? (
          isTraveler ? (
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
            <View style={styles.idleCard}>
              <MapPin size={18} color={COLORS.background.slate[500]} />
              <Typography size="sm" color={COLORS.background.slate[700]} style={{ marginLeft: 8 }}>
                Tracking not yet activated by the traveler.
              </Typography>
            </View>
          )
        ) : (
          <View style={{ gap: 10 }}>
            {mode === 'walking' && (
              <WalkingStatusCard
                speedKmh={speedKmh}
                updatedAt={updatedAt}
                isStale={isStale}
                travelerName={travelerName}
              />
            )}
            {mode === 'car' && (
              <CarStatusCard
                speedKmh={speedKmh}
                headingDeg={headingDeg}
                updatedAt={updatedAt}
                isStale={isStale}
                travelerName={travelerName}
              />
            )}
            {mode === 'flight' && (
              <FlightStatusCard
                callsign={state.flight.callsign}
                speedKmh={speedKmh}
                altitudeM={altitudeM}
                verticalRate={state.flight.currentPosition?.verticalRate ?? 0}
                onGround={onGround}
                isStale={isStale}
                updatedAt={updatedAt}
              />
            )}

            {isTraveler && (
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
            )}

            {!isTraveler && state.mode !== 'idle' && (
              <View style={styles.senderBadge}>
                {isFlight ? (
                  <Plane size={16} color={COLORS.info} />
                ) : (
                  <MapPin size={16} color={COLORS.success} />
                )}
                <Typography size="xs" color={COLORS.background.slate[700]} style={{ marginLeft: 6 }}>
                  {isFlight ? 'Tracking via flight data' : 'Tracking via GPS'}
                </Typography>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>

      <ModeTransitionOverlay
        mode={overlayMode}
        nonce={overlayNonce.current}
        onDone={() => setOverlayMode(null)}
      />

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

interface ModeTint {
  bg:     string;
  header: string;
  pill:   string;
  label:  string;
}

function modeTint(mode: TransportMode | 'idle'): ModeTint {
  if (mode === 'flight')  return { bg: '#0a1628', header: 'rgba(10,22,40,0.72)',  pill: '#2563eb', label: 'IN AIR'  };
  if (mode === 'car')     return { bg: '#0f172a', header: 'rgba(15,23,42,0.72)',  pill: '#3b82f6', label: 'DRIVING' };
  if (mode === 'walking') return { bg: '#ecfdf5', header: 'rgba(22,101,52,0.72)', pill: '#22c55e', label: 'WALKING' };
  return                          { bg: '#0d1117', header: 'rgba(15,23,42,0.72)', pill: '#64748b', label: 'IDLE'    };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: '#fff',
  },
  headerSafe: {
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
  footerSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: Platform.OS === 'android' ? SPACING.md : 0,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  idleCard: {
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
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
});
