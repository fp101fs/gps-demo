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
  fleetMembers?: { id: string; lat: number; lng: number; avatarUrl?: string }[];
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl, fleetMembers = [] }: MapProps) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const fleetMarkersRef = useRef<{ [key: string]: any }>({});
  const polylineRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Helper to create the correct icon
  const createIcon = (url?: string) => {
    if (url) {
      return L.divIcon({
        className: 'marker-pulse',
        html: `
          <div style="
            width: 40px; 
            height: 40px; 
            border-radius: 20px; 
            border: 2px solid white; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            overflow: hidden;
            background-color: white;
          ">
            <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    }

    return L.icon({
      iconUrl: Asset.fromModule(require('../assets/images/marker-green-cross.png')).uri,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
      className: ''
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current);
    
    setIsReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle Fleet Members
  useEffect(() => {
    if (!mapRef.current || !L) return;

    // Remove markers for members no longer present
    Object.keys(fleetMarkersRef.current).forEach(id => {
        if (!fleetMembers.find(m => m.id === id)) {
            mapRef.current.removeLayer(fleetMarkersRef.current[id]);
            delete fleetMarkersRef.current[id];
        }
    });

    // Update or Add markers
    const latLngs: [number, number][] = [];
    fleetMembers.forEach(member => {
        latLngs.push([member.lat, member.lng]);
        const icon = createIcon(member.avatarUrl);
        if (fleetMarkersRef.current[member.id]) {
            fleetMarkersRef.current[member.id].setLatLng([member.lat, member.lng]);
            fleetMarkersRef.current[member.id].setIcon(icon);
        } else {
            const marker = L.marker([member.lat, member.lng], { icon }).addTo(mapRef.current);
            fleetMarkersRef.current[member.id] = marker;
        }
    });

    // Auto-fit bounds if we have members and no active tracking point
    if (!currentPoint && latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [fleetMembers, currentPoint]);

  // Handle Marker Updates (including avatar change)
  useEffect(() => {
    if (!mapRef.current || !L) return;

    if (currentPoint) {
        const icon = createIcon(avatarUrl);

        if (!markerRef.current) {
          markerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon }).addTo(mapRef.current);
        } else {
          markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
          markerRef.current.setIcon(icon);
        }
    
        if (!isReplayMode) {
          mapRef.current.panTo([currentPoint.lat, currentPoint.lng]);
        }
    } else {
        // If currentPoint is removed, remove the marker
        if (markerRef.current) {
            mapRef.current.removeLayer(markerRef.current);
            markerRef.current = null;
        }
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
