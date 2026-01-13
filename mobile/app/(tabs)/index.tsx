import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform, Share, Switch, Image, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SignedIn, SignedOut, useUser, useAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { Notifications } from '@/lib/notifications';
import { cn, getDistanceFromLatLonInM } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';

// Types
interface Journey {
  id: string;
  created_at: string;
  is_active: boolean;
  avatar_url?: string;
  proximity_enabled?: boolean;
  proximity_meters?: number;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { colorScheme } = useColorScheme();
  
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
  const [adHocMembers, setAdHocMembers] = useState<{ id: string; lat: number; lng: number; avatarUrl?: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  
  // Share Settings State
  const [durationOption, setDurationOption] = useState<'20m' | '2h' | '10h' | 'Custom'>('20m');
  const [customDuration, setCustomDuration] = useState('60'); // minutes
  const [shareNote, setShareNote] = useState('');

  // Proximity State
  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityDistance, setProximityDistance] = useState('500');
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [arrivalDistance, setArrivalDistance] = useState('50');
  const alertedMembersRef = useRef<Set<string>>(new Set());
  const arrivedMembersRef = useRef<Set<string>>(new Set());

  // Refs
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchPastJourneys();
      fetchUnreadCount();
      
      // Demo: Send a welcome notification if none exist
      // In a real app, this would be done by a backend trigger
      const checkAndWelcome = async () => {
          const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
          if (count === 0) {
              await Notifications.send(user.id, 'Welcome to GPS Demo!', 'Start tracking your journey or join a fleet to get started.', 'success');
          }
      };
      checkAndWelcome();
    }
  }, [user]);

  // Proximity Check Logic
  useEffect(() => {
      if (!isTracking || !proximityEnabled || !currentPoint || adHocMembers.length === 0) return;

      const threshold = parseInt(proximityDistance, 10);
      if (isNaN(threshold)) return;

      adHocMembers.forEach(async (member) => {
          const dist = getDistanceFromLatLonInM(currentPoint.lat, currentPoint.lng, member.lat, member.lng);
          
          // Arrival Check
          const arrThreshold = parseInt(arrivalDistance, 10);
          if (!isNaN(arrThreshold) && arrivalEnabled) {
              if (dist <= arrThreshold) {
                  if (!arrivedMembersRef.current.has(member.id)) {
                      arrivedMembersRef.current.add(member.id);
                      await Notifications.send(
                          user!.id, 
                          'Arrival Alert!', 
                          `A member has arrived (within ${Math.round(dist)}m).`, 
                          'success'
                      );
                  }
              } else if (dist > arrThreshold + 50) {
                  arrivedMembersRef.current.delete(member.id);
              }
          }

          // Proximity Check
          if (dist <= threshold) {
              if (!alertedMembersRef.current.has(member.id)) {
                  // Trigger Alert
                  alertedMembersRef.current.add(member.id);
                  await Notifications.send(
                      user!.id, 
                      'Proximity Alert!', 
                      `A fleet member is nearby (${Math.round(dist)}m away).`, 
                      'alert'
                  );
              }
          } else {
              // Reset if they move away so we can alert again if they come back
              if (dist > threshold + 100) { // Add buffer to prevent flapping
                  alertedMembersRef.current.delete(member.id);
              }
          }
      });
  }, [currentPoint, adHocMembers, proximityEnabled, proximityDistance]);

  const fetchUnreadCount = async () => {
      if (!user) return;
      
      const getCount = async () => {
          const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
          setUnreadCount(count || 0);
      };

      getCount();
      
      // Subscribe to all changes to keep count in sync (new msg, marked read, etc)
      const channel = supabase.channel('unread_count')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, 
            () => {
                // Simple strategy: refetch accurate count on any change
                getCount();
            }
        )
        .subscribe();
        
      return () => supabase.removeChannel(channel);
  };

  // Subscribe to Ad-hoc Fleet (people sharing back to my trackId)
  useEffect(() => {
    if (!trackId) {
        setAdHocMembers([]);
        setViewerCount(0);
        return;
    }

    const channel = supabase
      .channel(`track_updates_${trackId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracks',
          filter: `party_code=eq.${trackId}`,
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
      .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const count = Object.keys(state).length;
          setViewerCount(Math.max(0, count - 1)); // -1 for the host
      })
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
              await channel.track({
                  online_at: new Date().toISOString(),
                  role: 'host'
              });
          }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackId]);

  const fetchPastJourneys = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) setPastJourneys(data);
  };

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Allow location access to track your journey.');
      return;
    }

    if (!user) {
      Alert.alert('Sign In', 'Please sign in to track.');
      return;
    }

    // Calculate expiration
    let minutes = 20;
    if (durationOption === '2h') minutes = 120;
    else if (durationOption === '10h') minutes = 600;
    else if (durationOption === 'Custom') minutes = parseInt(customDuration) || 20;

    const expiresAt = new Date(Date.now() + minutes * 60000).toISOString();

    // Create Track in DB
    const avatarUrl = useProfileIcon ? user.imageUrl : null;
    const { data: track, error } = await supabase
        .from('tracks')
        .insert([{ 
            is_active: true, 
            user_id: user.id,
            avatar_url: avatarUrl,
            party_code: fleetCode || null,
            proximity_enabled: proximityEnabled,
            proximity_meters: parseInt(proximityDistance) || 500,
            arrival_enabled: arrivalEnabled,
            arrival_meters: parseInt(arrivalDistance) || 50,
            expires_at: expiresAt,
            note: shareNote || null
        }])
        .select()
        .single();

    if (error || !track) {
      Alert.alert('Error', 'Could not start tracking session.');
      return;
    }

    setTrackId(track.id);
    setIsTracking(true);
    startTimeRef.current = Date.now();
    setPoints([]);
    
    // Start Timer
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    // Start Location Updates
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      async (loc) => {
        const newPoint = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          timestamp: loc.timestamp / 1000,
        };
        
        setCurrentPoint(newPoint);
        setPoints(prev => [...prev, newPoint]);
        fetchAddress(newPoint.lat, newPoint.lng);

        // Save to DB (Point)
        await supabase.from('points').insert([{
            track_id: track.id,
            lat: newPoint.lat,
            lng: newPoint.lng,
            timestamp: new Date().toISOString()
        }]);
        
        // Update Track (Latest Position for Fleet)
        await supabase.from('tracks').update({
            lat: newPoint.lat,
            lng: newPoint.lng
        }).eq('id', track.id);
      }
    );
  };

  const stopTracking = async () => {
    if (locationSubscription.current) {
      try {
        locationSubscription.current.remove();
      } catch (e) {
        // This catches the 'LocationEventEmitter.removeSubscription is not a function' 
        // error that occurs in some Expo versions on Web.
        console.log('Location tracking stopped (cleanup error ignored)');
      }
      locationSubscription.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsTracking(false);

    if (trackId) {
      await supabase
        .from('tracks')
        .update({ is_active: false, end_time: new Date().toISOString() })
        .eq('id', trackId);
    }

    Alert.alert('Tracking Stopped', 'Your journey has been saved.');
    fetchPastJourneys();
  };

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      // Use Expo Location reverse geocode if on native, or API on web
      // But Nominatim is fine for demo
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await response.json();
       const addr = data.address;
       const shortAddress = addr 
        ? `${addr.road || ''} ${addr.house_number || ''}, ${addr.city || ''}`.trim().replace(/^,/, '') 
        : data.display_name;
      setAddress(shortAddress || 'Unknown location');
    } catch (e) {
      console.log(e);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  const shareJourney = async () => {
    if (!trackId) return;
    
    // Create a shareable link. 
    // On web, it's easy. On native, we use the scheme.
    const baseUrl = Platform.OS === 'web' 
        ? window.location.origin 
        : Linking.createURL('/');
    
    const shareUrl = `${baseUrl}/track/${trackId}`;
    
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    if (Platform.OS === 'web') {
        // Fallback alert if user missed the button change
        // Alert.alert('Link Copied', 'Share this link with others to view your live journey!');
    } else {
        try {
            await Share.share({
                message: `Follow my live journey: ${shareUrl}`,
                url: shareUrl,
            });
        } catch (error) {
            console.log(error);
        }
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-bold text-gray-900 dark:text-white">GPS Tracker</Text>
            <View className="flex-row items-center gap-2">
                <Text className="text-gray-500 dark:text-gray-400">
                {isTracking ? '🟢 Tracking Active' : 'Ready to start'}
                </Text>
                {isTracking && viewerCount > 0 && (
                    <View className="bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                        <Ionicons name="eye-outline" size={12} color="#2563eb" />
                        <Text className="text-[10px] font-bold text-blue-600 dark:text-blue-300">{viewerCount} watching</Text>
                    </View>
                )}
            </View>
          </View>
          <View className="flex-row gap-2 items-center">
            {/* Notification Bell */}
            <TouchableOpacity onPress={() => router.push('/notifications')} className="mr-2 relative">
                <Ionicons name="notifications-outline" size={24} color={colorScheme === 'dark' ? 'white' : 'black'} />
                {unreadCount > 0 && (
                    <View className="absolute -top-1 -right-1 bg-red-500 w-4 h-4 rounded-full justify-center items-center z-10">
                        <Text className="text-white text-[10px] font-bold">{unreadCount}</Text>
                    </View>
                )}
            </TouchableOpacity>

            {isTracking && (
                <Button variant={copied ? "secondary" : "outline"} size="sm" onPress={shareJourney}>
                    <Text className={copied ? "text-green-600" : "text-blue-600 dark:text-blue-400"}>
                        {copied ? 'Copied!' : 'Share'}
                    </Text>
                </Button>
            )}
            {user && (
                <Button variant="ghost" size="sm" onPress={() => signOut()}>
                    <Text className="text-blue-600 dark:text-blue-400">Sign Out</Text>
                </Button>
            )}
          </View>
        </View>

        {/* Tracking Card */}
        <Card className="mb-6 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            {/* Map Container - Height is fixed */}
            <View className="h-64 bg-gray-100 dark:bg-gray-800">
                <Map 
                    currentPoint={currentPoint} 
                    points={points} 
                    avatarUrl={useProfileIcon ? user?.imageUrl : undefined} 
                    theme={colorScheme as 'light' | 'dark'}
                    fleetMembers={adHocMembers}
                />
                
                {/* Overlay Stats (iOS Style Blur) */}
                {isTracking && (
                  <View className="absolute bottom-4 left-4 right-4 overflow-hidden rounded-xl bg-white/90 dark:bg-black/80 shadow-sm border border-gray-200 dark:border-gray-700 p-3">
                      {viewerCount > 0 && (
                          <View className="absolute -top-2 -right-2 bg-blue-600 px-2 py-1 rounded-lg flex-row items-center gap-1 shadow-sm z-20">
                              <Ionicons name="eye" size={12} color="white" />
                              <Text className="text-white text-[10px] font-bold">{viewerCount} Viewer{viewerCount !== 1 ? 's' : ''}</Text>
                          </View>
                      )}
                      <View className="flex-row justify-between">
                          <View>
                              <Text className="text-xs font-semibold uppercase text-gray-400">Duration</Text>
                              <Text className="text-xl font-bold font-monospaced text-black dark:text-white">{formatDuration(duration)}</Text>
                          </View>
                          <View className="items-end">
                              <Text className="text-xs font-semibold uppercase text-gray-400">Points</Text>
                              <Text className="text-xl font-bold text-black dark:text-white">{points.length}</Text>
                          </View>
                      </View>
                      <View className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <Text className="text-xs text-gray-500" numberOfLines={1}>{address}</Text>
                      </View>
                  </View>
                )}
            </View>

            <CardContent className="pt-6">
                {!isTracking ? (
                    <View className="gap-4">
                        <View className="flex-row items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                            <View className="flex-row items-center gap-3">
                                {user?.imageUrl ? (
                                    <Image source={{ uri: user.imageUrl }} className="w-8 h-8 rounded-full" />
                                ) : (
                                    <View className="w-8 h-8 rounded-full bg-gray-300" />
                                )}
                                <Text className="text-gray-700 dark:text-gray-200 font-medium">Use Profile Picture</Text>
                            </View>
                            <Switch 
                                value={useProfileIcon} 
                                onValueChange={setUseProfileIcon}
                                trackColor={{ false: '#e2e8f0', true: '#2563eb' }}
                            />
                        </View>
                        
                        {/* Expiration Settings */}
                        <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                             <Text className="text-xs font-semibold uppercase text-gray-500 mb-2">Sharing Duration</Text>
                             <View className="flex-row gap-2 mb-2">
                                {(['20m', '2h', '10h', 'Custom'] as const).map((opt) => (
                                    <TouchableOpacity 
                                        key={opt}
                                        onPress={() => setDurationOption(opt)}
                                        className={cn(
                                            "flex-1 py-2 rounded-md border items-center",
                                            durationOption === opt 
                                                ? "bg-blue-600 border-blue-600" 
                                                : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                                        )}
                                    >
                                        <Text className={cn(
                                            "text-xs font-bold",
                                            durationOption === opt ? "text-white" : "text-gray-600 dark:text-gray-300"
                                        )}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                             </View>
                             {durationOption === 'Custom' && (
                                 <View className="flex-row items-center gap-2 mb-2">
                                     <TextInput 
                                        value={customDuration}
                                        onChangeText={setCustomDuration}
                                        keyboardType="numeric"
                                        className="bg-white dark:bg-gray-700 dark:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-600 w-20 text-center"
                                     />
                                     <Text className="text-gray-500 text-xs">minutes</Text>
                                 </View>
                             )}
                        </View>

                        {/* Note Input */}
                        <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                             <Text className="text-xs font-semibold uppercase text-gray-500 mb-1">Add a Note (Optional)</Text>
                             <TextInput 
                                value={shareNote}
                                onChangeText={setShareNote}
                                placeholder="e.g. 'Meeting at the park!'"
                                placeholderTextColor="#9ca3af"
                                className="bg-white dark:bg-gray-700 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-600"
                             />
                        </View>

                        <View className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                             <Text className="text-xs font-semibold uppercase text-gray-500 mb-1">Fleet / Party Code (Optional)</Text>
                             <TextInput 
                                value={fleetCode}
                                onChangeText={setFleetCode}
                                placeholder="e.g. 'bachelor-party'"
                                placeholderTextColor="#9ca3af"
                                className="bg-white dark:bg-gray-700 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-600"
                                autoCapitalize="none"
                             />
                        </View>

                        <Button onPress={startTracking} className="w-full">
                            <Text className="text-white font-bold">Start New Journey</Text>
                        </Button>
                    </View>
                ) : (
                    <View className="gap-4">
                        {/* Proximity Alert Settings */}
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

                        <Button onPress={stopTracking} variant="destructive" className="w-full">
                             <Text className="text-white font-bold">Stop Tracking</Text>
                        </Button>
                    </View>
                )}
            </CardContent>
        </Card>

        {/* History Section */}
        <Text className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Recent Journeys</Text>
        {pastJourneys.map(journey => (
            <Card key={journey.id} className="mb-3 p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <View className="flex-row justify-between items-center">
                    <View>
                        <Text className="font-semibold text-gray-800 dark:text-gray-200">
                            {new Date(journey.created_at).toLocaleDateString()}
                        </Text>
                        <Text className="text-xs text-gray-500">
                            {new Date(journey.created_at).toLocaleTimeString()}
                        </Text>
                    </View>
                    <View className={`px-2 py-1 rounded-full ${journey.is_active ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <Text className={`text-xs font-medium ${journey.is_active ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}`}>
                            {journey.is_active ? 'Active' : 'Completed'}
                        </Text>
                    </View>
                </View>
            </Card>
        ))}

      </ScrollView>
    </View>
  );
}
