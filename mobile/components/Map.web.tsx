import { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';

// Standard import for Leaflet (will only be used if OS is web and window is defined)
let L: any;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
  nickname?: string;
  isSos?: boolean;
  fleetMembers?: { id: string; lat: number; lng: number; avatarUrl?: string; nickname?: string; isSos?: boolean; lastSeen?: string }[];
  safeZones?: SafeZone[];
  theme?: 'light' | 'dark';
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl, nickname, isSos, fleetMembers = [], safeZones = [], theme = 'light' }: MapProps) {
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const fleetMarkersRef = useRef<{ [key: string]: any }>({});
  const zoneLayersRef = useRef<{ [key: string]: any }>({});
  const polylineRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Helper to get relative time
  const getRelativeTime = (isoString?: string) => {
      if (!isoString) return '';
      const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
  };

  // Helper to create the correct icon with nickname label and last seen
  const createIcon = (url?: string, label?: string, memberIsSos?: boolean, lastSeen?: string) => {
    if (!L) return null;
    const size = memberIsSos ? 80 : 40;
    const radius = size / 2;
    const border = memberIsSos ? '4px solid #ef4444' : '2px solid white';
    const shadow = memberIsSos ? '0 0 20px #ef4444' : '0 2px 5px rgba(0,0,0,0.3)';
    const animationClass = memberIsSos ? 'marker-pulse-sos' : 'marker-pulse';
    
    const relativeTime = getRelativeTime(lastSeen);
    const isStale = lastSeen && (Date.now() - new Date(lastSeen).getTime() > 60000); // More than 1 min

    const labelHtml = label ? `
      <div style="
        position: absolute; 
        top: -25px; 
        left: 50%; 
        transform: translateX(-50%); 
        background-color: ${memberIsSos ? '#ef4444' : 'rgba(0,0,0,0.7)'}; 
        color: white; 
        padding: 2px 8px; 
        border-radius: 10px; 
        font-size: 10px; 
        font-weight: bold; 
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      ">
        ${label}${isStale ? ` <span style="font-weight: normal; opacity: 0.8; font-size: 8px;">(${relativeTime})</span>` : ''}
      </div>
    ` : '';

    const imgHtml = url ? `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<img src="${Asset.fromModule(require('../assets/images/marker-green-cross.png')).uri}" style="width: 100%; height: 100%; object-fit: contain; padding: 5px;" />`;

    return L.divIcon({
      className: animationClass,
      html: `
        <div style="position: relative; width: ${size}px; height: ${size}px;">
          ${labelHtml}
          <div style="
            width: ${size}px; 
            height: ${size}px; 
            border-radius: ${radius}px; 
            border: ${border}; 
            box-shadow: ${shadow};
            overflow: hidden;
            background-color: white;
            ${isStale ? 'opacity: 0.7;' : ''}
          ">
            ${imgHtml}
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [radius, radius],
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || mapRef.current || !L) return;

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
        ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' // Standard tiles, we invert via CSS
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        
    const attribution = '&copy; OpenStreetMap contributors';

    tileLayerRef.current = L.tileLayer(tileUrl, { attribution }).addTo(mapRef.current);
    
    // Apply Invert Filter for Dark Mode
    if (theme === 'dark') {
        tileLayerRef.current.getContainer().style.filter = 'invert(100%)';
    } else {
        if (tileLayerRef.current.getContainer()) tileLayerRef.current.getContainer().style.filter = 'none';
    }

    setIsReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const recenter = () => {
      if (!mapRef.current || !L) return;
      
      if (currentPoint) {
          mapRef.current.setView([currentPoint.lat, currentPoint.lng], 15);
      } else if (fleetMembers.length > 0) {
          const latLngs = fleetMembers.map(m => [m.lat, m.lng] as [number, number]);
          const bounds = L.latLngBounds(latLngs);
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
  };

  // Handle Theme Changes
  useEffect(() => {
      if (!mapRef.current || !tileLayerRef.current) return;
      
      const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      tileLayerRef.current.setUrl(tileUrl);

      // Update Filter
      if (tileLayerRef.current.getContainer()) {
        if (theme === 'dark') {
            tileLayerRef.current.getContainer().style.filter = 'invert(100%)';
        } else {
            tileLayerRef.current.getContainer().style.filter = 'none';
        }
      }
  }, [theme]);

  // Handle Safe Zones
  useEffect(() => {
    if (!mapRef.current || !L) return;

    Object.keys(zoneLayersRef.current).forEach(id => {
        if (!safeZones.find(z => z.id === id)) {
            mapRef.current.removeLayer(zoneLayersRef.current[id]);
            delete zoneLayersRef.current[id];
        }
    });

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
        const icon = createIcon(member.avatarUrl, member.nickname, member.isSos, member.lastSeen);
        if (fleetMarkersRef.current[member.id]) {
            fleetMarkersRef.current[member.id].setLatLng([member.lat, member.lng]);
            if (icon) fleetMarkersRef.current[member.id].setIcon(icon);
        } else {
            const marker = L.marker([member.lat, member.lng], { icon }).addTo(mapRef.current);
            fleetMarkersRef.current[member.id] = marker;
        }
    });

    if (!currentPoint && latLngs.length > 0 && isReady) {
        const bounds = L.latLngBounds(latLngs);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [fleetMembers, currentPoint, isReady]);

  useEffect(() => {
    if (!mapRef.current || !currentPoint || !L) return;
    const icon = createIcon(avatarUrl, nickname, isSos);
    if (!markerRef.current) {
      markerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      if (icon) markerRef.current.setIcon(icon);
    }
    if (!isReplayMode) {
      mapRef.current.panTo([currentPoint.lat, currentPoint.lng]);
    }
  }, [currentPoint, isReplayMode, avatarUrl, nickname, isSos]);

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
    <View className="h-full w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 relative">
      {Platform.OS === 'web' ? (
        <>
            {typeof window !== 'undefined' && <div ref={containerRef} style={{ width: '100%', height: '100%' }} />}
            {isReady && (
                <TouchableOpacity 
                    onPress={recenter}
                    className="absolute bottom-4 right-4 z-[1000] bg-white dark:bg-gray-900 p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700"
                >
                    <Ionicons name="locate" size={24} color="#2563eb" />
                </TouchableOpacity>
            )}
        </>
      ) : (
        <View className="flex-1 items-center justify-center">
            <Text>Map not available on this platform</Text>
        </View>
      )}
    </View>
  );
}