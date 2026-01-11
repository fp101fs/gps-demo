import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Map from '@/components/Map';
import type { Point } from '@/components/Map';
import { Card, CardContent } from '@/components/ui/Card';

export default function SharedTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [points, setPoints] = useState<Point[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchInitialData = async () => {
      try {
        // Fetch track status
        const { data: track, error: trackError } = await supabase
          .from('tracks')
          .select('is_active')
          .eq('id', id)
          .single();

        if (trackError) throw trackError;
        setIsActive(track.is_active);

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

    // Subscribe to new points
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-red-500 text-center">{error}</Text>
      </View>
    );
  }

  const currentPoint = points[points.length - 1];

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: isActive ? '🔴 Live Journey' : 'Past Journey' }} />
      
      <View className="flex-1">
        <Map currentPoint={currentPoint} points={points} />
      </View>

      <View className="p-4 bg-white border-t border-gray-200">
          <View className="flex-row justify-between items-center mb-2">
            <View>
                <Text className="text-xs font-semibold uppercase text-gray-400">Status</Text>
                <Text className={`text-lg font-bold ${isActive ? 'text-green-600' : 'text-gray-600'}`}>
                    {isActive ? 'Tracking Live' : 'Completed'}
                </Text>
            </View>
            <View className="items-end">
                <Text className="text-xs font-semibold uppercase text-gray-400">Points Captured</Text>
                <Text className="text-lg font-bold">{points.length}</Text>
            </View>
          </View>
          {isActive && (
              <Text className="text-xs text-gray-500 text-center mt-2 italic">
                  Viewing real-time updates from Device A
              </Text>
          )}
      </View>
    </View>
  );
}
