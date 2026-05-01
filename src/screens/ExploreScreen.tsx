import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Dimensions,
    Image,
    StatusBar,
    Alert,
    Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    Search,
    SlidersHorizontal,
    Plus,
    Minus,
    Navigation,
    Home,
    Search as ExploreIcon,
    MessageCircle,
    UserCircle,
    Calendar,
    ArrowRight,
    MessageSquare as ChatIcon
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api/client';
import { useUserCurrency } from '../utils/currency';
import { TrackingPreviewCard } from '../components/tracking/TrackingPreviewCard';

const { width, height } = Dimensions.get('window');

// Leaflet map HTML with 100+ international airports and selection
const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0}
  html,body,#map{width:100%;height:100%}
  .ap{text-align:center;cursor:pointer;transition:transform .2s}
  .ap:hover{transform:scale(1.1)}
  .ap-lbl{font-weight:700;font-size:10px;letter-spacing:.5px;padding:4px 10px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.18);white-space:nowrap;display:inline-block}
  .ap-lbl.blue{background:#1E3B8A;color:#fff}
  .ap-lbl.white{background:#fff;color:#1E3B8A;border:1.5px solid #1E3B8A;border-radius:20px;padding:5px 12px}
  .ap-lbl.muted{background:#64748B;color:#fff}
  .ap-lbl.selected{background:#F59E0B;color:#fff;border:none;transform:scale(1.15);box-shadow:0 3px 12px rgba(245,158,11,.4)}
  .ap-dot{width:10px;height:10px;border-radius:50%;margin:4px auto 0}
  .dot-o{background:#fff;border:2.5px solid #1E3B8A}
  .dot-f{background:#1E3B8A;border:2px solid #fff}
  .dot-s{background:#F59E0B;border:2px solid #fff}
  .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{center:[30,20],zoom:2,zoomControl:false,attributionControl:false,minZoom:2,maxZoom:10});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19}).addTo(map);

var airports=[
  // North America
  {id:'JFK',lat:40.6413,lng:-73.7781,city:'New York'},
  {id:'LAX',lat:33.9425,lng:-118.4081,city:'Los Angeles'},
  {id:'ORD',lat:41.9742,lng:-87.9073,city:'Chicago'},
  {id:'ATL',lat:33.6407,lng:-84.4277,city:'Atlanta'},
  {id:'DFW',lat:32.8998,lng:-97.0403,city:'Dallas'},
  {id:'SFO',lat:37.6213,lng:-122.379,city:'San Francisco'},
  {id:'MIA',lat:25.7959,lng:-80.287,city:'Miami'},
  {id:'SEA',lat:47.4502,lng:-122.3088,city:'Seattle'},
  {id:'BOS',lat:42.3656,lng:-71.0096,city:'Boston'},
  {id:'DEN',lat:39.8561,lng:-104.6737,city:'Denver'},
  {id:'IAH',lat:29.9844,lng:-95.3414,city:'Houston'},
  {id:'EWR',lat:40.6895,lng:-74.1745,city:'Newark'},
  {id:'MSP',lat:44.8848,lng:-93.2223,city:'Minneapolis'},
  {id:'DTW',lat:42.2124,lng:-83.3534,city:'Detroit'},
  {id:'PHX',lat:33.4373,lng:-112.0078,city:'Phoenix'},
  {id:'LAS',lat:36.084,lng:-115.1537,city:'Las Vegas'},
  {id:'MCO',lat:28.4312,lng:-81.308,city:'Orlando'},
  {id:'YYZ',lat:43.6777,lng:-79.6248,city:'Toronto'},
  {id:'YVR',lat:49.1947,lng:-123.1792,city:'Vancouver'},
  {id:'YUL',lat:45.4706,lng:-73.7408,city:'Montreal'},
  {id:'MEX',lat:19.4363,lng:-99.0721,city:'Mexico City'},
  {id:'CUN',lat:21.0365,lng:-86.877,city:'Cancun'},
  {id:'GRU',lat:-23.4356,lng:-46.4731,city:'Sao Paulo'},
  {id:'GIG',lat:-22.8099,lng:-43.2506,city:'Rio de Janeiro'},
  {id:'EZE',lat:-34.8222,lng:-58.5358,city:'Buenos Aires'},
  {id:'SCL',lat:-33.393,lng:-70.7858,city:'Santiago'},
  {id:'BOG',lat:4.7016,lng:-74.1469,city:'Bogota'},
  {id:'LIM',lat:-12.0219,lng:-77.1143,city:'Lima'},
  {id:'PTY',lat:9.0714,lng:-79.3835,city:'Panama City'},
  // Europe
  {id:'LHR',lat:51.47,lng:-0.4543,city:'London'},
  {id:'CDG',lat:49.0097,lng:2.5479,city:'Paris'},
  {id:'FRA',lat:50.0379,lng:8.5622,city:'Frankfurt'},
  {id:'AMS',lat:52.3105,lng:4.7683,city:'Amsterdam'},
  {id:'MAD',lat:40.4983,lng:-3.5676,city:'Madrid'},
  {id:'BCN',lat:41.2971,lng:2.0785,city:'Barcelona'},
  {id:'FCO',lat:41.8003,lng:12.2389,city:'Rome'},
  {id:'MXP',lat:45.63,lng:8.7231,city:'Milan'},
  {id:'MUC',lat:48.3538,lng:11.775,city:'Munich'},
  {id:'ZRH',lat:47.4647,lng:8.5492,city:'Zurich'},
  {id:'VIE',lat:48.1103,lng:16.5697,city:'Vienna'},
  {id:'IST',lat:41.2753,lng:28.7519,city:'Istanbul'},
  {id:'CPH',lat:55.618,lng:12.656,city:'Copenhagen'},
  {id:'OSL',lat:60.1939,lng:11.1004,city:'Oslo'},
  {id:'ARN',lat:59.6519,lng:17.9186,city:'Stockholm'},
  {id:'HEL',lat:60.3172,lng:24.963,city:'Helsinki'},
  {id:'DUB',lat:53.4264,lng:-6.2499,city:'Dublin'},
  {id:'LIS',lat:38.7756,lng:-9.1354,city:'Lisbon'},
  {id:'ATH',lat:37.9364,lng:23.9445,city:'Athens'},
  {id:'WAW',lat:52.1657,lng:20.9671,city:'Warsaw'},
  {id:'PRG',lat:50.1008,lng:14.26,city:'Prague'},
  {id:'BRU',lat:50.9014,lng:4.4844,city:'Brussels'},
  {id:'BUD',lat:47.4369,lng:19.2556,city:'Budapest'},
  {id:'OTP',lat:44.5711,lng:26.085,city:'Bucharest'},
  // Middle East
  {id:'DXB',lat:25.2532,lng:55.3657,city:'Dubai'},
  {id:'AUH',lat:24.433,lng:54.6511,city:'Abu Dhabi'},
  {id:'DOH',lat:25.2731,lng:51.6081,city:'Doha'},
  {id:'RUH',lat:24.9578,lng:46.6989,city:'Riyadh'},
  {id:'JED',lat:21.6702,lng:39.1525,city:'Jeddah'},
  {id:'BAH',lat:26.2708,lng:50.6336,city:'Bahrain'},
  {id:'MCT',lat:23.5933,lng:58.2844,city:'Muscat'},
  {id:'AMM',lat:31.7226,lng:35.9932,city:'Amman'},
  {id:'TLV',lat:32.0055,lng:34.8854,city:'Tel Aviv'},
  {id:'KWI',lat:29.2266,lng:47.9689,city:'Kuwait'},
  // Asia
  {id:'SIN',lat:1.3644,lng:103.9915,city:'Singapore'},
  {id:'HKG',lat:22.308,lng:113.9185,city:'Hong Kong'},
  {id:'NRT',lat:35.7647,lng:140.3864,city:'Tokyo Narita'},
  {id:'HND',lat:35.5494,lng:139.7798,city:'Tokyo Haneda'},
  {id:'ICN',lat:37.4602,lng:126.4407,city:'Seoul Incheon'},
  {id:'PEK',lat:40.0799,lng:116.6031,city:'Beijing'},
  {id:'PVG',lat:31.1443,lng:121.8083,city:'Shanghai'},
  {id:'CAN',lat:23.3924,lng:113.299,city:'Guangzhou'},
  {id:'BKK',lat:13.6900,lng:100.7501,city:'Bangkok'},
  {id:'KUL',lat:2.7456,lng:101.7099,city:'Kuala Lumpur'},
  {id:'CGK',lat:-6.1256,lng:106.6558,city:'Jakarta'},
  {id:'MNL',lat:14.5086,lng:121.0194,city:'Manila'},
  {id:'DEL',lat:28.5562,lng:77.1,city:'New Delhi'},
  {id:'BOM',lat:19.0896,lng:72.8656,city:'Mumbai'},
  {id:'BLR',lat:13.1986,lng:77.7066,city:'Bangalore'},
  {id:'MAA',lat:12.99,lng:80.1693,city:'Chennai'},
  {id:'CCU',lat:22.6547,lng:88.4467,city:'Kolkata'},
  {id:'CMB',lat:7.1808,lng:79.8841,city:'Colombo'},
  {id:'DAC',lat:23.8433,lng:90.3978,city:'Dhaka'},
  {id:'KTM',lat:27.6966,lng:85.3591,city:'Kathmandu'},
  {id:'ISB',lat:33.6167,lng:73.0992,city:'Islamabad'},
  {id:'KHI',lat:24.9065,lng:67.1609,city:'Karachi'},
  {id:'SGN',lat:10.8185,lng:106.6519,city:'Ho Chi Minh'},
  {id:'HAN',lat:21.2212,lng:105.807,city:'Hanoi'},
  {id:'TPE',lat:25.0777,lng:121.2328,city:'Taipei'},
  // Oceania
  {id:'SYD',lat:-33.9461,lng:151.1772,city:'Sydney'},
  {id:'MEL',lat:-37.6733,lng:144.8433,city:'Melbourne'},
  {id:'BNE',lat:-27.3842,lng:153.1175,city:'Brisbane'},
  {id:'AKL',lat:-37.0082,lng:174.7917,city:'Auckland'},
  {id:'PER',lat:-31.9403,lng:115.9672,city:'Perth'},
  // Africa
  {id:'JNB',lat:-26.1392,lng:28.246,city:'Johannesburg'},
  {id:'CPT',lat:-33.9649,lng:18.6017,city:'Cape Town'},
  {id:'CAI',lat:30.1219,lng:31.4056,city:'Cairo'},
  {id:'ADD',lat:8.9779,lng:38.7993,city:'Addis Ababa'},
  {id:'NBO',lat:-1.3192,lng:36.9278,city:'Nairobi'},
  {id:'LOS',lat:6.5774,lng:3.3212,city:'Lagos'},
  {id:'CMN',lat:33.3675,lng:-7.5898,city:'Casablanca'},
  {id:'ALG',lat:36.691,lng:3.2154,city:'Algiers'},
  {id:'TUN',lat:36.851,lng:10.2272,city:'Tunis'},
  {id:'DSS',lat:14.67,lng:-17.073,city:'Dakar'},
  {id:'DAR',lat:-6.878,lng:39.2026,city:'Dar es Salaam'},
  {id:'ACC',lat:5.6052,lng:-0.1668,city:'Accra'}
];

var selectedAirport=null;
var markers={};
var routeLine=null;

function makeIcon(ap,selected){
  var cls=selected?'ap-lbl selected':'ap-lbl blue';
  var dot=selected?'ap-dot dot-s':'ap-dot dot-f';
  return L.divIcon({html:'<div class="ap"><div class="'+cls+'">'+ap.id+'</div><div class="'+dot+'"></div></div>',className:'',iconSize:[50,34],iconAnchor:[25,34]});
}

airports.forEach(function(ap){
  var m=L.marker([ap.lat,ap.lng],{icon:makeIcon(ap,false)}).addTo(map);
  m.on('click',function(){
    if(selectedAirport&&markers[selectedAirport.id]){
      markers[selectedAirport.id].setIcon(makeIcon(selectedAirport,false));
    }
    selectedAirport=ap;
    m.setIcon(makeIcon(ap,true));
    map.flyTo([ap.lat,ap.lng],5,{duration:0.4});
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'airportSelected',airport:ap}));
  });
  markers[ap.id]=m;
});

function handleMessage(event){
  try{
    var d=JSON.parse(event.data);
    if(d.type==='zoomIn') map.zoomIn();
    if(d.type==='zoomOut') map.zoomOut();
    if(d.type==='flyTo') map.flyTo([d.lat,d.lng],d.zoom||6,{duration:0.5});
    if(d.type==='search'){
      var q=d.query.toUpperCase();
      var found=airports.filter(function(a){return a.id.indexOf(q)>=0||a.city.toUpperCase().indexOf(q)>=0});
      if(found.length>0){
        var ap=found[0];
        if(selectedAirport&&markers[selectedAirport.id]) markers[selectedAirport.id].setIcon(makeIcon(selectedAirport,false));
        selectedAirport=ap;
        markers[ap.id].setIcon(makeIcon(ap,true));
        map.flyTo([ap.lat,ap.lng],5,{duration:0.5});
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'airportSelected',airport:ap}));
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'searchResults',results:found.slice(0,8).map(function(a){return{id:a.id,city:a.city}})}));
    }
    if(d.type==='drawRoute'&&d.from&&d.to){
      if(routeLine) map.removeLayer(routeLine);
      var f=airports.find(function(a){return a.id===d.from});
      var t=airports.find(function(a){return a.id===d.to});
      if(f&&t){
        routeLine=L.polyline([[f.lat,f.lng],[t.lat,t.lng]],{color:'#1E3B8A',weight:2.5,opacity:0.7}).addTo(map);
        map.fitBounds(routeLine.getBounds(),{padding:[60,60]});
      }
    }
    if(d.type==='clearSelection'){
      if(selectedAirport&&markers[selectedAirport.id]) markers[selectedAirport.id].setIcon(makeIcon(selectedAirport,false));
      selectedAirport=null;
      if(routeLine){map.removeLayer(routeLine);routeLine=null;}
    }
  }catch(e){}
}
window.addEventListener('message',handleMessage);
document.addEventListener('message',handleMessage);
</script>
</body>
</html>
`;

interface ExploreScreenProps {
    onViewDetails: (deal: any) => void;
    onChat: (user: any) => void;
    onSwitchTab: (tab: string) => void;
    onOpenTracking?: (dealId: string) => void;
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({ onViewDetails, onChat, onSwitchTab, onOpenTracking }) => {
    const currency = useUserCurrency();
    const [activeTab, setActiveTab] = useState('shipments');
    const [searchQuery, setSearchQuery] = useState('');
    const [locationActive, setLocationActive] = useState(false);
    const [selectedAirport, setSelectedAirport] = useState<{ id: string; city: string } | null>(null);
    const webViewRef = useRef<WebView>(null);
    const deals = useAppStore((s) => s.deals);
    const fetchDeals = useAppStore((s) => s.fetchDeals);
    const [matchScore, setMatchScore] = useState<number | null>(null);

    // Filter deals by selected airport city and active tab
    const isOpenDeal = (d: any) => d.status === 'OPEN' || d.status === 'published';
    const isActiveDeal = (d: any) => ['MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'DISPUTED', 'accepted', 'in_transit'].includes(d.status || '');

    const dealsForTab = deals.filter((d: any) =>
        activeTab === 'shipments' ? isOpenDeal(d) : isActiveDeal(d)
    );

    const dealsForAirport = selectedAirport
        ? dealsForTab.filter((d: any) => {
            const city = selectedAirport.city.toLowerCase();
            return (
                (d.fromCity?.toLowerCase().includes(city)) ||
                (d.toCity?.toLowerCase().includes(city))
            );
        })
        : dealsForTab;

    const featuredDeal = dealsForAirport.length > 0
        ? dealsForAirport[0]
        : dealsForTab.length > 0 ? dealsForTab[0] : null;

    useEffect(() => {
        fetchDeals();
    }, []);

    useEffect(() => {
        if (!featuredDeal?.id) return;
        apiClient.post<{ matches: Array<{ score: number }> }>('/ml/match', { requestId: featuredDeal.id })
            .then((res) => {
                if (res.success && res.data?.matches?.length) {
                    setMatchScore(Math.round(res.data.matches[0].score * 100));
                }
            })
            .catch(() => { /* non-blocking */ });
    }, [featuredDeal?.id]);

    const sendMapMessage = (msg: object) => {
        webViewRef.current?.postMessage(JSON.stringify(msg));
    };

    const zoomIn = () => sendMapMessage({ type: 'zoomIn' });
    const zoomOut = () => sendMapMessage({ type: 'zoomOut' });

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (text.length >= 2) {
            sendMapMessage({ type: 'search', query: text });
        }
    };

    const handleSearchSubmit = () => {
        if (searchQuery.length >= 2) {
            sendMapMessage({ type: 'search', query: searchQuery });
        }
    };

    const handleMapMessage = (event: { nativeEvent: { data: string } }) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'airportSelected' && data.airport) {
                setSelectedAirport({ id: data.airport.id, city: data.airport.city });
            }
        } catch {}
    };

    const goToUserLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({});
            setLocationActive(true);
            sendMapMessage({ type: 'flyTo', lat: loc.coords.latitude, lng: loc.coords.longitude, zoom: 6 });
        } catch {
            Alert.alert('Location Error', 'Could not get your current location.');
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Interactive Map via WebView + Leaflet */}
            <WebView
                ref={webViewRef}
                source={{ html: MAP_HTML }}
                style={StyleSheet.absoluteFillObject}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                onMessage={handleMapMessage}
            />

            {/* Header Overlay */}
            <SafeAreaView style={styles.headerOverlay} pointerEvents="box-none">
                <View style={styles.searchContainer}>
                    <View style={styles.searchWrapper}>
                        <Search size={22} color={COLORS.primary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search airport (e.g. JFK, LHR)"
                            placeholderTextColor={COLORS.background.slate[500]}
                            value={searchQuery}
                            onChangeText={handleSearch}
                            onSubmitEditing={handleSearchSubmit}
                            returnKeyType="search"
                            autoCapitalize="characters"
                        />
                    </View>
                    <TouchableOpacity style={styles.filterButton}>
                        <SlidersHorizontal size={22} color={COLORS.white} />
                    </TouchableOpacity>
                </View>

                <View style={styles.tabsContainer}>
                    <View style={styles.tabsWrapper}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'shipments' && styles.activeTab]}
                            onPress={() => setActiveTab('shipments')}
                        >
                            <Typography weight="bold" size="sm" color={activeTab === 'shipments' ? COLORS.white : COLORS.primary}>
                                Shipments
                            </Typography>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'trips' && styles.activeTab]}
                            onPress={() => setActiveTab('trips')}
                        >
                            <Typography weight="bold" size="sm" color={activeTab === 'trips' ? COLORS.white : COLORS.primary}>
                                Trips
                            </Typography>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>

            {/* Map Controls */}
            <View style={styles.mapControls}>
                <TouchableOpacity style={styles.controlButton} onPress={zoomIn}>
                    <Plus size={24} color={COLORS.background.slate[900]} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={zoomOut}>
                    <Minus size={24} color={COLORS.background.slate[900]} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={goToUserLocation}>
                    <Navigation size={22} color={locationActive ? '#22C55E' : COLORS.primary} />
                </TouchableOpacity>
            </View>

            {/* Bottom Card */}
            {featuredDeal && activeTab === 'trips' && isActiveDeal(featuredDeal) && onOpenTracking ? (
            <View style={styles.bottomCardContainer} pointerEvents="box-none">
                {(() => {
                    const fd: any = featuredDeal;
                    return (
                        <TrackingPreviewCard
                            deal={{
                                id: fd.id,
                                travelerName: (fd.traveler?.name ?? fd.travelerName) ?? null,
                                travelerAvatar: (fd.traveler?.profilePhoto ?? fd.traveler?.avatar) ?? null,
                                fromCity: fd.fromCity ?? fd.route?.from ?? null,
                                toCity: fd.toCity ?? fd.route?.to ?? null,
                                fromIata: fd.fromIata ?? null,
                                toIata: fd.toIata ?? null,
                                origin:
                                    fd.fromLat != null && fd.fromLng != null
                                        ? { lat: fd.fromLat, lng: fd.fromLng }
                                        : null,
                                destination:
                                    fd.toLat != null && fd.toLng != null
                                        ? { lat: fd.toLat, lng: fd.toLng }
                                        : null,
                            }}
                            onActivate={() => onOpenTracking(fd.id)}
                            onOpen={() => onOpenTracking(fd.id)}
                        />
                    );
                })()}
            </View>
            ) : featuredDeal && (
            <View style={styles.bottomCardContainer} pointerEvents="box-none">
                <View style={styles.dealCard}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardUser}>
                            {(featuredDeal.sender?.profilePhoto || featuredDeal.sender?.avatar || featuredDeal.traveler?.profilePhoto || featuredDeal.traveler?.avatar) ? (
                                <Image
                                    source={{ uri: featuredDeal.sender?.profilePhoto || featuredDeal.sender?.avatar || featuredDeal.traveler?.profilePhoto || featuredDeal.traveler?.avatar }}
                                    style={styles.userAvatar}
                                />
                            ) : (
                                <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
                                    <UserCircle color={COLORS.primary} size={28} />
                                </View>
                            )}
                            <View style={{ marginLeft: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Typography weight="bold" size="lg">{featuredDeal.senderName || featuredDeal.name || 'Traveler'}</Typography>
                                    {matchScore !== null && (
                                        <View style={styles.matchBadge}>
                                            <Typography size="xs" weight="bold" color="#fff">{matchScore}% match</Typography>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.ratingRow}>
                                    <Typography size="sm" color="#F59E0B">⭐</Typography>
                                    <View style={{ marginLeft: 6, flexDirection: 'row' }}>
                                        <Typography weight="bold" size="sm" color="#F59E0B">{featuredDeal.verified ? '5.0' : '4.5'}</Typography>
                                    </View>
                                </View>
                            </View>
                        </View>
                        <View style={styles.cardPrice}>
                            <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={{ letterSpacing: 1 }}>STARTS AT</Typography>
                            <Typography weight="bold" size="3xl" color={COLORS.primary} style={{ marginTop: 2 }}>{currency.symbol}{featuredDeal.pricing?.amount ?? featuredDeal.price ?? 0}</Typography>
                        </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.cardRoute}>
                        <View style={styles.routeInfo}>
                            <View style={styles.cityNameRow}>
                                <Typography weight="bold" size="xl">{featuredDeal.route?.from || 'N/A'}</Typography>
                                <ArrowRight size={20} color={COLORS.background.slate[400]} style={{ marginHorizontal: 16 }} />
                                <Typography weight="bold" size="xl">{featuredDeal.route?.to || 'N/A'}</Typography>
                            </View>
                        </View>
                        <View style={styles.dateInfo}>
                            <Calendar size={18} color={COLORS.background.slate[500]} />
                            <Typography size="sm" color={COLORS.background.slate[600]} style={{ marginLeft: 8 }}>{featuredDeal.route?.departureDate || 'Flexible'}</Typography>
                        </View>
                    </View>

                    <View style={styles.cardActions}>
                        <TouchableOpacity
                            style={styles.viewDetailsBtn}
                            onPress={() => onViewDetails(featuredDeal)}
                        >
                            <Typography weight="bold" color={COLORS.white} size="md">View Details</Typography>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.chatBtn}
                            onPress={() => {
                                const otherUser = featuredDeal.sender;
                                onChat({
                                    name: featuredDeal.senderName || featuredDeal.name || 'Traveler',
                                    verified: featuredDeal.verified,
                                    userId: otherUser?.id,
                                    avatar: otherUser?.profilePhoto || otherUser?.avatar,
                                    profilePhoto: otherUser?.profilePhoto || otherUser?.avatar,
                                    dealId: featuredDeal.id,
                                });
                            }}
                        >
                            <ChatIcon size={24} color={COLORS.primary} fill={COLORS.primary} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            )}

            {/* Bottom Tab Bar */}
            <View style={styles.tabBar}>
                <TouchableOpacity onPress={() => onSwitchTab('home')} style={styles.tabItem}>
                    <Home size={26} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>Home</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onSwitchTab('explore')} style={styles.tabItem}>
                    <ExploreIcon size={26} color={COLORS.primary} fill={`${COLORS.primary}20`} strokeWidth={2.5} />
                    <Typography size="xs" color={COLORS.primary} weight="bold" style={{ marginTop: 4 }}>Explore</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onSwitchTab('create')} style={styles.tabItem}>
                    <View style={styles.createButtonSim}>
                        <Plus size={28} color={COLORS.white} strokeWidth={3} />
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 35 }}>Post</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onSwitchTab('messages')} style={styles.tabItem}>
                    <MessageCircle size={26} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>Messages</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onSwitchTab('profile')} style={styles.tabItem}>
                    <UserCircle size={26} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>Profile</Typography>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.slate[100],
    },
    headerOverlay: {
        paddingTop: 10,
        zIndex: 10,
    },
    searchContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    searchWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: 30,
        paddingHorizontal: 20,
        height: 60,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 15,
        elevation: 8,
    },
    searchInput: {
        flex: 1,
        marginLeft: 12,
        fontSize: 16,
        color: COLORS.primary,
        fontFamily: 'Inter',
    },
    filterButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    tabsContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    tabsWrapper: {
        flexDirection: 'row',
        backgroundColor: COLORS.white,
        borderRadius: 30,
        padding: 5,
        width: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 25,
    },
    activeTab: {
        backgroundColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
    },
    mapControls: {
        position: 'absolute',
        right: 20,
        bottom: 350,
        gap: 16,
        zIndex: 10,
    },
    controlButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 6,
    },
    bottomCardContainer: {
        position: 'absolute',
        bottom: 115,
        width: '100%',
        paddingHorizontal: 20,
        zIndex: 20,
    },
    dealCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 30,
        elevation: 15,
        borderWidth: 1,
        borderColor: '#F8FAFC',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardUser: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    userAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
    },
    userAvatarPlaceholder: {
        backgroundColor: `${COLORS.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
    },
    matchBadge: {
        backgroundColor: '#22C55E',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    cardPrice: {
        alignItems: 'flex-end',
    },
    cardDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 20,
    },
    cardRoute: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    routeInfo: {
        flex: 1,
    },
    cityNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardActions: {
        flexDirection: 'row',
        gap: 16,
    },
    viewDetailsBtn: {
        flex: 1,
        backgroundColor: '#1E3B8A',
        borderRadius: RADIUS.xl,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    chatBtn: {
        width: 56,
        height: 56,
        borderRadius: RADIUS.xl,
        borderWidth: 1.5,
        borderColor: COLORS.background.slate[200],
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.white,
    },
    tabBar: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: 100,
        backgroundColor: COLORS.white,
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 12,
        paddingBottom: 32,
        zIndex: 30,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createButtonSim: {
        position: 'absolute',
        top: -30,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#94A3B8', // Grayish from image
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: COLORS.white,
    },
});
