import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, Platform, Switch, TextInput, useWindowDimensions, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { Button } from '@/components/ui/Button';
import { useUser, useOAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { useColorScheme } from 'nativewind';
import { Notifications } from '@/lib/notifications';
import { getDistanceFromLatLonInM } from '@/lib/utils';
import { Ionicons } from '@expo/vector-icons';

type AccessStatus = 'checking' | 'allowed' | 'denied_privacy' | 'needs_password';

export default function SharedTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isSignedIn, isLoaded: isUserLoaded } = useUser();
  const { colorScheme } = useColorScheme();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 1024;
  
  const [points, setPoints] = useState<Point[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [shareType, setShareType] = useState<string | null>(null);
  const [trackCoords, setTrackLoc] = useState<{lat: number, lng: number} | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Privacy State
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('checking');
  const [correctPassword, setCorrectPassword] = useState<string | null>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Share Back State
  const [isSharing, setIsSharing] = useState(false);
  const [myTrackId, setMyTrackId] = useState<string | null>(null);
  const [adHocMembers, setAdHocMembers] = useState<{ id: string; lat: number; lng: number; avatarUrl?: string }[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{lat: number, lng: number} | null>(null);

  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityDistance, setProximityDistance] = useState('500');
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [arrivalDistance, setArrivalDistance] = useState('50');
  const alertedHostRef = useRef<boolean>(false);
  const arrivedHostRef = useRef<boolean>(false);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const onSignInPress = async () => {
    try {
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Platform.OS === 'web' ? window.location.href : 'gps-demo://track/' + id,
      });
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
    } catch (err) { console.error(err); }
  };

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      setResolvedAddress(data.display_name || 'Address not found');
    } catch (e) {}
  };

  useEffect(() => {
    if (!id || !isUserLoaded) return;

    const fetchInitialData = async () => {
      try {
        const { data: track, error: trackError } = await supabase
            .from('tracks')
            .select('is_active, avatar_url, note, expires_at, user_id, created_at, share_type, lat, lng, privacy_mode, allowed_emails, password')
            .eq('id', id)
            .single();

        if (trackError) throw trackError;

        // Privacy Check
        if (track.privacy_mode === 'private') {
            if (!isSignedIn) {
                setAccessStatus('denied_privacy');
                setLoading(false);
                return;
            }
            const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
            if (!track.allowed_emails?.includes(userEmail)) {
                setAccessStatus('denied_privacy');
                setLoading(false);
                return;
            }
        }

        if (track.password) {
            setCorrectPassword(track.password);
            setAccessStatus('needs_password');
        } else {
            setAccessStatus('allowed');
        }

        setIsActive(track.is_active);
        if (track.avatar_url) setAvatarUrl(track.avatar_url);
        setNote(track.note);
        setExpiresAt(track.expires_at);
        setCreatedAt(track.created_at);
        setShareType(track.share_type);
        
        if (track.lat && track.lng) {
            setTrackLoc({ lat: track.lat, lng: track.lng });
            if (track.share_type === 'address' || track.share_type === 'current') {
                fetchAddress(track.lat, track.lng);
            }
        }

        if (track.is_active) Notifications.send(track.user_id, 'New Viewer!', 'Someone is viewing your live location.', 'info');
        
        const { data: pointsData } = await supabase.from('points').select('lat, lng, timestamp').eq('track_id', id).order('timestamp', { ascending: true });
        if (pointsData) setPoints(pointsData.map(p => ({ lat: p.lat, lng: p.lng, timestamp: new Date(p.timestamp).getTime() / 1000 })));
      } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    };
    fetchInitialData();
    
    const channel = supabase.channel(`track_updates_${id}`, { config: { presence: { key: user?.id || 'guest' } } });
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'points', filter: `track_id=eq.${id}` }, (payload) => {
          const p = payload.new;
          setPoints((prev) => [...prev, { lat: p.lat, lng: p.lng, timestamp: new Date(p.timestamp).getTime() / 1000 }]);
    }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tracks', filter: `id=eq.${id}` }, (payload) => {
           setIsActive(payload.new.is_active);
    }).subscribe(async (status) => { if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() }); });
    return () => { supabase.removeChannel(channel); };
  }, [id, isSignedIn, isUserLoaded]);

  const checkPassword = () => {
      if (enteredPassword === correctPassword) {
          setAccessStatus('allowed');
          setPasswordError(false);
      } else {
          setPasswordError(true);
      }
  };

  useEffect(() => {
      if (!expiresAt || !isActive) return;
      const updateTimer = () => {
          const diff = new Date(expiresAt).getTime() - Date.now();
          if (diff <= 0) { setTimeLeft('Expired'); setIsActive(false); return; }
          setTimeLeft(`${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`);
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, [expiresAt, isActive]);

  useEffect(() => {
    if (accessStatus !== 'allowed' || !id) return;
    const fetchAdHoc = async () => {
        const { data } = await supabase.from('tracks').select('id, lat, lng, avatar_url').eq('party_code', id).eq('is_active', true);
        if (data) setAdHocMembers(data.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url })));
    };
    fetchAdHoc();
    const channel = supabase.channel(`adhoc_fleet_view_${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tracks', filter: `party_code=eq.${id}` }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) { setAdHocMembers(prev => prev.filter(p => p.id !== m.id)); return; }
             setAdHocMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url } : p);
                 return [...prev, { id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url }];
             });
          }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, accessStatus]);

  useEffect(() => {
    if (!isSharing || !currentLoc || points.length === 0) return;
    const hostPoint = points[points.length - 1];
    const dist = getDistanceFromLatLonInM(currentLoc.lat, currentLoc.lng, hostPoint.lat, hostPoint.lng);
    const arrThreshold = parseInt(arrivalDistance, 10);
    if (arrivalEnabled && !isNaN(arrThreshold)) {
        if (dist <= arrThreshold && !arrivedHostRef.current) { arrivedHostRef.current = true; Notifications.send(user!.id, 'Arrival Alert!', `You have arrived (${Math.round(dist)}m away).`, 'success'); }
        else if (dist > arrThreshold + 50) arrivedHostRef.current = false;
    }
    const proxThreshold = parseInt(proximityDistance, 10);
    if (proximityEnabled && !isNaN(proxThreshold)) {
        if (dist <= proxThreshold && !alertedHostRef.current) { alertedHostRef.current = true; Notifications.send(user!.id, 'Proximity Alert!', `You are close (${Math.round(dist)}m away).`, 'alert'); }
        else if (dist > proxThreshold + 100) alertedHostRef.current = false;
    }
  }, [currentLoc, points, proximityEnabled, proximityDistance, arrivalEnabled, arrivalDistance, isSharing]);

  const handleCopyAddress = async () => {
      if (resolvedAddress) {
          await Clipboard.setStringAsync(resolvedAddress);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const startSharingBack = async () => {
    if (!isSignedIn || !user) return onSignInPress();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Denied', 'Allow location access.');
    const { data: track, error } = await supabase.from('tracks').insert([{ 
        is_active: true, user_id: user.id, avatar_url: user.imageUrl, party_code: id,
        proximity_enabled: proximityEnabled, proximity_meters: parseInt(proximityDistance) || 500,
        arrival_enabled: arrivalEnabled, arrival_meters: parseInt(arrivalDistance) || 50
    }]).select().single();
    if (error) return Alert.alert('Error', 'Could not share.');
    setMyTrackId(track.id); setIsSharing(true);
    locationSubscription.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 }, async (loc) => {
        setCurrentLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        await supabase.from('tracks').update({ lat: loc.coords.latitude, lng: loc.coords.longitude }).eq('id', track.id);
    });
  };

  const stopSharingBack = async () => {
    if (locationSubscription.current) { try { locationSubscription.current.remove(); } catch(e) {} locationSubscription.current = null; }
    if (myTrackId) await supabase.from('tracks').update({ is_active: false }).eq('id', myTrackId);
    setIsSharing(false); setMyTrackId(null); setCurrentLoc(null);
  };

  if (loading || !isUserLoaded) return <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black"><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (error) return <View className="flex-1 items-center justify-center p-4 bg-gray-50 dark:bg-black"><Text className="text-red-500 text-center">{error}</Text></View>;

  if (accessStatus === 'denied_privacy') {
      return (
          <View className="flex-1 items-center justify-center p-6 bg-white dark:bg-black">
              <Ionicons name="lock-closed" size={64} color="#ef4444" className="mb-4" />
              <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">Access Denied</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-center mb-8">This location share is private. Only specific people can view it.</Text>
              {!isSignedIn ? (
                  <Button onPress={onSignInPress} className="w-full h-14"><Text className="text-white font-bold">Sign in to Check Access</Text></Button>
              ) : (
                  <Text className="text-gray-400 italic">Signed in as {user?.primaryEmailAddress?.emailAddress}</Text>
              )}
          </View>
      );
  }

  if (accessStatus === 'needs_password') {
      return (
          <View className="flex-1 items-center justify-center p-6 bg-white dark:bg-black">
              <View className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-6">
                  <Ionicons name="shield-checkmark" size={48} color="#2563eb" />
              </View>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Password Required</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-center mb-8">This link is password protected for extra security.</Text>
              <TextInput 
                value={enteredPassword} 
                onChangeText={(text) => { setEnteredPassword(text); setPasswordError(false); }} 
                placeholder="Enter password" 
                placeholderTextColor="#9ca3af"
                className={`w-full bg-gray-50 dark:bg-gray-800 dark:text-white p-4 rounded-xl border mb-4 text-center text-lg ${passwordError ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
                secureTextEntry 
              />
              {passwordError && <Text className="text-red-500 mb-4">Incorrect password. Please try again.</Text>}
              <Button onPress={checkPassword} className="w-full h-14"><Text className="text-white font-bold text-lg">Unlock Map</Text></Button>
          </View>
      );
  }

  const currentPoint = points[points.length - 1];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black items-center">
      <Stack.Screen options={{ 
          title: shareType === 'live' ? (isActive ? '🔴 Live Journey' : 'Past Journey') : 
                 shareType === 'current' ? '📍 Pinned Location' : '🏠 Shared Address' 
      }} />
      
      <View style={{ width: '100%', maxWidth: 1000, flex: 1 }}>
          <View className="flex-1 relative">
            <Map currentPoint={currentPoint} points={points} avatarUrl={avatarUrl} theme={colorScheme as 'light' | 'dark'} fleetMembers={adHocMembers} />

            {!isActive && shareType === 'live' && (
                <View className="absolute inset-0 bg-black/60 z-20 items-center justify-center p-6">
                    <View className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl p-6 items-center shadow-xl">
                        <View className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full items-center justify-center mb-4"><Ionicons name="flag" size={32} color="#6b7280" /></View>
                        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Sharing Ended</Text>
                        <Text className="text-gray-500 dark:text-gray-400 text-center mb-6">This session is no longer active.</Text>
                        <View className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6">
                            <View className="flex-row justify-between mb-2"><Text className="text-gray-500 text-sm">Started</Text><Text className="text-gray-900 dark:text-white text-sm font-medium">{createdAt ? new Date(createdAt).toLocaleTimeString() : '--'}</Text></View>
                            <View className="flex-row justify-between"><Text className="text-gray-500 text-sm">Points</Text><Text className="text-gray-900 dark:text-white text-sm font-medium">{points.length}</Text></View>
                        </View>
                        <Button onPress={() => router.replace('/')} className="w-full"><Text className="text-white font-bold">Back to Home</Text></Button>
                    </View>
                </View>
            )}

            {(shareType === 'address' || shareType === 'current') && (
                <View className="absolute top-4 left-4 right-4 z-10 items-center">
                    <View className="bg-white/95 dark:bg-black/90 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-lg">
                        <View className="flex-row items-center gap-2 mb-3">
                            <View className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full">
                                <Ionicons name={shareType === 'address' ? "home" : "locate"} size={20} color="#2563eb" />
                            </View>
                            <Text className="text-lg font-bold text-gray-900 dark:text-white flex-1">
                                {shareType === 'address' ? 'Location Address' : 'Precise Coordinates'}
                            </Text>
                        </View>
                        {resolvedAddress ? <Text className={`text-gray-800 dark:text-gray-200 mb-4 leading-relaxed ${shareType === 'address' ? 'text-xl font-semibold' : 'text-sm'}`}>{resolvedAddress}</Text> : <ActivityIndicator className="mb-4" color="#2563eb" />}
                        {shareType === 'current' && trackCoords && (
                            <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4 border border-gray-100 dark:border-gray-700">
                                <View className="flex-row justify-between mb-1"><Text className="text-gray-500 text-xs uppercase font-bold">Latitude</Text><Text className="text-gray-900 dark:text-white font-monospaced">{trackCoords.lat.toFixed(6)}</Text></View>
                                <View className="flex-row justify-between"><Text className="text-gray-500 text-xs uppercase font-bold">Longitude</Text><Text className="text-gray-900 dark:text-white font-monospaced">{trackCoords.lng.toFixed(6)}</Text></View>
                            </View>
                        )}
                        <View className="flex-row gap-2">
                            <TouchableOpacity onPress={handleCopyAddress} className={cn("flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl", copied ? "bg-green-600" : "bg-blue-600")}><Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color="white" /><Text className="text-white font-bold">{copied ? 'Copied!' : 'Copy Address'}</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${trackCoords?.lat},${trackCoords?.lng}`)} className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-xl"><Ionicons name="map-outline" size={20} color={colorScheme === 'dark' ? 'white' : 'black'} /></TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {(note || timeLeft) && isActive && shareType === 'live' && (
                <View className="absolute top-4 left-4 right-4 z-10 items-center">
                    <View className="bg-white/90 dark:bg-black/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm w-full max-w-md">
                        {note && <View className="flex-row items-center gap-2 mb-1"><Ionicons name="chatbubble-outline" size={16} color="#2563eb" /><Text className="text-gray-900 dark:text-white font-medium flex-1">{note}</Text></View>}
                        {timeLeft && <View className="flex-row items-center gap-2"><Ionicons name="time-outline" size={16} color="#6b7280" /><Text className="text-gray-500 dark:text-gray-400 text-xs">{timeLeft === 'Expired' ? 'Sharing has ended' : `Expires in: ${timeLeft}`}</Text></View>}
                    </View>
                </View>
            )}
          </View>

          <View className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
              <View className="flex-row justify-between items-center mb-2">
                <View><Text className="text-xs font-semibold uppercase text-gray-400">Status</Text><Text className={`text-lg font-bold ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>{shareType === 'live' ? (isActive ? 'Tracking Live' : 'Completed') : shareType === 'current' ? 'Fixed Point' : 'Address Pin'}</Text></View>
                <View className="items-end"><Text className="text-xs font-semibold uppercase text-gray-400">{shareType === 'live' ? 'Points' : 'Shared On'}</Text><Text className="text-lg font-bold text-black dark:text-white">{shareType === 'live' ? points.length : (createdAt ? new Date(createdAt).toLocaleTimeString() : '--')}</Text></View>
              </View>
              <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 gap-4">
                 {isSharing && isActive && (
                    <View className="flex-row gap-2 flex-wrap">
                        <View className="flex-1 min-w-[200px] bg-blue-50 dark:bg-gray-800 p-3 rounded-lg border border-blue-100 dark:border-gray-700">
                            <View className="flex-row items-center justify-between mb-2"><View className="flex-row items-center gap-2"><Ionicons name="radio-outline" size={20} color="#2563eb" /><Text className="text-gray-900 dark:text-white font-semibold">Proximity Alert</Text></View><Switch value={proximityEnabled} onValueChange={setProximityEnabled} trackColor={{ false: '#e2e8f0', true: '#2563eb' }} /></View>
                            {proximityEnabled && <View className="flex-row items-center gap-2"><Text className="text-gray-600 dark:text-gray-400 text-sm">Alert @</Text><TextInput value={proximityDistance} onChangeText={setProximityDistance} keyboardType="numeric" className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-16 text-center" /><Text className="text-gray-600 dark:text-gray-400 text-sm">m</Text></View>}
                        </View>
                        <View className="flex-1 min-w-[200px] bg-green-50 dark:bg-gray-800 p-3 rounded-lg border border-green-100 dark:border-gray-700">
                            <View className="flex-row items-center justify-between mb-2"><View className="flex-row items-center gap-2"><Ionicons name="flag-outline" size={20} color="#16a34a" /><Text className="text-gray-900 dark:text-white font-semibold">Arrival Alert</Text></View><Switch value={arrivalEnabled} onValueChange={setArrivalEnabled} trackColor={{ false: '#e2e8f0', true: '#16a34a' }} /></View>
                            {arrivalEnabled && <View className="flex-row items-center gap-2"><Text className="text-gray-600 dark:text-gray-400 text-sm">Alert @</Text><TextInput value={arrivalDistance} onChangeText={setArrivalDistance} keyboardType="numeric" className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-16 text-center" /><Text className="text-gray-600 dark:text-gray-400 text-sm">m</Text></View>}
                        </View>
                    </View>
                 )}
                 {isActive && !isSharing && <Button onPress={startSharingBack} variant="secondary" className="w-full"><Text className="text-blue-600 font-bold">{isSignedIn ? 'Share My Location Back' : 'Sign in to Share Back'}</Text></Button>}
                 {isSharing && <Button onPress={stopSharingBack} variant="destructive" className="w-full"><Text className="text-white font-bold">Stop Sharing My Location</Text></Button>}
              </View>
          </View>
      </View>
    </View>
  );
}
