import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

interface Fleet {
  party_code: string;
  created_at: string;
  member_count?: number;
}

export default function FleetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colorScheme } = useColorScheme();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchFleets = async () => {
      try {
        // Fetch all tracks by this user to find unique party codes they've participated in
        // Note: Ideally we'd have a 'fleets' or 'memberships' table, but deriving from tracks works for now
        const { data, error } = await supabase
          .from('tracks')
          .select('party_code, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Dedup by party_code
        const uniqueFleets = new Map<string, Fleet>();
        data?.forEach((track) => {
          if (track.party_code && !uniqueFleets.has(track.party_code)) {
            uniqueFleets.set(track.party_code, {
              party_code: track.party_code,
              created_at: track.created_at
            });
          }
        });

        setFleets(Array.from(uniqueFleets.values()));
      } catch (e) {
        console.error('Error fetching fleets:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchFleets();
  }, [user]);

  const handleFleetPress = (code: string) => {
    // Navigate to Family tab (index) and load this fleet code
    router.push(`/(tabs)/index?code=${code}`);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black" style={{ paddingTop: insets.top }}>
      <View className="p-4 border-b border-gray-200 dark:border-gray-800">
        <Text className="text-3xl font-bold text-gray-900 dark:text-white">Your Fleets</Text>
        <Text className="text-gray-500 dark:text-gray-400">Join a circle you've been part of before.</Text>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : !user ? (
        <View className="flex-1 justify-center items-center p-6">
            <Ionicons name="log-in-outline" size={64} color="#9ca3af" />
            <Text className="text-gray-500 mt-4 text-center text-lg">Sign in to view your fleets.</Text>
            <TouchableOpacity onPress={() => router.replace('/')} className="mt-6 bg-blue-600 px-8 py-3 rounded-full">
                <Text className="text-white font-bold">Sign In</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={fleets}
          keyExtractor={(item) => item.party_code}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={() => (
            <View className="items-center mt-10">
              <Ionicons name="map-outline" size={64} color="#9ca3af" />
              <Text className="text-gray-500 mt-4 text-center">You haven't joined any fleets yet.</Text>
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/home')}
                className="mt-6 bg-blue-600 px-6 py-3 rounded-xl"
              >
                <Text className="text-white font-bold">Create New Fleet</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity 
              onPress={() => handleFleetPress(item.party_code)}
              className="bg-white dark:bg-gray-900 p-4 mb-3 rounded-2xl border border-gray-200 dark:border-gray-800 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-row items-center gap-4">
                <View className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                  <Ionicons name="people" size={24} color="#2563eb" />
                </View>
                <View>
                  <Text className="font-bold text-lg text-gray-900 dark:text-white uppercase tracking-wider">
                    {item.party_code}
                  </Text>
                  <Text className="text-gray-500 text-xs">
                    Last active: {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
