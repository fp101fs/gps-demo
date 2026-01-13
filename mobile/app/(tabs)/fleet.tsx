import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import Map from '@/components/Map';
import { useColorScheme } from 'nativewind';

interface FleetMember {
  id: string;
  lat: number;
  lng: number;
  avatarUrl?: string;
  user_id: string;
}

export default function FleetScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [fleetCode, setFleetCode] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [members, setMembers] = useState<FleetMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeCode) return;

    // Initial Fetch
    const fetchFleet = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tracks')
        .select('id, lat, lng, avatar_url, user_id')
        .eq('party_code', activeCode)
        .eq('is_active', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setMembers(data.map(m => ({
            id: m.id,
            lat: m.lat,
            lng: m.lng,
            avatarUrl: m.avatar_url,
            user_id: m.user_id
        })));
      }
      setLoading(false);
    };

    fetchFleet();

    // Subscribe to changes
    const channel = supabase
      .channel(`fleet_${activeCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracks',
          filter: `party_code=eq.${activeCode}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) {
                 // Remove if inactive
                 setMembers(prev => prev.filter(p => p.id !== m.id));
                 return;
             }
             
             setMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) {
                     return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url } : p);
                 } else {
                     return [...prev, {
                        id: m.id,
                        lat: m.lat,
                        lng: m.lng,
                        avatarUrl: m.avatar_url,
                        user_id: m.user_id
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
  }, [activeCode]);

  return (
    <View className="flex-1 bg-white dark:bg-black" style={{ paddingTop: insets.top }}>
      {!activeCode ? (
        <View className="flex-1 p-4 justify-center">
             <Text className="text-2xl font-bold mb-2 text-black dark:text-white">Join a Fleet</Text>
             <Text className="text-gray-500 dark:text-gray-400 mb-6">Enter a code to view all active members on the map.</Text>
             
             <TextInput 
                value={fleetCode}
                onChangeText={setFleetCode}
                placeholder="Enter Fleet Code"
                placeholderTextColor="#9ca3af"
                className="bg-gray-100 dark:bg-gray-800 dark:text-white p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 text-lg"
                autoCapitalize="none"
             />
             
             <Button onPress={() => setActiveCode(fleetCode)} className="w-full">
                 <Text className="text-white font-bold">Connect</Text>
             </Button>
        </View>
      ) : (
        <View className="flex-1">
            <View className="absolute top-12 left-4 right-4 z-10 flex-row gap-2">
                 <View className="flex-1 bg-white/90 dark:bg-black/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-md">
                     <Text className="text-xs font-bold text-gray-500 uppercase">Fleet Active</Text>
                     <Text className="text-lg font-bold text-black dark:text-white">#{activeCode}</Text>
                     <Text className="text-xs text-blue-600 dark:text-blue-400">{members.length} members online</Text>
                 </View>
                 <Button variant="destructive" className="h-full" onPress={() => { setActiveCode(null); setMembers([]); }}>
                     <Text className="text-white font-bold">Exit</Text>
                 </Button>
            </View>
            
            <Map 
                points={[]} 
                fleetMembers={members} 
                theme={colorScheme as 'light' | 'dark'}
            />
        </View>
      )}
    </View>
  );
}