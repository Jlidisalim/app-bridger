// Dark "radar" Google Maps style — used for flight mode background.

export const RADAR_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7e8a99' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#22304a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#a8b3c2' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a8b3c2' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f1722' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#101a26' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#102016' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08111c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a4a5e' }] },
];
