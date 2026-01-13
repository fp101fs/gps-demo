import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, Platform, Switch, TextInput } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { Button } from '@/components/ui/Button';
import { useUser, useOAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { useColorScheme } from 'nativewind';
import { Notifications } from '@/lib/notifications';
import { getDistanceFromLatLonInM } from '@/lib/utils';
import { Ionicons } from '@expo/vector-icons';

export default function SharedTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSignedIn } = useUser();
  const { colorScheme } = useColorScheme();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  
  const [points, setPoints] = useState<Point[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  
  // Share Back State
  const [isSharing, setIsSharing] = useState(false);
  const [myTrackId, setMyTrackId] = useState<string | null>(null);
  const [adHocMembers, setAdHocMembers] = useState<{ id: string; lat: number; lng: number; avatarUrl?: string }[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{lat: number, lng: number} | null>(null);

  // Proximity State
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
        redirectUrl: Linking.createURL(`/track/${id}`, { scheme: 'gps-demo' }),
      });

      if (createdSessionId && setActive) {
        setActive({ session: createdSessionId });
      }
    } catch (err) {
      console.error("OAuth error", err);
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchInitialData = async () => {
      try {
        // Fetch track status and avatar
        const { data: track, error: trackError } = await supabase
          .from('tracks')
          .select('is_active, avatar_url, note, expires_at, user_id')
          .eq('id', id)
          .single();

        if (trackError) throw trackError;
        setIsActive(track.is_active);
        if (track.avatar_url) setAvatarUrl(track.avatar_url);
        setNote(track.note);
        setExpiresAt(track.expires_at);

        // Notify Host that someone is viewing
        if (track.is_active) {
            Notifications.send(
                track.user_id,
                'New Viewer!',
                'Someone is currently viewing your live location.',
                'info'
            );
        }

        // Fetch existing points
        const { data: pointsData, error: pointsError } = await supabase
          .from('points')
          .select('lat, lng, timestamp')
          .eq('track_id', id)
          .order('timestamp', { ascending: true });

        if (pointsError) throw pointsError;

        const formattedPoints = pointsData.map(p => ({
          lat: p.lat,
          lng: p.lng,
          timestamp: new Date(p.timestamp).getTime() / 1000
        }));

        setPoints(formattedPoints);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // Subscribe to new points (User A's path)
    const channel = supabase
      .channel(`track_updates_${id}`, {
          config: {
              presence: {
                  key: user?.id || 'guest',
              },
          },
      });

    channel
      .on(
        'postgres_changes',
// ...
      )
      .on(
        'postgres_changes',
// ...
      )
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
              await channel.track({
                  online_at: new Date().toISOString(),
              });
          }
      });

    return () => {
      supabase.removeChannel(channel);
    };


  // Timer for Expiration
  useEffect(() => {
      if (!expiresAt || !isActive) return;

      const updateTimer = () => {
          const diff = new Date(expiresAt).getTime() - Date.now();
          if (diff <= 0) {
              setTimeLeft('Expired');
              setIsActive(false);
              return;
          }
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${mins}m ${secs}s`);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, [expiresAt, isActive]);

  // Subscribe to Ad-hoc Fleet (Other viewers sharing back)
  useEffect(() => {
    if (!id) return;

    // Fetch initial active members sharing back
    const fetchAdHoc = async () => {
        const { data } = await supabase
            .from('tracks')
            .select('id, lat, lng, avatar_url')
            .eq('party_code', id)
            .eq('is_active', true);
        
        if (data) {
            setAdHocMembers(data.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url })));
        }
    };
    fetchAdHoc();

    const channel = supabase
      .channel(`adhoc_fleet_view_${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracks',
          filter: `party_code=eq.${id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) {
                 setAdHocMembers(prev => prev.filter(p => p.id !== m.id));
                 return;
             }
             
             setAdHocMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) {
                     return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url } : p);
                 } else {
                     return [...prev, {
                        id: m.id,
                        lat: m.lat,
                        lng: m.lng,
                        avatarUrl: m.avatar_url
                     }];
                 }
             });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Proximity Alert Logic for User B (Viewer)
  useEffect(() => {
    if (!isSharing || !proximityEnabled || !currentLoc || points.length === 0) return;

    const threshold = parseInt(proximityDistance, 10);
    if (isNaN(threshold)) return;

    const hostPoint = points[points.length - 1];
    const dist = getDistanceFromLatLonInM(currentLoc.lat, currentLoc.lng, hostPoint.lat, hostPoint.lng);

    // Arrival Check
    const arrThreshold = parseInt(arrivalDistance, 10);
    if (!isNaN(arrThreshold) && arrivalEnabled) {
        if (dist <= arrThreshold) {
            if (!arrivedHostRef.current) {
                arrivedHostRef.current = true;
                Notifications.send(
                    user!.id,
                    'Arrival Alert!',
                    `You have arrived (within ${Math.round(dist)}m).`,
                    'success'
                );
            }
        } else if (dist > arrThreshold + 50) {
            arrivedHostRef.current = false;
        }
    }

    // Proximity Check
    if (dist <= threshold) {
        if (!alertedHostRef.current) {
            alertedHostRef.current = true;
            Notifications.send(
                user!.id,
                'Proximity Alert!',
                `You are close to the host (${Math.round(dist)}m away).`,
                'alert'
            );
        }
    } else if (dist > threshold + 100) {
        alertedHostRef.current = false;
    }
  }, [currentLoc, points, proximityEnabled, proximityDistance, isSharing]);

  const startSharingBack = async () => {
    if (!isSignedIn || !user) {
        onSignInPress();
        return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Allow location access to share back.');
      return;
    }

    // Create Track
    const { data: track, error } = await supabase
        .from('tracks')
        .insert([{ 
            is_active: true, 
            user_id: user.id,
            avatar_url: user.imageUrl,
            party_code: id, // Joining User A's party
            proximity_enabled: proximityEnabled,
            proximity_meters: parseInt(proximityDistance) || 500,
            arrival_enabled: arrivalEnabled,
            arrival_meters: parseInt(arrivalDistance) || 50
        }])
        .select()
        .single();

    if (error || !track) {
      Alert.alert('Error', 'Could not start sharing.');
      return;
    }

    setMyTrackId(track.id);
    setIsSharing(true);

    // Watch
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      async (loc) => {
        setCurrentLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        // Update Track
        await supabase.from('tracks').update({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude
        }).eq('id', track.id);
      }
    );
  };

  const stopSharingBack = async () => {
    if (locationSubscription.current) {
        try {
            locationSubscription.current.remove();
        } catch(e) {}
        locationSubscription.current = null;
    }
    
    if (myTrackId) {
        await supabase.from('tracks').update({ is_active: false }).eq('id', myTrackId);
    }
    
    setIsSharing(false);
    setMyTrackId(null);
    setCurrentLoc(null);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-4 bg-gray-50 dark:bg-black">
        <Text className="text-red-500 text-center">{error}</Text>
      </View>
    );
  }

  const currentPoint = points[points.length - 1];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Stack.Screen options={{ title: isActive ? '🔴 Live Journey' : 'Past Journey' }} />
      
      <View className="flex-1">
        <Map 
            currentPoint={currentPoint} 
            points={points} 
            avatarUrl={avatarUrl} 
            theme={colorScheme as 'light' | 'dark'}
            fleetMembers={adHocMembers}
        />

        {/* Note Overlay */}
        {(note || timeLeft) && (
            <View className="absolute top-4 left-4 right-4 z-10">
                <View className="bg-white/90 dark:bg-black/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    {note && (
                        <View className="flex-row items-center gap-2 mb-1">
                            <Ionicons name="chatbubble-outline" size={16} color="#2563eb" />
                            <Text className="text-gray-900 dark:text-white font-medium flex-1">{note}</Text>
                        </View>
                    )}
                    {timeLeft && (
                        <View className="flex-row items-center gap-2">
                            <Ionicons name="time-outline" size={16} color="#6b7280" />
                            <Text className="text-gray-500 dark:text-gray-400 text-xs">
                                {timeLeft === 'Expired' ? 'Sharing has ended' : `Expires in: ${timeLeft}`}
                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                        
                                                {/* Arrival Alert Settings */}
                                                <View className="bg-green-50 dark:bg-gray-800 p-3 rounded-lg border border-green-100 dark:border-gray-700">
                                                    <View className="flex-row items-center justify-between mb-2">
                                                        <View className="flex-row items-center gap-2">
                                                            <Ionicons name="flag-outline" size={20} color="#16a34a" />
                                                            <Text className="text-gray-900 dark:text-white font-semibold">Arrival Alert</Text>
                                                        </View>
                                                        <Switch 
                                                            value={arrivalEnabled} 
                                                            onValueChange={setArrivalEnabled}
                                                            trackColor={{ false: '#e2e8f0', true: '#16a34a' }}
                                                        />
                                                    </View>
                                                    {arrivalEnabled && (
                                                        <View className="flex-row items-center gap-2">
                                                            <Text className="text-gray-600 dark:text-gray-400 text-sm">Alert when closer than:</Text>
                                                            <TextInput 
                                                                value={arrivalDistance}
                                                                onChangeText={setArrivalDistance}
                                                                keyboardType="numeric"
                                                                className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center"
                                                            />
                                                            <Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text>
                                                        </View>
                                                    )}
                                                </View>
                                             </View>
                                        )}
                        
      </View>

      <View className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
          <View className="flex-row justify-between items-center mb-2">
            <View>
                <Text className="text-xs font-semibold uppercase text-gray-400">Status</Text>
                <Text className={`text-lg font-bold ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {isActive ? 'Tracking Live' : 'Completed'}
                </Text>
            </View>
            <View className="items-end">
                <Text className="text-xs font-semibold uppercase text-gray-400">Points Captured</Text>
                <Text className="text-lg font-bold text-black dark:text-white">{points.length}</Text>
            </View>
          </View>
          
          <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 gap-4">
             {isSharing && (
                <View className="bg-blue-50 dark:bg-gray-800 p-3 rounded-lg border border-blue-100 dark:border-gray-700">
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                            <Ionicons name="radio-outline" size={20} color="#2563eb" />
                            <Text className="text-gray-900 dark:text-white font-semibold">Proximity Alert</Text>
                        </View>
                        <Switch 
                            value={proximityEnabled} 
                            onValueChange={setProximityEnabled}
                            trackColor={{ false: '#e2e8f0', true: '#2563eb' }}
                        />
                    </View>
                    {proximityEnabled && (
                        <View className="flex-row items-center gap-2">
                            <Text className="text-gray-600 dark:text-gray-400 text-sm">Alert when closer than:</Text>
                            <TextInput 
                                value={proximityDistance}
                                onChangeText={setProximityDistance}
                                keyboardType="numeric"
                                className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center"
                            />
                            <Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text>
                        </View>
                    )}
                </View>
             )}

             {!isSharing ? (
                 <Button onPress={startSharingBack} variant="secondary" className="w-full">
                     <Text className="text-blue-600 font-bold">{isSignedIn ? 'Share My Location Back' : 'Sign in to Share Back'}</Text>
                 </Button>
             ) : (
                 <Button onPress={stopSharingBack} variant="destructive" className="w-full">
                     <Text className="text-white font-bold">Stop Sharing My Location</Text>
                 </Button>
             )}
          </View>
      </View>
    </View>
  );
}
