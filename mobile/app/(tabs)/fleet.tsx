import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import Map from '@/components/Map';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';

interface FleetMember {
  id: string;
  lat: number;
  lng: number;
  avatarUrl?: string;
  user_id: string;
  isSos?: boolean;
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

    const fetchFleet = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tracks')
        .select('id, lat, lng, avatar_url, user_id, is_sos')
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
            user_id: m.user_id,
            isSos: m.is_sos
        })));
      }
      setLoading(false);
    };

    fetchFleet();

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
                 setMembers(prev => prev.filter(p => p.id !== m.id));
                 return;
             }
             
             setMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) {
                     return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos } : p);
                 } else {
                     return [...prev, {
                        id: m.id,
                        lat: m.lat,
                        lng: m.lng,
                        avatarUrl: m.avatar_url,
                        user_id: m.user_id,
                        isSos: m.is_sos
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

  const sosMembers = members.filter(m => m.isSos);

  return (
    <View className="flex-1 bg-white dark:bg-black" style={{ paddingTop: insets.top }}>
      {!activeCode ? (
        <View className="flex-1 p-4 justify-center">
             <Text className="text-2xl font-bold mb-2 text-black dark:text-white">Join Family Circle</Text>
             <Text className="text-gray-500 dark:text-gray-400 mb-6">Enter your family code to see everyone on the map.</Text>
             
             <TextInput 
                value={fleetCode}
                onChangeText={setFleetCode}
                placeholder="Enter Family Code"
                placeholderTextColor="#9ca3af"
                className="bg-gray-100 dark:bg-gray-800 dark:text-white p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 text-lg"
                autoCapitalize="none"
             />
             
             <Button onPress={() => setActiveCode(fleetCode)} className="w-full">
                 <Text className="text-white font-bold">Connect to Family</Text>
             </Button>
        </View>
      ) : (
        <View className="flex-1">
            <View className="absolute top-12 left-4 right-4 z-10 gap-2">
                 <View className="flex-row gap-2">
                    <View className="flex-1 bg-white/90 dark:bg-black/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-md">
                        <Text className="text-xs font-bold text-gray-500 uppercase">Circle Active</Text>
                        <Text className="text-lg font-bold text-black dark:text-white">#{activeCode}</Text>
                        <Text className="text-xs text-blue-600 dark:text-blue-400">{members.length} members online</Text>
                    </View>
                    <Button variant="destructive" className="h-full" onPress={() => { setActiveCode(null); setMembers([]); }}>
                        <Text className="text-white font-bold">Exit</Text>
                    </Button>
                 </View>

                 {sosMembers.length > 0 && (
                     <View className="bg-red-600 p-4 rounded-xl shadow-lg flex-row items-center gap-3 animate-pulse">
                         <Ionicons name="warning" size={28} color="white" />
                         <View className="flex-1">
                             <Text className="text-white font-black text-lg uppercase">Emergency SOS!</Text>
                             <Text className="text-white font-medium text-xs">
                                 {sosMembers.length} member{sosMembers.length > 1 ? 's' : ''} triggered an alert!
                             </Text>
                         </View>
                     </View>
                 )}
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