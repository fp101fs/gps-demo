import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform, Share, Switch, Image, TextInput, TouchableOpacity, Modal, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Battery from 'expo-battery';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Notifications } from '@/lib/notifications';
import { cn, getDistanceFromLatLonInM } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import Map from '@/components/Map';
import type { Point, SafeZone } from '@/components/Map';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { storage } from '@/lib/storage';

interface Journey {
  id: string;
  created_at: string;
  is_active: boolean;
  avatar_url?: string;
  proximity_enabled?: boolean;
  proximity_meters?: number;
  privacy_mode?: string;
  allowed_emails?: string[];
  password?: string;
  note?: string;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { colorScheme } = useColorScheme();
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 1024;
  
  const [isTracking, setIsTracking] = useState(false);
  const [currentPoint, setCurrentPoint] = useState<Point | undefined>();
  const [points, setPoints] = useState<Point[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [address, setAddress] = useState('Waiting for location...');
  const [pastJourneys, setPastJourneys] = useState<Journey[]>([]);
  const [copied, setCopied] = useState(false);
  const [useProfileIcon, setUseProfileIcon] = useState(false);
  const [fleetCode, setFleetCode] = useState('');
  const [adHocMembers, setAdHocMembers] = useState<{ id: string; lat: number; lng: number; avatarUrl?: string; isSos?: boolean; nickname?: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [currentExpiresAt, setCurrentExpiresAt] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSos, setIsSos] = useState(false);
  const [userNickname, setUserNickname] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  
  const [durationOption, setDurationOption] = useState<'20m' | '2h' | '10h' | 'Custom'>('20m');
  const [customDuration, setCustomDuration] = useState('60');
  const [shareNote, setShareNote] = useState('');
  const [shareType, setShareType] = useState<'live' | 'current' | 'address'>('live');

  // Privacy Modal State
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareSuccessVisible, setShareSuccessVisible] = useState(false);
  const [tempPrivacyMode, setTempPrivacyMode] = useState<'link' | 'private'>('link');
  const [tempAllowedEmails, setTempAllowedEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  // Safe Zones State
  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState('100');
  const [memberZoneStates, setMemberZoneStates] = useState<{ [memberId: string]: { [zoneId: string]: boolean } }>({});

  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityDistance, setProximityDistance] = useState('500');
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [arrivalDistance, setArrivalDistance] = useState('50');
  const alertedMembersRef = useRef<Set<string>>(new Set());
  const arrivedMembersRef = useRef<Set<string>>(new Set());

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchPastJourneys();
      fetchUnreadCount();
      fetchSafeZones();
      
