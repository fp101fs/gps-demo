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

interface MapProps {
  currentPoint?: Point;
  points: Point[];
  isReplayMode?: boolean;
  avatarUrl?: string;
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl }: MapProps) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Helper to create the correct icon
  const createIcon = () => {
    if (avatarUrl) {
      return L.divIcon({
        className: 'marker-pulse',
        html: `
          <div style="
            width: 60px; 
            height: 60px; 
            border-radius: 30px; 
            border: 3px solid white; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            overflow: hidden;
            background-color: white;
          ">
            <img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
      });
    }

    return L.icon({
      iconUrl: Asset.fromModule(require('../assets/images/marker-green-cross.png')).uri,
      iconSize: [100, 100],
      iconAnchor: [50, 50],
      popupAnchor: [0, -50],
      className: 'marker-pulse'
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || mapRef.current) return;

    const startLat = currentPoint?.lat || 0;
    const startLng = currentPoint?.lng || 0;

    mapRef.current = L.map(containerRef.current).setView([startLat, startLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current);
    
    setIsReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Marker Updates (including avatar change)
  useEffect(() => {
    if (!mapRef.current || !currentPoint || !L) return;

    const icon = createIcon();

    if (!markerRef.current) {
      markerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      markerRef.current.setIcon(icon);
    }

    if (!isReplayMode) {
      mapRef.current.panTo([currentPoint.lat, currentPoint.lng]);
    }
  }, [currentPoint, isReplayMode, avatarUrl]);

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