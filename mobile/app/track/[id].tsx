import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { Button } from '@/components/ui/Button';
import { useUser } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import { useColorScheme } from 'nativewind';

export default function SharedTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSignedIn } = useUser();
  const { colorScheme } = useColorScheme();
  
  const [points, setPoints] = useState<Point[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  
  // Share Back State
  const [isSharing, setIsSharing] = useState(false);
  const [myTrackId, setMyTrackId] = useState<string | null>(null);
  const [adHocMembers, setAdHocMembers] = useState<{ id: string; lat: number; lng: number; avatarUrl?: string }[]>([]);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchInitialData = async () => {
      try {
        // Fetch track status and avatar
        const { data: track, error: trackError } = await supabase
          .from('tracks')
          .select('is_active, avatar_url')
          .eq('id', id)
          .single();

        if (trackError) throw trackError;
        setIsActive(track.is_active);
        if (track.avatar_url) setAvatarUrl(track.avatar_url);

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
      .channel(`track_updates_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'points',
          filter: `track_id=eq.${id}`,
        },
        (payload) => {
          const newPoint = payload.new;
          setPoints((prev) => [
            ...prev,
            {
              lat: newPoint.lat,
              lng: newPoint.lng,
              timestamp: new Date(newPoint.timestamp).getTime() / 1000,
            },
          ]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tracks',
          filter: `id=eq.${id}`,
        },
        (payload) => {
           setIsActive(payload.new.is_active);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

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

  const startSharingBack = async () => {
    if (!isSignedIn || !user) {
        Alert.alert('Sign In Required', 'You must be signed in to share your location.');
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
            party_code: id // Joining User A's party
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
          
          <View className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
             {!isSharing ? (
                 <Button onPress={startSharingBack} variant="secondary" className="w-full">
                     <Text className="text-blue-600 font-bold">Share My Location Back</Text>
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