import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Point } from './types';

interface MapComponentProps {
  currentPoint?: Point;
  points: Point[];
  isReplayMode?: boolean;
}

const MapComponent = ({ currentPoint, points, isReplayMode }: MapComponentProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialLat = currentPoint?.lat || 0;
    const initialLng = currentPoint?.lng || 0;

    mapRef.current = L.map(containerRef.current).setView([initialLat, initialLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !currentPoint) return;

    if (!markerRef.current) {
      const icon = L.divIcon({
        html: '<div style="background: #2da44e; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        className: ''
      });
      markerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
    }

    if (!isReplayMode) {
      mapRef.current.panTo([currentPoint.lat, currentPoint.lng]);
    }
  }, [currentPoint, isReplayMode]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }

    if (points.length > 1) {
      const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);
      polylineRef.current = L.polyline(latLngs, { color: '#0969da', weight: 3, opacity: 0.7 }).addTo(mapRef.current);
    }
  }, [points]);

  return <div id="map" ref={containerRef} style={{ height: '500px', width: '100%' }} />;
};

export default MapComponent;
