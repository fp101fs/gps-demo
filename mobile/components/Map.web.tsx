import { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { Asset } from 'expo-asset';

// Standard import for Leaflet (will only be used if OS is web)
let L: any;
if (Platform.OS === 'web') {
  L = require('leaflet');
  require('leaflet/dist/leaflet.css');
}

export interface Point {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface SafeZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

interface MapProps {
  currentPoint?: Point;
  points: Point[];
  isReplayMode?: boolean;
  avatarUrl?: string;
  isSos?: boolean;
  fleetMembers?: { id: string; lat: number; lng: number; avatarUrl?: string; isSos?: boolean }[];
  safeZones?: SafeZone[];
  theme?: 'light' | 'dark';
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl, isSos, fleetMembers = [], safeZones = [], theme = 'light' }: MapProps) {
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const fleetMarkersRef = useRef<{ [key: string]: any }>({});
  const zoneLayersRef = useRef<{ [key: string]: any }>({});
  const polylineRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Helper to create the correct icon
  const createIcon = (url?: string, memberIsSos?: boolean) => {
    const size = memberIsSos ? 80 : 40;
    const radius = size / 2;
    const border = memberIsSos ? '4px solid #ef4444' : '2px solid white';
    const shadow = memberIsSos ? '0 0 20px #ef4444' : '0 2px 5px rgba(0,0,0,0.3)';
    const animationClass = memberIsSos ? 'marker-pulse-sos' : 'marker-pulse';

    if (url) {
      return L.divIcon({
        className: animationClass,
        html: `
          <div style="
            width: ${size}px; 
            height: ${size}px; 
            border-radius: ${radius}px; 
            border: ${border}; 
            box-shadow: ${shadow};
            overflow: hidden;
            background-color: white;
          ">
            <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [radius, radius],
      });
    }

    return L.icon({
      iconUrl: Asset.fromModule(require('../assets/images/marker-green-cross.png')).uri,
      iconSize: [size, size],
      iconAnchor: [radius, radius],
      popupAnchor: [0, -radius],
      className: animationClass
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || mapRef.current) return;

    let startLat = 0;
    let startLng = 0;
    let zoom = 2;

    if (currentPoint) {
        startLat = currentPoint.lat;
        startLng = currentPoint.lng;
        zoom = 15;
    } else if (fleetMembers.length > 0) {
        startLat = fleetMembers[0].lat;
        startLng = fleetMembers[0].lng;
        zoom = 10;
    }

    mapRef.current = L.map(containerRef.current).setView([startLat, startLng], zoom);

    const tileUrl = theme === 'dark' 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        
    const attribution = theme === 'dark'
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; OpenStreetMap contributors';

    tileLayerRef.current = L.tileLayer(tileUrl, { attribution }).addTo(mapRef.current);
    
    setIsReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Theme Changes
  useEffect(() => {
      if (!mapRef.current || !tileLayerRef.current) return;
      const tileUrl = theme === 'dark' 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      tileLayerRef.current.setUrl(tileUrl);
  }, [theme]);

  // Handle Safe Zones
  useEffect(() => {
    if (!mapRef.current || !L) return;

    // Remove old zones
    Object.keys(zoneLayersRef.current).forEach(id => {
        if (!safeZones.find(z => z.id === id)) {
            mapRef.current.removeLayer(zoneLayersRef.current[id]);
            delete zoneLayersRef.current[id];
        }
    });

    // Add/Update zones
    safeZones.forEach(zone => {
        if (zoneLayersRef.current[zone.id]) {
            zoneLayersRef.current[zone.id].setLatLng([zone.lat, zone.lng]);
            zoneLayersRef.current[zone.id].setRadius(zone.radius_meters);
        } else {
            const circle = L.circle([zone.lat, zone.lng], {
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                radius: zone.radius_meters,
                weight: 2
            }).addTo(mapRef.current);
            circle.bindTooltip(zone.name, { permanent: true, direction: 'top', className: 'zone-tooltip' });
            zoneLayersRef.current[zone.id] = circle;
        }
    });
  }, [safeZones]);

  // Handle Fleet Members
  useEffect(() => {
    if (!mapRef.current || !L) return;

    Object.keys(fleetMarkersRef.current).forEach(id => {
        if (!fleetMembers.find(m => m.id === id)) {
            mapRef.current.removeLayer(fleetMarkersRef.current[id]);
            delete fleetMarkersRef.current[id];
        }
    });

    const latLngs: [number, number][] = [];
    fleetMembers.forEach(member => {
        latLngs.push([member.lat, member.lng]);
        const icon = createIcon(member.avatarUrl, member.isSos);
        if (fleetMarkersRef.current[member.id]) {
            fleetMarkersRef.current[member.id].setLatLng([member.lat, member.lng]);
            fleetMarkersRef.current[member.id].setIcon(icon);
        } else {
            const marker = L.marker([member.lat, member.lng], { icon }).addTo(mapRef.current);
            fleetMarkersRef.current[member.id] = marker;
        }
    });

    if (!currentPoint && latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [fleetMembers, currentPoint]);

  useEffect(() => {
    if (!mapRef.current || !currentPoint || !L) return;
    const icon = createIcon(avatarUrl, isSos);
    if (!markerRef.current) {
      markerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      markerRef.current.setIcon(icon);
    }
    if (!isReplayMode) {
      mapRef.current.panTo([currentPoint.lat, currentPoint.lng]);
    }
  }, [currentPoint, isReplayMode, avatarUrl, isSos]);

  useEffect(() => {
    if (!mapRef.current || !L) return;
    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }
    if (points.length > 1) {
      const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);
      polylineRef.current = L.polyline(latLngs, { color: '#2563eb', weight: 4 }).addTo(mapRef.current);
    }
  }, [points]);

  return (
    <View className="h-full w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      {Platform.OS === 'web' ? (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        <View className="flex-1 items-center justify-center">
            <Text>Map not available on this platform</Text>
        </View>
      )}
    </View>
  );
}
