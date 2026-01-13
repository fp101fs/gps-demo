import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform, Share, Switch, Image, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SignedIn, SignedOut, useUser, useAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { useColorScheme } from 'nativewind';

// Types
interface Journey {
  id: string;
  created_at: string;
  is_active: boolean;
  avatar_url?: string;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
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

  // Refs
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchPastJourneys();
    }
  }, [user]);

  // Subscribe to Ad-hoc Fleet (people sharing back to my trackId)
  useEffect(() => {
    if (!trackId) {
        setAdHocMembers([]);
        return;
    }

    const channel = supabase
      .channel(`adhoc_fleet_${trackId}`)
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
      .subscribe();

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

    // Create Track in DB
    const avatarUrl = useProfileIcon ? user.imageUrl : null;
    const { data: track, error } = await supabase
        .from('tracks')
        .insert([{ 
            is_active: true, 
            user_id: user.id,
            avatar_url: avatarUrl,
            party_code: fleetCode || null
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
            <Text className="text-gray-500 dark:text-gray-400">
               {isTracking ? '🟢 Tracking Active' : 'Ready to start'}
            </Text>
          </View>
          <View className="flex-row gap-2">
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
                    <Button onPress={stopTracking} variant="destructive" className="w-full">
                         <Text className="text-white font-bold">Stop Tracking</Text>
                    </Button>
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
