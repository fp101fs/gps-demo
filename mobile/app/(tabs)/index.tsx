import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, TouchableOpacity, Modal, ScrollView, Image, Platform, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import Map from '@/components/Map';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRouter, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { storage, generateAnonymousId, getOrCreateDeviceId } from '@/lib/storage';
import { generateFleetCode } from '@/lib/utils';
import { calculateDistance, formatDistance } from '@/lib/LocationUtils';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import * as Battery from 'expo-battery';
import { useAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

interface FleetMember {
  id: string;
  lat: number;
  lng: number;
  avatarUrl?: string;
  user_id: string;
  nickname?: string;
  isSos?: boolean;
  lastSeen?: string;
  battery_level?: number;
  battery_state?: string;
}

// Default location (San Francisco) for showing ghosts before user enables location
const DEFAULT_LOCATION = { lat: 37.7749, lng: -122.4194 };

export default function FleetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { user } = useAuth();
  const { code: inviteCode } = useLocalSearchParams<{ code?: string }>();
  
  const [fleetCode, setFleetCode] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [members, setMembers] = useState<FleetMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [myTrackId, setMyTrackId] = useState<string | null>(null);
  
  // Ghost / Demo State
  const [ghosts, setGhosts] = useState<any[]>([]);
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);

  // UI State
  const [isMembersPanelCollapsed, setIsMembersPanelCollapsed] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FleetMember | null>(null);
  const [zoomTarget, setZoomTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Location watching ref for anonymous sharing
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      // Generate ghosts at default location immediately
      generateGhosts(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);

      // Show demo Circle Active overlay immediately for first-time visitors
      const saved = await storage.getItem('last_fleet_code');
      if (!saved && !inviteCode) {
        const demoCode = generateFleetCode();
        setFleetCode(demoCode);
        setActiveCode(demoCode);
      }

      // Check location permission
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermission(status);

      const tid = await storage.getItem('current_track_id');
      setMyTrackId(tid);

      // Get persistent device ID for logging
      const deviceId = await getOrCreateDeviceId();

      // Log startup info
      logger.fleet('App initialized', {
        deviceId,
        locationPermission: status,
        isSignedIn: !!user,
        userId: user?.id || 'anonymous',
        savedFleetCode: saved,
        currentTrackId: tid
      });

      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        // Reposition ghosts around user's actual location
        generateGhosts(loc.coords.latitude, loc.coords.longitude);
      }
    })();
  }, []);

  // Cleanup on unmount - stop location watching and heartbeat
  useEffect(() => {
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, []);

  // Password Protection State
  const [needsPassword, setNeedsPassword] = useState(false);
  const [correctPassword, setCorrectPassword] = useState<string | null>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // 1. Persistence & Auto-join Logic
  useEffect(() => {
    const init = async () => {
        const saved = await storage.getItem('last_fleet_code');
        const initialCode = inviteCode || saved;

        if (initialCode) {
            logger.fleet('Auto-joining fleet from storage', { code: initialCode, source: inviteCode ? 'invite' : 'saved' });
            setFleetCode(initialCode);
            connectToCircle(initialCode);
        }
    };
    init();
  }, [inviteCode]);

  useEffect(() => {
      // Clear ghosts if real members join (more than just me)
      if (members.length > 1 && ghosts.length > 0) {
          removeGhosts();
      }
  }, [members.length]);

  const ghostAvatars = [
      require('@/assets/images/dude.avif'),
      require('@/assets/images/girl.avif'),
      require('@/assets/images/car.png'),
  ];

  const generateGhosts = (centerLat: number, centerLng: number) => {
      const newGhosts = Array.from({ length: 3 }).map((_, i) => ({
          id: `ghost-${i}`,
          lat: centerLat + (Math.random() - 0.5) * 0.005,
          lng: centerLng + (Math.random() - 0.5) * 0.005,
          nickname: `Demo User ${i + 1}`,
          isGhost: true,
          battery_level: Math.floor(Math.random() * 100),
          battery_state: 'unplugged',
          localAvatar: ghostAvatars[i],
      }));
      setGhosts(newGhosts);
  };

  const removeGhosts = async () => {
      setGhosts([]);
      setShowGhostModal(false);
      await storage.setItem('is_demo_mode', 'false');
  };

  // Ghost Movement Effect
  useEffect(() => {
      if (ghosts.length === 0) return;
      const interval = setInterval(() => {
          setGhosts(prev => prev.map(g => ({
              ...g,
              lat: g.lat + (Math.random() - 0.5) * 0.0005,
              lng: g.lng + (Math.random() - 0.5) * 0.0005,
          })));
      }, 2000);
      return () => clearInterval(interval);
  }, [ghosts.length]);

  const connectToCircle = async (code: string) => {
      if (!code) return;
      logger.fleet('Connecting to circle...', { code });
      setLoading(true);
      try {
          const { data } = await supabase.from('tracks').select('password').eq('party_code', code).eq('is_active', true).not('password', 'is', null).limit(1);
          if (data && data.length > 0) {
              logger.fleet('Password required for fleet', { code });
              setCorrectPassword(data[0].password);
              setNeedsPassword(true);
              setLoading(false);
              return;
          }
          setActiveCode(code);
          await storage.setItem('last_fleet_code', code);
          logger.success('Joined fleet', { code });
      } catch (e) {
          logger.error('Failed to connect to fleet', { code, error: String(e) });
      }
      setLoading(false);
  };

  const verifyPassword = async () => {
      if (enteredPassword === correctPassword) {
          setNeedsPassword(false);
          setActiveCode(fleetCode);
          await storage.setItem('last_fleet_code', fleetCode);
          setPasswordError(false);
          logger.success('Password verified, joined fleet', { code: fleetCode });
      } else {
          setPasswordError(true);
          logger.error('Invalid password for fleet', { code: fleetCode });
      }
  };

  useEffect(() => {
    if (!activeCode) return;

    const fetchFleet = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tracks')
        .select('id, lat, lng, avatar_url, user_id, is_sos, nickname, updated_at, created_at, battery_level, battery_state')
        .eq('party_code', activeCode)
        .eq('is_active', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);

      if (!error && data) {
        const mappedMembers = data.map(m => ({
            id: m.id,
            lat: m.lat,
            lng: m.lng,
            avatarUrl: m.avatar_url,
            user_id: m.user_id,
            isSos: m.is_sos,
            nickname: m.nickname,
            lastSeen: m.updated_at || m.created_at,
            battery_level: m.battery_level,
            battery_state: m.battery_state
        }));
        setMembers(mappedMembers);

        // Log detailed fleet info
        const now = Date.now();
        const onlineThreshold = 300000; // 5 minutes
        const membersOnline = mappedMembers.filter(m => m.lastSeen && (now - new Date(m.lastSeen).getTime() < onlineThreshold)).length;
        const memberDetails = mappedMembers.map(m => {
            const lastSeenMs = m.lastSeen ? now - new Date(m.lastSeen).getTime() : null;
            const lastSeenStr = lastSeenMs !== null ? (lastSeenMs < 60000 ? 'just now' : `${Math.floor(lastSeenMs / 60000)}m ago`) : 'unknown';
            const isOnline = lastSeenMs !== null && lastSeenMs < onlineThreshold;
            return {
                nickname: m.nickname || 'Anonymous',
                status: isOnline ? '🟢 online' : '⚫ offline',
                lastSeen: lastSeenStr,
                battery: m.battery_level !== undefined ? `${m.battery_level}%` : 'N/A',
                isSos: m.isSos ? '🚨 SOS' : null
            };
        });
        logger.fleet('Fleet loaded', {
            code: activeCode,
            totalMembers: mappedMembers.length,
            membersOnline,
            members: memberDetails
        });
      } else if (error) {
        logger.error('Failed to fetch fleet', { code: activeCode, error: error.message });
      }
      setLoading(false);
    };

    fetchFleet();

    logger.realtime('Subscribing to fleet updates', { code: activeCode });
    const channel = supabase.channel(`fleet_${activeCode}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tracks', filter: `party_code=eq.${activeCode}` }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) {
                 logger.realtime('Member left or became inactive', { code: activeCode, memberId: m.id, nickname: m.nickname });
                 setMembers(prev => prev.filter(p => p.id !== m.id));
                 return;
             }
             setMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) {
                     // Position update
                     return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at || m.created_at, battery_level: m.battery_level, battery_state: m.battery_state } : p);
                 }
                 // New member joined
                 logger.realtime('New member joined fleet', {
                     code: activeCode,
                     nickname: m.nickname || 'Anonymous',
                     battery: m.battery_level !== undefined ? `${m.battery_level}%` : 'N/A'
                 });
                 return [...prev, { id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, user_id: m.user_id, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at || m.created_at, battery_level: m.battery_level, battery_state: m.battery_state }];
             });
          }
    }).subscribe();
    return () => {
        logger.realtime('Unsubscribing from fleet updates', { code: activeCode });
        supabase.removeChannel(channel);
    };
  }, [activeCode]);

  const handleExit = async () => {
      logger.fleet('Leaving fleet...', { code: activeCode, trackId: myTrackId });

      // Stop location watching and heartbeat if active
      if (locationWatchRef.current) {
          locationWatchRef.current.remove();
          locationWatchRef.current = null;
          logger.location('Stopped location watching');
      }
      if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
      }

      // Deactivate track in Supabase
      if (myTrackId) {
          await supabase.from('tracks').update({ is_active: false }).eq('id', myTrackId);
      }

      // Clear local state
      const exitedCode = activeCode;
      setActiveCode(null);
      setMembers([]);
      setMyTrackId(null);
      await storage.removeItem('last_fleet_code');
      await storage.removeItem('current_track_id');

      logger.success('Left fleet', { code: exitedCode });
  };

  const handleCreateFleet = async () => {
    const newCode = generateFleetCode();
    setFleetCode(newCode);
    setActiveCode(newCode);
    await storage.setItem('last_fleet_code', newCode);
  };

  const handleJoinMap = () => {
      router.push({ pathname: '/(tabs)', params: { action: 'start_tracking', code: activeCode || '' } });
  };

  const startLocationWatching = async (trackId: string) => {
      // Load location interval from settings (default 5s)
      const savedInterval = await storage.getItem('location_interval');
      const timeInterval = savedInterval ? parseInt(savedInterval, 10) : 5000;

      logger.location('Starting location watching', { trackId, interval: timeInterval });

      locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval, distanceInterval: 10 },
          async (loc) => {
              const newLat = loc.coords.latitude;
              const newLng = loc.coords.longitude;
              setCurrentLocation({ lat: newLat, lng: newLng });

              // Get current battery status
              let batteryLevel: number | null = null;
              let batteryState: string | null = null;
              try {
                  const level = await Battery.getBatteryLevelAsync();
                  batteryLevel = Math.round(level * 100);
                  const state = await Battery.getBatteryStateAsync();
                  batteryState = state === Battery.BatteryState.CHARGING ? 'charging' :
                                (state === Battery.BatteryState.FULL ? 'full' :
                                (state === Battery.BatteryState.UNPLUGGED ? 'unplugged' : 'unknown'));
              } catch (e) {}

              // Update track position and battery in Supabase
              await supabase.from('tracks').update({
                  lat: newLat,
                  lng: newLng,
                  battery_level: batteryLevel,
                  battery_state: batteryState,
                  updated_at: new Date().toISOString(),
              }).eq('id', trackId);

              // Also insert point for history
              await supabase.from('points').insert([{
                  track_id: trackId,
                  lat: newLat,
                  lng: newLng,
                  timestamp: new Date().toISOString()
              }]);
          }
      );

      // Heartbeat: update updated_at every 60s to keep user "online" even when stationary
      heartbeatRef.current = setInterval(async () => {
          await supabase.from('tracks').update({
              updated_at: new Date().toISOString()
          }).eq('id', trackId);
      }, 60000);
  };

  const startAnonymousSharing = async (location: { lat: number, lng: number }, existingCode?: string | null) => {
      // Get persistent device ID (same across sessions)
      const deviceId = await getOrCreateDeviceId();
      const codeToUse = existingCode || generateFleetCode();

      logger.fleet('Starting anonymous sharing', { code: codeToUse, deviceId, isJoining: !!existingCode });

      // Check for existing track for this device in this fleet
      const { data: existingTrack } = await supabase
          .from('tracks')
          .select('id')
          .eq('user_id', deviceId)
          .eq('party_code', codeToUse)
          .limit(1)
          .single();

      if (existingTrack) {
          // Reactivate existing track instead of creating duplicate
          logger.fleet('Reactivating existing track for device', { code: codeToUse, trackId: existingTrack.id, deviceId });

          await supabase.from('tracks').update({
              is_active: true,
              lat: location.lat,
              lng: location.lng,
              updated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60 * 60000).toISOString(),
          }).eq('id', existingTrack.id);

          await storage.setItem('current_track_id', existingTrack.id);
          await storage.setItem('last_fleet_code', codeToUse);
          setMyTrackId(existingTrack.id);

          if (!existingCode) {
              setFleetCode(codeToUse);
              setActiveCode(codeToUse);
          }

          startLocationWatching(existingTrack.id);
          logger.success('Reactivated existing track', { code: codeToUse, trackId: existingTrack.id });
          return;
      }

      // Capture battery data
      let batteryLevel: number | null = null;
      let batteryState: string | null = null;
      try {
          const level = await Battery.getBatteryLevelAsync();
          batteryLevel = Math.round(level * 100);
          const state = await Battery.getBatteryStateAsync();
          batteryState = state === Battery.BatteryState.CHARGING ? 'charging' :
                        (state === Battery.BatteryState.FULL ? 'full' :
                        (state === Battery.BatteryState.UNPLUGGED ? 'unplugged' : 'unknown'));
      } catch (e) {
          console.log('Battery info not available');
      }

      // Create NEW track in Supabase with persistent device ID
      const { data: track, error } = await supabase.from('tracks').insert([{
          is_active: true,
          user_id: deviceId,
          party_code: codeToUse,
          lat: location.lat,
          lng: location.lng,
          nickname: 'Anonymous',
          expires_at: new Date(Date.now() + 60 * 60000).toISOString(), // 1 hour default
          share_type: 'live',
          battery_level: batteryLevel,
          battery_state: batteryState,
      }]).select().single();

      if (error) {
          Alert.alert('Error', 'Could not start sharing.');
          logger.error('Failed to create anonymous track', { code: codeToUse, deviceId, error: error.message });
          return;
      }

      logger.success('Created new track', { code: codeToUse, trackId: track.id, deviceId });

      // Store locally
      await storage.setItem('current_track_id', track.id);
      await storage.setItem('last_fleet_code', codeToUse);

      // Update UI state
      setMyTrackId(track.id);
      // Only update fleet/activeCode if we generated a new code (not joining existing)
      if (!existingCode) {
          setFleetCode(codeToUse);
          setActiveCode(codeToUse);
      }

      // Start location watching
      startLocationWatching(track.id);
  };

  const handleEnableLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          const location = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setCurrentLocation(location);
          // Reposition ghosts around user's actual location
          generateGhosts(location.lat, location.lng);

          // Auto-start sharing for ALL users (pass activeCode if joining existing fleet)
          await startAnonymousSharing(location, activeCode);
      } else {
          Alert.alert('Permission Required', 'Location access is needed to show your position on the map.');
      }
  };

  const handleSignIn = async () => {
      try {
          const redirectTo = Platform.OS === 'web'
              ? window.location.origin
              : Linking.createURL('/');

          const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                  queryParams: { access_type: 'offline', prompt: 'consent' },
                  redirectTo,
              },
          });

          if (error) throw error;
          if (data.url) {
              if (Platform.OS === 'web') {
                  window.location.href = data.url;
              } else {
                  await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
              }
          }
      } catch (err) {
          console.error('Auth error', err);
      }
  };

  const shareInvite = async () => {
      const url = `${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/?code=${activeCode}`;
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (Platform.OS !== 'web') {
          await Share.share({ message: `Join my Family Circle on location.tools! Click here: ${url}`, url });
      }
  };

  if (needsPassword) {
      return (
          <View className="flex-1 bg-white dark:bg-black p-6 justify-center items-center">
              <View style={{ width: '100%', maxWidth: 400 }} className="items-center">
                <View className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-6"><Ionicons name="shield-checkmark" size={48} color="#2563eb" /></View>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Password Required</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center mb-8">The Family Circle "#{fleetCode}" is protected. Enter password to join.</Text>
                <TextInput value={enteredPassword} onChangeText={(text) => { setEnteredPassword(text); setPasswordError(false); }} placeholder="Circle Password" placeholderTextColor="#9ca3af" className={`w-full bg-gray-50 dark:bg-gray-800 dark:text-white p-4 rounded-xl border mb-4 text-center text-lg ${passwordError ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} secureTextEntry />
                {passwordError && <Text className="text-red-500 mb-4">Incorrect password. Please try again.</Text>}
                <Button onPress={verifyPassword} className="w-full h-14"><Text className="text-white font-bold text-lg">Join Circle</Text></Button>
                <TouchableOpacity onPress={() => setNeedsPassword(false)} className="mt-6"><Text className="text-gray-400 font-medium">Cancel</Text></TouchableOpacity>
              </View>
          </View>
      );
  }

  const sosMembers = members.filter(m => m.isSos);

  return (
    <View className="flex-1 bg-white dark:bg-black" style={{ paddingTop: insets.top }}>
      {loading && <View className="absolute inset-0 items-center justify-center z-50"><ActivityIndicator color="#2563eb" /></View>}
      <View className="flex-1">
            {activeCode && (
                <View className="absolute top-12 left-16 right-4 z-10 gap-2 items-center">
                     <View className="flex-row gap-2 w-full max-w-2xl">
                        <View className="flex-1 bg-white/90 dark:bg-black/80 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-md">
                            <View className="flex-row justify-between items-center">
                                <View>
                                    <Text className="text-3xl font-black text-black dark:text-white">#{activeCode}</Text>
                                    <Text className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">{members.filter(m => m.lastSeen && (Date.now() - new Date(m.lastSeen).getTime() < 300000)).length} members online</Text>
                                </View>
                                <TouchableOpacity onPress={() => setShowInviteModal(true)} className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-lg"><Ionicons name="person-add" size={40} color="#2563eb" /></TouchableOpacity>
                            </View>
                        </View>
                        <Button variant="destructive" className="h-full px-4" onPress={handleExit}>
                            <Ionicons name="exit-outline" size={20} color="white" />
                        </Button>
                     </View>
                     {sosMembers.length > 0 && (
                         <View className="w-full max-w-2xl bg-red-600 p-4 rounded-xl shadow-lg flex-row items-center gap-3 animate-pulse">
                             <Ionicons name="warning" size={28} color="white" />
                             <View className="flex-1"><Text className="text-white font-black text-lg uppercase">Emergency SOS!</Text><Text className="text-white font-medium text-xs">{sosMembers.length} family member{sosMembers.length > 1 ? 's' : ''} triggered an alert!</Text></View>
                         </View>
                     )}
                </View>
            )}
            <View className="flex-1 relative">
                <Map
                    points={[]}
                    fleetMembers={[...members, ...ghosts]}
                    theme={colorScheme as 'light' | 'dark'}
                    currentPoint={currentLocation ? { ...currentLocation, timestamp: Date.now() } : undefined}
                    avatarUrl={user?.user_metadata?.avatar_url}
                    zoomTarget={zoomTarget}
                    onMemberSelect={(m) => {
                        if (m.isGhost) {
                            setShowGhostModal(true);
                        } else {
                            setSelectedMember(m);
                        }
                    }}
                />

                {locationPermission !== 'granted' && (
                    <View className="absolute inset-0 flex items-center justify-center z-20">
                        <TouchableOpacity
                            onPress={handleEnableLocation}
                            className="bg-blue-500 px-8 py-4 rounded-full shadow-lg"
                            style={{ shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}
                        >
                            <Text className="text-white font-bold text-lg">Enable Location Services</Text>
                        </TouchableOpacity>
                    </View>
                )}

            </View>

            {activeCode && (
                <View className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-lg p-4 ${isMembersPanelCollapsed ? '' : 'max-h-[40%]'}`}>
                    <TouchableOpacity onPress={() => setIsMembersPanelCollapsed(!isMembersPanelCollapsed)} className="items-center pb-2">
                        <View className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mb-2" />
                        <View className="flex-row items-center gap-2">
                            <Text className="text-lg font-bold text-gray-900 dark:text-white">Fleet Members ({members.filter(m => m.lastSeen && (Date.now() - new Date(m.lastSeen).getTime() < 300000)).length} online / {members.length} total)</Text>
                            <Ionicons name={isMembersPanelCollapsed ? 'chevron-up' : 'chevron-down'} size={20} color="#6b7280" />
                        </View>
                    </TouchableOpacity>
                    {!isMembersPanelCollapsed && (
                    <ScrollView>
                        {members.map(member => (
                            <View key={member.id} className="flex-row items-center p-3 mb-2 bg-gray-50 dark:bg-gray-800 rounded-xl" style={{ opacity: (member.lastSeen && (Date.now() - new Date(member.lastSeen).getTime() > 300000)) ? 0.5 : 1 }}>
                                <View className="relative">
                                    {member.avatarUrl ? (
                                        <Image source={{ uri: member.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                    ) : (
                                        <Image source={require('@/assets/images/marker-green-cross.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
                                    )}
                                    {member.isSos && <View className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 border border-white"><Ionicons name="warning" size={10} color="white" /></View>}
                                </View>
                                <View className="flex-1 ml-3">
                                    <View className="flex-row items-center gap-1">
                                        <Text className="font-bold text-gray-900 dark:text-white">{member.nickname || 'Family Member'}</Text>
                                        {myTrackId === member.id ? (
                                            <Text className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded">(This Device)</Text>
                                        ) : (
                                            user && member.user_id === user.id && <Text className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">(You)</Text>
                                        )}
                                    </View>
                                    <View className="flex-row items-center gap-2">
                                        {member.lastSeen && <Text className="text-xs text-gray-500">{new Date(member.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
                                        {currentLocation && <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">• {formatDistance(calculateDistance(currentLocation, member))}</Text>}
                                </View>
                            </View>
                            {member.battery_level !== undefined && (
                                <View className="items-end">
                                    <View className="flex-row items-center gap-1">
                                        <Text className={`text-xs font-bold ${member.battery_level < 20 ? 'text-red-500' : 'text-green-600'}`}>{member.battery_level}%</Text>
                                        <Ionicons 
                                            name={member.battery_state === 'charging' ? 'battery-charging' : (member.battery_level < 20 ? 'battery-dead' : 'battery-full')} 
                                            size={16} 
                                            color={member.battery_level < 20 ? '#ef4444' : '#16a34a'} 
                                        />
                                    </View>
                                    <Text className="text-[10px] text-gray-400 capitalize">{member.battery_state || 'Unknown'}</Text>
                                </View>
                            )}
                        </View>
                    ))}
                    {members.length === 0 && <Text className="text-center text-gray-500 py-4">Waiting for family to join...</Text>}
                    </ScrollView>
                    )}
                </View>
            )}

            {/* Zoom To Toast - positioned above members panel */}
            {selectedMember && (
                <View className="absolute bottom-[45%] left-4 right-4 z-50 flex-row items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                    <View className="flex-row items-center gap-3">
                        {selectedMember.avatarUrl ? (
                            <Image source={{ uri: selectedMember.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                        ) : (
                            <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center">
                                <Ionicons name="person" size={24} color="#2563eb" />
                            </View>
                        )}
                        <Text className="font-bold text-gray-900 dark:text-white text-lg">{selectedMember.nickname || 'Family Member'}</Text>
                    </View>
                    <View className="flex-row gap-2">
                        <TouchableOpacity
                            onPress={() => {
                                setZoomTarget({ lat: selectedMember.lat, lng: selectedMember.lng });
                                setSelectedMember(null);
                                setTimeout(() => setZoomTarget(null), 500);
                            }}
                            className="bg-blue-500 px-5 py-3 rounded-lg"
                        >
                            <Text className="text-white font-bold text-base">Zoom To</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setSelectedMember(null)}
                            className="bg-gray-200 dark:bg-gray-700 px-4 py-3 rounded-lg"
                        >
                            <Ionicons name="close" size={20} color="#6b7280" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
          <View className="flex-1 justify-center items-center bg-black/50 p-6">
              <View className="bg-white dark:bg-gray-900 p-8 rounded-3xl items-center shadow-xl w-full max-w-sm">
                  <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invite to Circle</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-center mb-6 text-sm">Have your family scan this code or use the link below to join #{activeCode} instantly.</Text>
                  <View className="bg-white p-4 rounded-2xl mb-6 shadow-sm border border-gray-100"><QRCode value={`${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/?code=${activeCode}`} size={180} color="black" backgroundColor="white" /></View>
                  <TouchableOpacity onPress={shareInvite} className="w-full bg-gray-100 dark:bg-gray-800 p-4 rounded-xl flex-row justify-between items-center mb-4"><Text className="text-blue-600 dark:text-blue-400 font-bold" numberOfLines={1}>{copied ? 'Link Copied!' : 'Copy Invite Link'}</Text><Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color="#2563eb" /></TouchableOpacity>
                  <Button onPress={() => setShowInviteModal(false)} className="w-full h-12"><Text className="text-white font-bold">Close</Text></Button>
              </View>
          </View>
      </Modal>

      <Modal visible={showGhostModal} transparent={true} animationType="fade" onRequestClose={() => setShowGhostModal(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 p-6">
            <View className="bg-white dark:bg-gray-900 p-8 rounded-3xl items-center shadow-xl w-full max-w-sm">
                <View className="bg-purple-100 dark:bg-purple-900/30 p-4 rounded-full mb-4">
                    <Ionicons name="people" size={48} color="#9333ea" />
                </View>
                <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Live Demo Mode</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center mb-6 text-sm">
                    We've added some "Ghost" users to show you how real-time fleet tracking looks when your family joins.
                </Text>
                <Button onPress={removeGhosts} className="w-full mb-3 bg-purple-600">
                    <Text className="text-white font-bold">Clear Ghosts</Text>
                </Button>
                <TouchableOpacity onPress={() => setShowGhostModal(false)} className="py-2">
                    <Text className="text-gray-400 font-medium">Keep for now</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </View>
  );
}
