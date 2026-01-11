import React, { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import './index.css';
import MapComponent from './MapComponent';
import { supabase } from './supabaseClient';
import type { Point, Journey } from './types';

const App: React.FC = () => {
  const { user } = useUser();
  const [mode, setMode] = useState<'home' | 'tracking' | 'viewing'>('home');
  const [trackId, setTrackId] = useState<string | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | undefined>();
  const [points, setPoints] = useState<Point[]>([]);
  const [pastJourneys, setPastJourneys] = useState<Journey[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(5);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [shareUrl, setShareUrl] = useState('');

  const trackingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('track');
    if (id) {
      setTrackId(id);
      setMode('viewing');
      loadInitialData(id);
      subscribeToUpdates(id);
    }
  }, []);

  const fetchPastJourneys = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching past journeys:', error);
    } else {
      setPastJourneys(data || []);
    }
  };

  useEffect(() => {
    if (user && mode === 'home') {
      fetchPastJourneys();
    }
  }, [user, mode]);

  const loadInitialData = async (id: string) => {
    // Fetch all existing points for this track
    const { data, error } = await supabase
      .from('points')
      .select('lat, lng, timestamp')
      .eq('track_id', id)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching points:', error);
      return;
    }

    if (data && data.length > 0) {
      const formattedPoints = data.map(p => ({
        lat: p.lat,
        lng: p.lng,
        timestamp: new Date(p.timestamp).getTime() / 1000
      }));
      setPoints(formattedPoints);
      setCurrentPoint(formattedPoints[formattedPoints.length - 1]);
    }
  };

  const subscribeToUpdates = (id: string) => {
    const channel = supabase
      .channel(`track:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'points',
          filter: `track_id=eq.${id}`
        },
        (payload) => {
          const newPoint = {
            lat: payload.new.lat,
            lng: payload.new.lng,
            timestamp: new Date(payload.new.timestamp).getTime() / 1000
          };
          setCurrentPoint(newPoint);
          setPoints(prev => [...prev, newPoint]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  useEffect(() => {
    let interval: number;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, startTime]);

  const startTracking = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }

    if (!user) {
      alert('You must be signed in to track location.');
      return;
    }

    // 1. Create a track in Supabase linked to the Clerk user
    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .insert([{ 
        is_active: true,
        user_id: user.id 
      }])
      .select()
      .single();

    if (trackError || !track) {
      console.error('Track creation error:', trackError);
      alert('Failed to initialize tracking on server');
      return;
    }

    const id = track.id;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setTrackId(id);
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

        // 2. Save first point
        await savePoint(id, initialPoint);

        startLocationUpdates(id);
      },
      (error) => alert('Error getting location: ' + error.message),
      { enableHighAccuracy: true }
    );
  };

  const savePoint = async (id: string, point: Point) => {
    const { error } = await supabase
      .from('points')
      .insert([{
        track_id: id,
        lat: point.lat,
        lng: point.lng,
        timestamp: new Date(point.timestamp * 1000).toISOString()
      }]);
    
    if (error) console.error('Error saving point:', error);
  };

  const startLocationUpdates = (id: string) => {
    trackingTimerRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const newPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: Math.floor(Date.now() / 1000)
        };
        setCurrentPoint(newPoint);
        setPoints(prev => [...prev, newPoint]);
        
        await savePoint(id, newPoint);
      });
    }, updateInterval * 1000);
  };

  const stopTracking = async () => {
    if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    setIsTracking(false);
    
    if (trackId) {
      await supabase
        .from('tracks')
        .update({ is_active: false, end_time: new Date().toISOString() })
        .eq('id', trackId);
    }
    
    alert('Tracking stopped and saved');
    fetchPastJourneys(); // Refresh list
  };

  const viewJourney = (id: string) => {
    setTrackId(id);
    setMode('viewing');
    setPoints([]);
    setCurrentPoint(undefined);
    loadInitialData(id);
    window.history.pushState({}, '', `?track=${id}`);
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="container">
      <div className="header" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
          <UserButton />
        </div>
        <h1>📍 Live Location Tracker</h1>
        <p>Powered by Supabase Realtime</p>
      </div>

      {mode === 'home' && (
        <>
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Track Your Location</h2>
            <p style={{ color: '#57606a', marginBottom: '24px' }}>
              {user ? `Welcome, ${user.firstName || 'User'}!` : 'Sign in to start sharing your live location.'}
            </p>
            
            <SignedOut>
              <div style={{ margin: '20px 0' }}>
                <SignInButton mode="modal">
                  <button className="btn-primary">Sign In to Track</button>
                </SignInButton>
              </div>
            </SignedOut>

            <SignedIn>
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
            </SignedIn>
          </div>

          <SignedIn>
            {pastJourneys.length > 0 && (
              <div className="card">
                <h3>📜 My Past Journeys</h3>
                <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                  {pastJourneys.map((journey) => (
                    <div 
                      key={journey.id} 
                      onClick={() => viewJourney(journey.id)}
                      style={{ 
                        padding: '16px', 
                        border: '1px solid #d0d7de', 
                        borderRadius: '6px', 
                        cursor: 'pointer',
                        background: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {new Date(journey.created_at).toLocaleDateString()} at {new Date(journey.created_at).toLocaleTimeString()}
                        </div>
                        <div style={{ fontSize: '12px', color: '#57606a', marginTop: '4px' }}>
                          ID: {journey.id.substring(0, 8)}...
                        </div>
                      </div>
                      <div className={`status ${journey.is_active ? 'status-active' : 'status-inactive'}`} style={{ marginBottom: 0 }}>
                        {journey.is_active ? 'Active' : 'Completed'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SignedIn>
        </>
      )}

      {mode === 'tracking' && (
        <div>
          <div className="status status-active">🟢 Live Tracking (Synced to DB)</div>
          
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
          <div className="status status-active">👁️ Viewing Journey</div>
          <div className="info-box">
            Viewing journey: <strong>{trackId}</strong>
          </div>
          
          <div className="location-info">
            <div className="location-info-item">
              <label>Latitude</label>
              <span>{currentPoint?.lat.toFixed(6) || 'Waiting...'}</span>
            </div>
            <div className="location-info-item">
              <label>Longitude</label>
              <span>{currentPoint?.lng.toFixed(6) || 'Waiting...'}</span>
            </div>
            <div className="location-info-item">
              <label>Data Points</label>
              <span>{points.length}</span>
            </div>
          </div>

          <MapComponent currentPoint={currentPoint} points={points} />
          
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
             <button className="btn-secondary" onClick={() => {
               setMode('home');
               setTrackId(null);
               window.history.pushState({}, '', window.location.pathname);
             }}>
               Back to Home
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
