// Bridger Map Service
// Handles map integration for tracking shipments

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Map configuration
const getMapsApiKey = (): string => {
  const key = Constants.expoConfig?.extra?.googleMapsApiKey;
  if (!key) {
    console.warn('Google Maps API key not configured');
    return '';
  }
  return key;
};

const MAP_CONFIG = {
  defaultLatitude: 51.5074,
  defaultLongitude: -0.1278,
  defaultZoom: 10,
  styleUrl: 'mapbox://styles/mapbox/streets-v11',
  googleMapsApiKey: getMapsApiKey(),
};

// Location types
export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface LocationWithAddress extends LocationCoords {
  address?: string;
  timestamp: number;
}

// Helper functions (avoiding 'this')
function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function calculateDistance(from: LocationCoords, to: LocationCoords): number {
  const R = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Map Service
export const mapService = {
  requestPermission: async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request location permission:', error);
      return false;
    }
  },

  hasPermission: async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  getCurrentLocation: async (): Promise<LocationWithAddress | null> => {
    try {
      const hasPerms = await mapService.hasPermission();
      if (!hasPerms) {
        const granted = await mapService.requestPermission();
        if (!granted) return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let address: string | undefined;
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        
        if (results.length > 0) {
          const addr = results[0];
          address = [addr.streetNumber, addr.street, addr.city, addr.country]
            .filter(Boolean).join(', ');
        }
      } catch {
        // Geocoding failed
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Failed to get current location:', error);
      return null;
    }
  },

  watchLocation: async (
    callback: (location: LocationWithAddress) => void,
    options: {
      accuracy?: Location.Accuracy;
      distanceInterval?: number;
      timeInterval?: number;
    } = {}
  ): Promise<Location.LocationSubscription | null> => {
    try {
      const hasPerms = await mapService.hasPermission();
      if (!hasPerms) {
        const granted = await mapService.requestPermission();
        if (!granted) return null;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy || Location.Accuracy.Balanced,
          distanceInterval: options.distanceInterval || 100,
          timeInterval: options.timeInterval || 5000,
        },
        (location) => {
          callback({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
          });
        }
      );

      return subscription;
    } catch (error) {
      console.error('Failed to watch location:', error);
      return null;
    }
  },

  calculateDistance,

  getRoute: async (
    from: LocationCoords,
    to: LocationCoords
  ): Promise<{
    distance: number;
    duration: number;
    polyline: LocationCoords[];
  } | null> => {
    try {
      const distance = calculateDistance(from, to);
      const duration = (distance / 60) * 60;

      const polyline: LocationCoords[] = [];
      const steps = Math.max(5, Math.ceil(distance * 2));
      
      for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        polyline.push({
          latitude: from.latitude + (to.latitude - from.latitude) * ratio,
          longitude: from.longitude + (to.longitude - from.longitude) * ratio,
        });
      }

      return { distance, duration, polyline };
    } catch (error) {
      console.error('Failed to get route:', error);
      return null;
    }
  },

  formatDistance,

  formatDuration,

  getRegion: (
    coords: LocationCoords[],
    padding = 0.1
  ): {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } => {
    if (coords.length === 0) {
      return {
        latitude: MAP_CONFIG.defaultLatitude,
        longitude: MAP_CONFIG.defaultLongitude,
        latitudeDelta: MAP_CONFIG.defaultZoom,
        longitudeDelta: MAP_CONFIG.defaultZoom,
      };
    }

    if (coords.length === 1) {
      return {
        latitude: coords[0].latitude,
        longitude: coords[0].longitude,
        latitudeDelta: MAP_CONFIG.defaultZoom,
        longitudeDelta: MAP_CONFIG.defaultZoom,
      };
    }

    let minLat = coords[0].latitude;
    let maxLat = coords[0].latitude;
    let minLng = coords[0].longitude;
    let maxLng = coords[0].longitude;

    coords.forEach(c => {
      minLat = Math.min(minLat, c.latitude);
      maxLat = Math.max(maxLat, c.latitude);
      minLng = Math.min(minLng, c.longitude);
      maxLng = Math.max(maxLng, c.longitude);
    });

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const deltaLat = (maxLat - minLat) * (1 + padding);
    const deltaLng = (maxLng - minLng) * (1 + padding);

    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: Math.max(deltaLat, 0.01),
      longitudeDelta: Math.max(deltaLng, 0.01),
    };
  },

  airportLocations: {
    'LHR': { latitude: 51.4700, longitude: -0.4543 },
    'JFK': { latitude: 40.6413, longitude: -73.7781 },
    'DXB': { latitude: 25.2532, longitude: 55.3657 },
    'BOM': { latitude: 19.0896, longitude: 72.8656 },
    'LAX': { latitude: 33.9416, longitude: -118.4085 },
    'CDG': { latitude: 49.0097, longitude: 2.5479 },
    'SIN': { latitude: 1.3644, longitude: 103.9915 },
    'HKG': { latitude: 22.3080, longitude: 113.9185 },
    'FRA': { latitude: 50.0379, longitude: 8.5622 },
    'AMS': { latitude: 52.3105, longitude: 4.7683 },
  } as Record<string, LocationCoords>,

  getAirportLocation: (code: string): LocationCoords | null => {
    return mapService.airportLocations[code.toUpperCase()] ?? null;
  },
};

export default mapService;
