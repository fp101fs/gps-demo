import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import MapComponent from './MapComponent';
import type { Point } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<'home' | 'tracking' | 'viewing'>('home');
  const [userId, setUserId] = useState<string | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | undefined>();
  const [points, setPoints] = useState<Point[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(5);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [shareUrl, setShareUrl] = useState('');

  const trackingTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');
    if (trackId) {
      setUserId(trackId);
      setMode('viewing');
    }
  }, []);

  useEffect(() => {
    let interval: number;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, startTime]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const id = 'user_' + Math.random().toString(36).substr(2, 9);
        setUserId(id);
        setStartTime(Date.now());
        setIsTracking(true);
        setMode('tracking');
        setShareUrl(`${window.location.origin}${window.location.pathname}?track=${id}`);

        const initialPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: Math.floor(Date.now() / 1000)
        };
        setCurrentPoint(initialPoint);
        setPoints([initialPoint]);

        startLocationUpdates(id);
      },
      (error) => alert('Error getting location: ' + error.message),
      { enableHighAccuracy: true }
    );
  };

  const startLocationUpdates = (id: string) => {
    trackingTimerRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition((position) => {
        const newPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: Math.floor(Date.now() / 1000)
        };
        setCurrentPoint(newPoint);
        setPoints(prev => [...prev, newPoint]);
        
        // In a real app, you would send this to the server here:
        // api.updateLocation(id, newPoint);
        console.log('Updating location for', id, newPoint);
      });
    }, updateInterval * 1000);
  };

  const stopTracking = () => {
    if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    setIsTracking(false);
    alert('Tracking stopped');
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="container">
      <div className="header">
        <h1>📍 Live Location Tracker</h1>
        <p>Share your real-time location securely</p>
      </div>

      {mode === 'home' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Track Your Location</h2>
          <p style={{ color: '#57606a', marginBottom: '24px' }}>
            Click below to start sharing your live location.
          </p>
          <div style={{ maxWidth: '400px', margin: '0 auto 24px' }}>
            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>
              Update Interval (seconds)
            </label>
            <input 
              type="number" 
              value={updateInterval}
              onChange={(e) => setUpdateInterval(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d0d7de' }}
            />
          </div>
          <button className="btn-primary" onClick={startTracking}>
            📍 Track My Location
          </button>
        </div>
      )}

      {mode === 'tracking' && (
        <div>
          <div className="status status-active">🟢 Location Tracking Active</div>
          
          <div className="location-info">
            <div className="location-info-item">
              <label>Latitude</label>
              <span>{currentPoint?.lat.toFixed(6) || '--'}</span>
            </div>
            <div className="location-info-item">
              <label>Longitude</label>
              <span>{currentPoint?.lng.toFixed(6) || '--'}</span>
            </div>
            <div className="location-info-item">
              <label>Duration</label>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="card">
            <h3>Share Your Location</h3>
            <div className="share-url" onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              alert('Copied to clipboard!');
            }}>
              {shareUrl}
            </div>
          </div>

          <MapComponent currentPoint={currentPoint} points={points} />

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button className="btn-danger" onClick={stopTracking}>
              ⏹️ Stop Tracking
            </button>
          </div>
        </div>
      )}

      {mode === 'viewing' && (
        <div>
          <div className="status status-active">👁️ Viewing Live Location</div>
          <div className="info-box">
            Viewing journey for user: <strong>{userId}</strong>
          </div>
          <MapComponent currentPoint={currentPoint} points={points} />
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
             <button className="btn-secondary" onClick={() => window.location.href = window.location.pathname}>
               Back to Home
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;