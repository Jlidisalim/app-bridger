import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FlightMapView } from '../FlightMapView';

interface Props {
  dealId: string;
  position?: any; // We won't use it, but we accept it for consistency
  origin: { lat: number; lng: number; iata?: string; city?: string } | null;
  destination: { lat: number; lng: number; iata?: string; city?: string } | null;
  style: any;
}

export const FlightMap: React.FC<Props> = ({
  dealId,
  position, // unused
  origin,
  destination,
  style,
}) => {
  return <FlightMapView dealId={dealId} origin={origin} destination={destination} style={style} />;
};