      const checkPerms = async () => {
          const { status } = await Location.getForegroundPermissionsAsync();
          setLocationPermission(status);
          if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
              if (loc) setCurrentPoint({ lat: loc.coords.latitude, lng: loc.coords.longitude, timestamp: loc.timestamp / 1000 });
          }
      };
      checkPerms();
      
      const checkFirstTime = async () => {
          const hasSeen = await storage.getItem('has_seen_onboarding');
          if (!hasSeen) setShowOnboarding(true);
      };
      checkFirstTime();

      const loadFleet = async () => {
          const saved = await storage.getItem('last_fleet_code');
          if (saved) setFleetCode(saved);
      };
      loadFleet();

      const checkAndWelcome = async () => {
          const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
          if (count === 0) {
              await Notifications.send(user.id, 'Welcome to FindMyFam!', 'Start a live check-in or manage your Safe Zones below.', 'success');
          }
      };
      checkAndWelcome();
    }
  }, [user]);

  const fetchSafeZones = async () => {
      if (!user) return;
      const { data } = await supabase.from('safe_zones').select('*').eq('user_id', user.id);
      if (data) setSafeZones(data);
  };

  const requestPermission = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
          if (loc) setCurrentPoint({ lat: loc.coords.latitude, lng: loc.coords.longitude, timestamp: loc.timestamp / 1000 });
      } else {
          Alert.alert('Permission Required', 'FindMyFam needs location access to work correctly.');
      }
  };

  const addSafeZone = async () => {
      if (!user || !currentPoint || !newZoneName) return;
      setIsAddingZone(true);
      const { data, error } = await supabase.from('safe_zones').insert([{
          user_id: user.id,
          name: newZoneName,
          lat: currentPoint.lat,
          lng: currentPoint.lng,
          radius_meters: parseInt(newZoneRadius) || 100
      }]).select().single();

      if (!error && data) {
          setSafeZones([...safeZones, data]);
          setNewZoneName('');
          setShowZoneModal(false);
      }
      setIsAddingZone(false);
  };

  const deleteSafeZone = async (id: string) => {
      await supabase.from('safe_zones').delete().eq('id', id);
      setSafeZones(safeZones.filter(z => z.id !== id));
  };

  useEffect(() => {
      if (!currentExpiresAt || !isTracking) {
          setTimeLeft(null);
          return;
      }
      const updateTimer = () => {
          const diff = new Date(currentExpiresAt).getTime() - Date.now();
          if (diff <= 0) {
              setTimeLeft('Expired');
              stopTracking();
              return;
          }
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${mins}m ${secs}s`);
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, [currentExpiresAt, isTracking]);

  // Geofencing & Proximity Check Logic
  useEffect(() => {
      if (!isTracking || !currentPoint || adHocMembers.length === 0) return;

      adHocMembers.forEach(async (member) => {
          const dist = getDistanceFromLatLonInM(currentPoint.lat, currentPoint.lng, member.lat, member.lng);
          
          // 1. Safe Zone Checks
          safeZones.forEach(async (zone) => {
              const zoneDist = getDistanceFromLatLonInM(member.lat, member.lng, zone.lat, zone.lng);
              const isInside = zoneDist <= zone.radius_meters;
              const wasInside = memberZoneStates[member.id]?.[zone.id] || false;

              if (isInside && !wasInside) {
                  // Entered Zone
                  await Notifications.send(user!.id, 'Safe Zone: Arrival', `A family member just arrived at ${zone.name}.`, 'success');
                  setMemberZoneStates(prev => ({
                      ...prev,
                      [member.id]: { ...(prev[member.id] || {}), [zone.id]: true }
                  }));
              } else if (!isInside && wasInside) {
                  // Exited Zone
                  await Notifications.send(user!.id, 'Safe Zone: Exit', `A family member just left ${zone.name}.`, 'warning');
                  setMemberZoneStates(prev => ({
                      ...prev,
                      [member.id]: { ...(prev[member.id] || {}), [zone.id]: false }
                  }));
              }
          });

          // 2. Proximity & Arrival Checks
          if (arrivalEnabled) {
              const arrThreshold = parseInt(arrivalDistance, 10);
              if (dist <= arrThreshold && !arrivedMembersRef.current.has(member.id)) {
                  arrivedMembersRef.current.add(member.id);
                  await Notifications.send(user!.id, 'Arrival Alert!', `Member has arrived (${Math.round(dist)}m away).`, 'success');
              } else if (dist > arrThreshold + 50) {
                  arrivedMembersRef.current.delete(member.id);
              }
          }

          if (proximityEnabled) {
              const threshold = parseInt(proximityDistance, 10);
              if (dist <= threshold && !alertedMembersRef.current.has(member.id)) {
                  alertedMembersRef.current.add(member.id);
                  await Notifications.send(user!.id, 'Proximity Alert!', `Member is nearby (${Math.round(dist)}m away).`, 'alert');
              } else if (dist > threshold + 100) {
                  alertedMembersRef.current.delete(member.id);
              }
          }
      });
  }, [currentPoint, adHocMembers, proximityEnabled, proximityDistance, arrivalEnabled, arrivalDistance, safeZones, memberZoneStates]);

  const fetchUnreadCount = async () => {
      if (!user) return;
      const getCount = async () => {
          const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
          setUnreadCount(count || 0);
      };
      getCount();
      const channel = supabase.channel('unread_count').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, getCount).subscribe();
      return () => supabase.removeChannel(channel);
  };

  useEffect(() => {
    if (!trackId) {
        setAdHocMembers([]);
        setViewerCount(0);
        return;
    }
    const channel = supabase.channel(`track_updates_${trackId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks', filter: `party_code=eq.${trackId}` }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) {
                 setAdHocMembers(prev => prev.filter(p => p.id !== m.id));
                 return;
             }
             setAdHocMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos, nickname: m.nickname } : p);
                 return [...prev, { id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos, nickname: m.nickname }];
             });
          }
      })
      .on('presence', { event: 'sync' }, () => {
          setViewerCount(Math.max(0, Object.keys(channel.presenceState()).length - 1));
      })
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString(), role: 'host' });
      });
    return () => { supabase.removeChannel(channel); };
  }, [trackId]);

  const fetchPastJourneys = async () => {
    if (!user) return;
    const { data } = await supabase.from('tracks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setPastJourneys(data);
  };

  const startTracking = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status);
        if (status !== 'granted') { setIsStarting(false); return Alert.alert('Permission denied', 'Allow location access.'); }
        if (!user) { setIsStarting(false); return; }

        let mins = 20;
        if (durationOption === '2h') mins = 120;
        else if (durationOption === '10h') mins = 600;
        else if (durationOption === 'Custom') mins = parseInt(customDuration) || 20;

        const expiresAt = new Date(Date.now() + mins * 60000).toISOString();
        let finalNote = shareNote;
        const initialLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (!initialLocation) { setIsStarting(false); return Alert.alert('Error', 'Could not determine location.'); }

        const lat = initialLocation.coords.latitude;
        const lng = initialLocation.coords.longitude;
        setCurrentPoint({ lat, lng, timestamp: Date.now() / 1000 });

        let batteryLevel = null;
        let batteryState = null;
        try {
            const level = await Battery.getBatteryLevelAsync();
            batteryLevel = Math.round(level * 100);
            const state = await Battery.getBatteryStateAsync();
            batteryState = state === Battery.BatteryState.CHARGING ? 'charging' : (state === Battery.BatteryState.FULL ? 'full' : (state === Battery.BatteryState.UNPLUGGED ? 'unplugged' : 'unknown'));
        } catch (e) {}

        const displayName = userNickname || user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.name?.split(' ')[0] || user.user_metadata?.given_name || 'Family Member';

        if (shareType === 'address' || shareType === 'current') {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                const data = await res.json();
                const addr = data.display_name;
                if (addr) { setAddress(addr); if (shareType === 'address') finalNote = (shareNote ? shareNote + " - " : "") + addr; }
            } catch (e) {}
        }

        const { data: track, error } = await supabase.from('tracks').insert([{ 
            is_active: shareType === 'live', user_id: user.id, avatar_url: useProfileIcon ? user.user_metadata.avatar_url : null, 
            party_code: fleetCode || null, proximity_enabled: proximityEnabled, proximity_meters: parseInt(proximityDistance) || 500,
            arrival_enabled: arrivalEnabled, arrival_meters: parseInt(arrivalDistance) || 50,
            expires_at: shareType === 'live' ? expiresAt : null, note: finalNote || null,
            share_type: shareType, lat: lat, lng: lng, nickname: displayName,
            battery_level: batteryLevel, battery_state: batteryState
        }]).select().single();

        if (error) { setIsStarting(false); return Alert.alert('Error', 'Could not create session.'); }
        await supabase.from('points').insert([{ track_id: track.id, lat: lat, lng: lng, timestamp: new Date().toISOString() }]);

        setTrackId(track.id);
        setIsStarting(false);
        setShareModalVisible(true);

        if (shareType === 'live') {
            setCurrentExpiresAt(expiresAt);
            setIsTracking(true);
            startTimeRef.current = Date.now();
            setPoints([{ lat, lng, timestamp: Date.now()/1000 }]);
            
            timerRef.current = setInterval(() => { if (startTimeRef.current) setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)); }, 1000) as unknown as NodeJS.Timeout;

            locationSubscription.current = await Location.watchPositionAsync(
              { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
              async (loc) => {
                const newPoint = { lat: loc.coords.latitude, lng: loc.coords.longitude, timestamp: loc.timestamp / 1000 };
                setCurrentPoint(newPoint);
                setPoints(prev => [...prev, newPoint]);
                
                let currentBatteryLevel = null;
                let currentBatteryState = null;
                try {
                    const level = await Battery.getBatteryLevelAsync();
                    currentBatteryLevel = Math.round(level * 100);
                    const state = await Battery.getBatteryStateAsync();
                    currentBatteryState = state === Battery.BatteryState.CHARGING ? 'charging' : (state === Battery.BatteryState.FULL ? 'full' : (state === Battery.BatteryState.UNPLUGGED ? 'unplugged' : 'unknown'));
                } catch (e) {}

                await supabase.from('points').insert([{ track_id: track.id, lat: newPoint.lat, lng: newPoint.lng, timestamp: new Date().toISOString() }]);
                await supabase.from('tracks').update({ 
                    lat: newPoint.lat, lng: newPoint.lng,
                    battery_level: currentBatteryLevel, battery_state: currentBatteryState
                }).eq('id', track.id);
              }
            );
        }
    } catch (globalErr) { setIsStarting(false); Alert.alert('Error', 'Unexpected error.'); }
  };

  const toggleSos = async () => {
      if (!trackId) return;
      const newSosState = !isSos;
      try {
          const { error } = await supabase.from('tracks').update({ is_sos: newSosState }).eq('id', trackId);
          if (error) throw error;
          setIsSos(newSosState);
          if (newSosState) Alert.alert('SOS Triggered', 'Your family circle has been notified.');
      } catch (e) { Alert.alert('Error', 'Failed to update SOS.'); }
  };

  const stopTracking = async () => {
    if (locationSubscription.current) { try { locationSubscription.current.remove(); } catch(e) {} locationSubscription.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsTracking(false);
    if (trackId) await supabase.from('tracks').update({ is_active: false, end_time: new Date().toISOString() }).eq('id', trackId);
    Alert.alert('Stopped', 'Journey saved.');
    fetchPastJourneys();
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const confirmShare = async () => {
      if (!trackId) return;
      await supabase.from('tracks').update({ 
          privacy_mode: tempPrivacyMode, 
          allowed_emails: tempAllowedEmails, 
          password: passwordEnabled ? (tempPassword || null) : null 
      }).eq('id', trackId);
      
      setShareModalVisible(false);
      setShareSuccessVisible(true);
      fetchPastJourneys();
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 800 }}>
            {/* Header */}
            <View className="mb-6 flex-row items-center justify-between">
              <View>
                <Text className="text-3xl font-bold text-gray-900 dark:text-white">Family Locator</Text>
                <View className="flex-row items-center gap-2">
                    <Text className="text-gray-500 dark:text-gray-400">{isTracking ? '🟢 Location Live' : 'Ready to check-in'}</Text>
                    {isTracking && viewerCount > 0 && (
                        <View className="bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                            <Ionicons name="eye-outline" size={12} color="#2563eb" />
                            <Text className="text-[10px] font-bold text-blue-600 dark:text-blue-300">{viewerCount} watching</Text>
                        </View>
                    )}
                </View>
              </View>
              <View className="flex-row gap-2 items-center">
                <TouchableOpacity onPress={() => setShowZoneModal(true)} className="mr-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                    <Ionicons name="shield-outline" size={24} color="#2563eb" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/notifications')} className="mr-2 relative">
                    <Ionicons name="notifications-outline" size={24} color={colorScheme === 'dark' ? 'white' : 'black'} />
                    {unreadCount > 0 && (
                        <View className="absolute -top-1 -right-1 bg-red-500 w-4 h-4 rounded-full justify-center items-center z-10"><Text className="text-white text-[10px] font-bold">{unreadCount}</Text></View>
                    )}
                </TouchableOpacity>
                {isTracking && (
                    <View className="flex-row gap-2">
                        <Button variant="outline" size="sm" onPress={() => setShowQR(true)} className="px-2">
                            <Ionicons name="qr-code-outline" size={18} color={colorScheme === 'dark' ? 'white' : 'black'} />
                        </Button>
                        <Button variant={copied ? "secondary" : "outline"} size="sm" onPress={() => setShareModalVisible(true)}>
                            <Text className={copied ? "text-green-600" : "text-blue-600 dark:text-blue-400"}>{copied ? 'Copied!' : 'Share'}</Text>
                        </Button>
                    </View>
                )}
                {user && <Button variant="ghost" size="sm" onPress={() => signOut()}><Text className="text-blue-600 dark:text-blue-400">Sign Out</Text></Button>}
              </View>
            </View>

            {/* Permissions Pre-Check Card */}
            {locationPermission !== 'granted' && !isTracking && (
                <Card className="mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6">
                        <View className="flex-row gap-4 items-center mb-4">
                            <View className="bg-blue-100 dark:bg-blue-800 p-3 rounded-full">
                                <Ionicons name="location" size={24} color="#2563eb" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-bold text-gray-900 dark:text-white">GPS Access Needed</Text>
                                <Text className="text-sm text-gray-600 dark:text-gray-400">To keep your family circle safe, FindMyFam needs to see your location.</Text>
                            </View>
                        </View>
                        <Button onPress={requestPermission} variant="default" className="w-full h-12">
                            <Text className="text-white font-bold">Enable Location Services</Text>
                        </Button>
                        <Text className="text-[10px] text-gray-400 text-center mt-3">We only track you when a journey is active.</Text>
                    </CardContent>
                </Card>
            )}

            {/* Tracking Card */}
            <Card className="mb-6 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <View style={{ height: isLargeScreen ? 450 : 256 }} className="bg-gray-100 dark:bg-gray-800">
                    <Map currentPoint={currentPoint} points={points} avatarUrl={useProfileIcon ? user?.user_metadata?.avatar_url : undefined} isSos={isSos} theme={colorScheme as 'light' | 'dark'} fleetMembers={adHocMembers} safeZones={safeZones} />
                    {isTracking && (
                      <View className="absolute bottom-4 left-4 right-4 overflow-hidden rounded-xl bg-white/90 dark:bg-black/80 shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                      <View className="flex-row justify-between items-start">
                          <View className="flex-1">
                              <Text className="text-xs font-semibold uppercase text-gray-400">Duration</Text>
                              <Text className="text-xl font-bold font-monospaced text-black dark:text-white">{formatDuration(duration)}</Text>
                              {timeLeft && <View className="flex-row items-center gap-1 mt-1"><Ionicons name="time-outline" size={10} color="#6b7280" /><Text className="text-[10px] text-gray-500 font-bold uppercase">Expires: {timeLeft}</Text></View>}
                              {shareNote && <View className="flex-row items-center gap-1 mt-1"><Ionicons name="chatbubble-outline" size={10} color="#2563eb" /><Text className="text-[10px] text-blue-600 dark:text-blue-400 font-medium" numberOfLines={1}>{shareNote}</Text></View>}
                          </View>
                          <View className="items-end">
                                  {viewerCount > 0 && <View className="bg-blue-600 px-2 py-0.5 rounded-md flex-row items-center gap-1 mb-1"><Ionicons name="eye" size={10} color="white" /><Text className="text-white text-[9px] font-bold uppercase">{viewerCount} Viewer{viewerCount !== 1 ? 's' : ''}</Text></View>}
                                  <Text className="text-xs font-semibold uppercase text-gray-400">Points</Text>
                                  <Text className="text-xl font-bold text-black dark:text-white">{points.length}</Text>
                              </View>
                          </View>
                          <View className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"><Text className="text-xs text-gray-500" numberOfLines={1}>{address}</Text></View>
                      </View>
                    )}
                </View>

                <CardContent className="pt-6">
                    <View className="flex-row items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-lg mb-4">
                        <View className="flex-row items-center gap-3">
                            {user?.user_metadata?.avatar_url ? <Image source={{ uri: user.user_metadata.avatar_url }} className="w-8 h-8 rounded-full" /> : <View className="w-8 h-8 rounded-full bg-gray-300" />}
                            <Text className="text-gray-700 dark:text-gray-200 font-medium">Use Profile Picture</Text>
                        </View>
                        <Switch 
                            value={useProfileIcon} 
                            onValueChange={async (val) => {
                                setUseProfileIcon(val);
                                if (isTracking && trackId && user) {
                                    await supabase.from('tracks').update({ 
                                        avatar_url: val ? user.user_metadata.avatar_url : null 
                                    }).eq('id', trackId);
                                }
                            }} 
                            trackColor={{ false: '#e2e8f0', true: '#2563eb' }} 
                        />
                    </View>

                    {!isTracking ? (
                        <View className="gap-4">
                            <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                 <Text className="text-xs font-semibold uppercase text-gray-500 mb-1">Your Name / Nickname</Text>
                                 <TextInput value={userNickname} onChangeText={setUserNickname} placeholder="e.g. 'Mom', 'Billy'" placeholderTextColor="#9ca3af" className="bg-white dark:bg-gray-700 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-600" />
                            </View>
                            <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                <Text className="text-xs font-semibold uppercase text-gray-500 mb-2">Share Type</Text>
                                <View className="flex-row gap-2">
                                    {(['live', 'current', 'address'] as const).map((type) => (
                                        <TouchableOpacity key={type} onPress={() => setShareType(type)} className={cn("flex-1 py-2 rounded-md border items-center", shareType === type ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-200")}>
                                            <Text className={cn("text-[10px] font-bold uppercase", shareType === type ? "text-white" : "text-gray-600 dark:text-gray-300")}>{type}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            {shareType === 'live' && (
                                <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                     <Text className="text-xs font-semibold uppercase text-gray-500 mb-2">Sharing Duration</Text>
                                     <View className="flex-row gap-2 mb-2">
                                        {(['20m', '2h', '10h', 'Custom'] as const).map((opt) => (
                                            <TouchableOpacity key={opt} onPress={() => setDurationOption(opt)} className={cn("flex-1 py-2 rounded-md border items-center", durationOption === opt ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-200")}>
                                                <Text className={cn("text-xs font-bold", durationOption === opt ? "text-white" : "text-gray-600 dark:text-gray-300")}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                     </View>
                                     {durationOption === 'Custom' && <View className="flex-row items-center gap-2 mb-2"><TextInput value={customDuration} onChangeText={setCustomDuration} keyboardType="numeric" className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center" /><Text className="text-gray-500 text-xs">minutes</Text></View>}
                                </View>
                            )}
                            <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg"><Text className="text-xs font-semibold uppercase text-gray-500 mb-1">Add a Note (Optional)</Text><TextInput value={shareNote} onChangeText={setShareNote} placeholder="e.g. 'Heading to school!'" placeholderTextColor="#9ca3af" className="bg-white dark:bg-gray-700 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-600" /></View>
                            <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg"><Text className="text-xs font-semibold uppercase text-gray-500 mb-1">Family Circle Code (Optional)</Text><TextInput value={fleetCode} onChangeText={setFleetCode} placeholder="e.g. 'the-smiths'" placeholderTextColor="#9ca3af" className="bg-white dark:bg-gray-700 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-600 autoCapitalize='none'" /></View>
                            <Button onPress={startTracking} className="w-full" disabled={isStarting}><Text className="text-white font-bold">{isStarting ? 'Sharing...' : (shareType === 'live' ? 'Start Live Journey' : `Share ${shareType === 'current' ? 'Location' : 'Address'}`)}</Text></Button>
                        </View>
                    ) : (
                        <View className="gap-4">
                            <View className="bg-blue-50 dark:bg-gray-800 p-3 rounded-lg border border-blue-100 dark:border-gray-700">
                                <View className="flex-row items-center justify-between mb-2">
                                    <View className="flex-row items-center gap-2"><Ionicons name="radio-outline" size={20} color="#2563eb" /><Text className="text-gray-900 dark:text-white font-semibold">Proximity Alert</Text></View>
                                    <Switch value={proximityEnabled} onValueChange={setProximityEnabled} trackColor={{ false: '#e2e8f0', true: '#2563eb' }} />
                                </View>
                                {proximityEnabled && <View className="flex-row items-center gap-2"><Text className="text-gray-600 dark:text-gray-400 text-sm">Alert @</Text><TextInput value={proximityDistance} onChangeText={setProximityDistance} keyboardType="numeric" className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center" /><Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text></View>}
                            </View>
                            <View className="bg-green-50 dark:bg-gray-800 p-3 rounded-lg border border-green-100 dark:border-gray-700">
                                <View className="flex-row items-center justify-between mb-2">
                                    <View className="flex-row items-center gap-2"><Ionicons name="flag-outline" size={20} color="#16a34a" /><Text className="text-gray-900 dark:text-white font-semibold">Arrival Alert</Text></View>
                                    <Switch value={arrivalEnabled} onValueChange={setArrivalEnabled} trackColor={{ false: '#e2e8f0', true: '#16a34a' }} />
                                </View>
                                {arrivalEnabled && <View className="flex-row items-center gap-2"><Text className="text-gray-600 dark:text-gray-400 text-sm">Alert @</Text><TextInput value={arrivalDistance} onChangeText={setArrivalDistance} keyboardType="numeric" className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center" /><Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text></View>}
                            </View>
                            <Button onPress={stopTracking} variant="destructive" className="w-full"><Text className="text-white font-bold">Stop Tracking</Text></Button>
                            <TouchableOpacity onPress={toggleSos} className={cn("w-full py-4 rounded-xl flex-row items-center justify-center gap-2 border-2", isSos ? "bg-white dark:bg-black border-red-600" : "bg-red-600 border-red-600")}><Ionicons name="warning" size={24} color={isSos ? "#dc2626" : "white"} /><Text className={cn("font-black text-lg uppercase", isSos ? "text-red-600" : "text-white")}>{isSos ? 'Cancel SOS Alert' : 'Safety SOS'}</Text></TouchableOpacity>
                        </View>
                    )}
                </CardContent>
            </Card>

            <Text className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Recent Journeys</Text>
            {pastJourneys.map(journey => (
                <Card key={journey.id} className="mb-3 p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                    <View className="flex-row justify-between items-center">
                        <View className="flex-1"><Text className="font-semibold text-gray-800 dark:text-gray-200">{new Date(journey.created_at).toLocaleDateString()}</Text><Text className="text-xs text-gray-500">{new Date(journey.created_at).toLocaleTimeString()}</Text>{journey.note && <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic" numberOfLines={1}>"{journey.note}"</Text>}</View>
                        <View className={`px-2 py-1 rounded-full ${journey.is_active ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}><Text className={`text-xs font-medium ${journey.is_active ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}`}>{journey.is_active ? 'Active' : 'Completed'}</Text></View>
                    </View>
                </Card>
            ))}
        </View>
      </ScrollView>

      {/* Safe Zones Modal */}
      <Modal visible={showZoneModal} transparent={true} animationType="slide" onRequestClose={() => setShowZoneModal(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
            <View className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-xl w-full max-w-lg">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold text-gray-900 dark:text-white">Safe Zones</Text>
                    <TouchableOpacity onPress={() => setShowZoneModal(false)}><Ionicons name="close" size={24} color={colorScheme === 'dark' ? 'white' : 'black'} /></TouchableOpacity>
                </View>
                <View className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl mb-6">
                    <Text className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2">Create New Zone</Text>
                    <TextInput value={newZoneName} onChangeText={setNewZoneName} placeholder="Zone Name (e.g. Home)" placeholderTextColor="#9ca3af" className="bg-white dark:bg-gray-800 dark:text-white p-3 rounded-xl border border-blue-100 dark:border-blue-900 mb-3" />
                    <View className="flex-row items-center gap-2 mb-4">
                        <Text className="text-xs text-gray-500">Radius:</Text>
                        <TextInput value={newZoneRadius} onChangeText={setNewZoneRadius} keyboardType="numeric" className="bg-white dark:bg-gray-800 dark:text-white p-2 rounded-lg border border-blue-100 w-20 text-center" />
                        <Text className="text-xs text-gray-500">meters</Text>
                    </View>
                    <Button disabled={isAddingZone || !newZoneName} onPress={addSafeZone} className="h-12"><Text className="text-white font-bold">{isAddingZone ? 'Creating...' : 'Set at Current Location'}</Text></Button>
                </View>
                <Text className="text-xs font-bold text-gray-400 uppercase mb-3">Your Saved Zones</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                    {safeZones.map(zone => (
                        <View key={zone.id} className="flex-row items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-2">
                            <View>
                                <Text className="font-bold text-gray-900 dark:text-white">{zone.name}</Text>
                                <Text className="text-[10px] text-gray-500">{zone.radius_meters}m radius</Text>
                            </View>
                            <TouchableOpacity onPress={() => deleteSafeZone(zone.id)}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </View>
      </Modal>

      <Modal visible={shareModalVisible} transparent={true} animationType="fade" onRequestClose={() => setShareModalVisible(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
            <View className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-xl w-full max-w-2xl mx-auto">
                <View className="flex-row justify-between items-center mb-6"><Text className="text-xl font-bold text-gray-900 dark:text-white">Share Settings</Text><TouchableOpacity onPress={() => setShareModalVisible(false)}><Ionicons name="close" size={24} color={colorScheme === 'dark' ? 'white' : 'black'} /></TouchableOpacity></View>
                <View className="mb-6"><Text className="text-sm font-bold text-gray-500 uppercase mb-3 text-[10px]">Privacy Mode</Text><View className="flex-row gap-2"><TouchableOpacity onPress={() => setTempPrivacyMode('link')} className={cn("flex-1 p-4 rounded-xl border items-center", tempPrivacyMode === 'link' ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700")}><Ionicons name="link-outline" size={24} color={tempPrivacyMode === 'link' ? '#2563eb' : '#6b7280'} /><Text className={cn("mt-2 font-bold", tempPrivacyMode === 'link' ? "text-blue-600" : "text-gray-500")}>Anyone with Link</Text></TouchableOpacity><TouchableOpacity onPress={() => setTempPrivacyMode('private')} className={cn("flex-1 p-4 rounded-xl border items-center", tempPrivacyMode === 'private' ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700")}><Ionicons name="mail-outline" size={24} color={tempPrivacyMode === 'private' ? '#2563eb' : '#6b7280'} /><Text className={cn("mt-2 font-bold", tempPrivacyMode === 'private' ? "text-blue-600" : "text-gray-500")}>Specific Emails</Text></TouchableOpacity></View></View>
                {tempPrivacyMode === 'private' && (
                    <View className="mb-6"><Text className="text-sm font-bold text-gray-500 uppercase mb-3 text-[10px]">Allowed Emails</Text><View className="flex-row gap-2 mb-3"><TextInput value={newEmailInput} onChangeText={setNewEmailInput} placeholder="friend@example.com" placeholderTextColor="#9ca3af" className="flex-1 bg-gray-50 dark:bg-gray-800 dark:text-white p-3 rounded-xl border border-gray-200 dark:border-gray-700" keyboardType="email-address" autoCapitalize="none" /><Button onPress={() => { if (newEmailInput) { setTempAllowedEmails([...tempAllowedEmails, newEmailInput.toLowerCase()]); setNewEmailInput(''); } }} variant="secondary" className="px-4"><Text className="text-blue-600 font-bold">Add</Text></Button></View><View className="flex-row flex-wrap gap-2">{tempAllowedEmails.map(email => (<View key={email} className="flex-row items-center bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-full"><Text className="text-blue-700 dark:text-blue-200 text-xs">{email}</Text><TouchableOpacity onPress={() => setTempAllowedEmails(tempAllowedEmails.filter(e => e !== email))} className="ml-2"><Ionicons name="close-circle" size={16} color="#2563eb" /></TouchableOpacity></View>))}</View></View>
                )}
                <View className="mb-8"><View className="flex-row items-center justify-between mb-3"><View className="flex-row items-center gap-2"><Ionicons name="lock-closed-outline" size={18} color="#6b7280" /><Text className="text-sm font-bold text-gray-500 uppercase text-[10px]">Password Protection</Text></View><Switch value={passwordEnabled} onValueChange={setPasswordEnabled} trackColor={{ false: '#e2e8f0', true: '#2563eb' }} /></View>{passwordEnabled && (<View className="flex-row items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700"><TextInput value={tempPassword} onChangeText={setTempPassword} placeholder="Set a password" placeholderTextColor="#9ca3af" className="flex-1 dark:text-white" secureTextEntry /></View>)}</View>
                <Button onPress={confirmShare} className="w-full h-14"><Text className="text-white font-bold text-lg">Confirm & Share Link</Text></Button>
            </View>
        </View>
      </Modal>

      <Modal visible={shareSuccessVisible} transparent={true} animationType="fade" onRequestClose={() => setShareSuccessVisible(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
            <View className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-xl w-full max-w-lg mx-auto">
                <View className="flex-row justify-between items-center mb-6"><View className="flex-row items-center gap-2"><View className="bg-green-100 dark:bg-green-900/30 p-1.5 rounded-full"><Ionicons name="checkmark-circle" size={20} color="#16a34a" /></View><Text className="text-xl font-bold text-gray-900 dark:text-white">Share Ready!</Text></View><TouchableOpacity onPress={() => setShareSuccessVisible(false)}><Ionicons name="close" size={24} color={colorScheme === 'dark' ? 'white' : 'black'} /></TouchableOpacity></View>
                <View className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl mb-6 border border-gray-100 dark:border-gray-700">
                    <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Location Preview ({shareType})</Text>
                    <Text className="text-gray-900 dark:text-white font-medium mb-1" numberOfLines={2}>{shareType === 'address' ? address : `GPS: ${currentPoint?.lat.toFixed(6)}, ${currentPoint?.lng.toFixed(6)}`}</Text>
                    <Text className="text-gray-500 dark:text-gray-400 text-[10px]">{shareType === 'live' ? 'Updating in real-time' : 'Fixed point shared'}</Text>
                </View>
                <View className="items-center mb-6"><View className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm"><QRCode value={`${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/track/${trackId}`} size={160} color="black" backgroundColor="white" /></View><Text className="text-[10px] text-gray-400 mt-2">Scan to follow instantly</Text></View>
                <View className="gap-3"><View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex-row items-center"><Text className="flex-1 text-gray-500 dark:text-gray-400 text-xs" numberOfLines={1}>{`${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/track/${trackId}`}</Text><TouchableOpacity onPress={() => confirmShare()} className="ml-2 bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-lg"><Text className="text-blue-600 dark:text-blue-300 text-[10px] font-bold uppercase">{copied ? 'Copied' : 'Copy'}</Text></TouchableOpacity></View><Button onPress={() => setShareSuccessVisible(false)} className="w-full h-12"><Text className="text-white font-bold">Done</Text></Button></View>
            </View>
        </View>
      </Modal>

      <Modal visible={showQR} transparent={true} animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View className="flex-1 justify-center items-center bg-black/50 p-6">
            <View className="bg-white dark:bg-gray-900 p-8 rounded-3xl items-center shadow-xl w-full max-w-sm">
                <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Scan to Follow</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center mb-6 text-sm">Show this code to anyone you want to share your live journey with.</Text>
                <View className="bg-white p-4 rounded-2xl mb-6 shadow-sm border border-gray-100"><QRCode value={trackId ? `${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/track/${trackId}` : 'https://gps-demo.vercel.app'} size={200} color="black" backgroundColor="white" /></View>
                <Button onPress={() => setShowQR(false)} className="w-full"><Text className="text-white font-bold">Done</Text></Button>
            </View>
        </View>
            </Modal>
      
            {/* Onboarding Walkthrough */}
            <Modal visible={showOnboarding} transparent animationType="slide">
                <View className="flex-1 bg-white dark:bg-black p-8 justify-center items-center">
                    <View style={{ width: '100%', maxWidth: 400 }} className="items-center">
                        
                        {/* Progress Dots */}
                        <View className="flex-row gap-2 mb-12">
                            {[0, 1, 2].map(i => (
                                <View key={i} className={`h-2 rounded-full ${onboardingStep === i ? 'w-8 bg-blue-600' : 'w-2 bg-gray-200 dark:bg-gray-800'}`} />
                            ))}
                        </View>
      
                        {onboardingStep === 0 && (
                            <View className="items-center">
                                <View className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-full mb-8">
                                    <Ionicons name="location" size={64} color="#2563eb" />
                                </View>
                                <Text className="text-3xl font-black text-center text-gray-900 dark:text-white mb-4">Live Check-in</Text>
                                <Text className="text-lg text-center text-gray-500 dark:text-gray-400 leading-relaxed">
                                    Share your real-time journey with family. They'll see your path update as you move.
                                </Text>
                            </View>
                        )}
      
                        {onboardingStep === 1 && (
                            <View className="items-center">
                                <View className="bg-green-100 dark:bg-green-900/30 p-6 rounded-full mb-8">
                                    <Ionicons name="shield-checkmark" size={64} color="#16a34a" />
                                </View>
                                <Text className="text-3xl font-black text-center text-gray-900 dark:text-white mb-4">Safe Zones</Text>
                                <Text className="text-lg text-center text-gray-500 dark:text-gray-400 leading-relaxed">
                                    Set up zones like "Home" or "School" to get automatic alerts when your family arrives.
                                </Text>
                            </View>
                        )}
      
                        {onboardingStep === 2 && (
                            <View className="items-center">
                                <View className="bg-red-100 dark:bg-red-900/30 p-6 rounded-full mb-8">
                                    <Ionicons name="warning" size={64} color="#dc2626" />
                                </View>
                                <Text className="text-3xl font-black text-center text-gray-900 dark:text-white mb-4">Safety SOS</Text>
                                <Text className="text-lg text-center text-gray-500 dark:text-gray-400 leading-relaxed">
                                    One-tap emergency alerts notify your entire Family Circle instantly if you need help.
                                </Text>
                            </View>
                        )}
      
                        <View className="w-full mt-12 gap-4">
                            {onboardingStep < 2 ? (
                                <Button onPress={() => setOnboardingStep(s => s + 1)} className="w-full h-14">
                                    <Text className="text-white font-bold text-lg">Continue</Text>
                                </Button>
                            ) : (
                                <Button onPress={async () => {
                                    await storage.setItem('has_seen_onboarding', 'true');
                                    setShowOnboarding(false);
                                }} className="w-full h-14">
                                    <Text className="text-white font-bold text-lg">Get Started</Text>
                                </Button>
                            )}
                            
                            {onboardingStep < 2 && (
                                <TouchableOpacity onPress={() => setShowOnboarding(false)} className="items-center">
                                    <Text className="text-gray-400 font-medium">Skip</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
          </View>
        );
      }
      