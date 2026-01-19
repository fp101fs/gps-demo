import React, { useState, useEffect } from 'react';
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
import { storage } from '@/lib/storage';
import { generateFleetCode } from '@/lib/utils';
import { calculateDistance, formatDistance } from '@/lib/LocationUtils';
import * as Location from 'expo-location';
import { useAuth } from '@/lib/auth';

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

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
      const tid = await storage.getItem('current_track_id');
      setMyTrackId(tid);
    })();
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
            setFleetCode(initialCode);
            connectToCircle(initialCode);
        }

        // Check for Demo Mode start
        const isDemo = await storage.getItem('is_demo_mode');
        if (isDemo === 'true') {
             // We need location to spawn ghosts. 
             const loc = await Location.getCurrentPositionAsync({});
             generateGhosts(loc.coords.latitude, loc.coords.longitude);
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
      setLoading(true);
      try {
          const { data } = await supabase.from('tracks').select('password').eq('party_code', code).eq('is_active', true).not('password', 'is', null).limit(1);
          if (data && data.length > 0) {
              setCorrectPassword(data[0].password);
              setNeedsPassword(true);
              setLoading(false);
              return;
          }
          setActiveCode(code);
          await storage.setItem('last_fleet_code', code);
      } catch (e) {}
      setLoading(false);
  };

  const verifyPassword = async () => {
      if (enteredPassword === correctPassword) {
          setNeedsPassword(false);
          setActiveCode(fleetCode);
          await storage.setItem('last_fleet_code', fleetCode);
          setPasswordError(false);
      } else {
          setPasswordError(true);
      }
  };

  useEffect(() => {
    if (!activeCode) return;

    const fetchFleet = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tracks')
        .select('id, lat, lng, avatar_url, user_id, is_sos, nickname, updated_at, battery_level, battery_state')
        .eq('party_code', activeCode)
        .eq('is_active', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);

      if (!error && data) {
        setMembers(data.map(m => ({
            id: m.id,
            lat: m.lat,
            lng: m.lng,
            avatarUrl: m.avatar_url,
            user_id: m.user_id,
            isSos: m.is_sos,
            nickname: m.nickname,
            lastSeen: m.updated_at,
            battery_level: m.battery_level,
            battery_state: m.battery_state
        })));
      }
      setLoading(false);
    };

    fetchFleet();

    const channel = supabase.channel(`fleet_${activeCode}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tracks', filter: `party_code=eq.${activeCode}` }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const m = payload.new;
             if (!m.is_active || m.lat === null || m.lng === null) { setMembers(prev => prev.filter(p => p.id !== m.id)); return; }
             setMembers(prev => {
                 const exists = prev.find(p => p.id === m.id);
                 if (exists) return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at, battery_level: m.battery_level, battery_state: m.battery_state } : p);
                 return [...prev, { id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, user_id: m.user_id, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at, battery_level: m.battery_level, battery_state: m.battery_state }];
             });
          }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCode]);

  const handleExit = async () => {
      setActiveCode(null);
      setMembers([]);
      await storage.removeItem('last_fleet_code');
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

  const shareInvite = async () => {
      const url = `${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/fleet?code=${activeCode}`;
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
      {loading && !activeCode && <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563eb" /></View>}
      {!activeCode && !loading ? (
        <View className="flex-1 p-4 justify-center items-center">
             <View style={{ width: '100%', maxWidth: 400 }}>
                <Text className="text-2xl font-bold mb-2 text-black dark:text-white">Join Family Circle</Text>
                <Text className="text-gray-500 dark:text-gray-400 mb-6">Enter your family code to see everyone on the map.</Text>
                <TextInput value={fleetCode} onChangeText={setFleetCode} placeholder="Enter Family Code" placeholderTextColor="#9ca3af" className="bg-gray-100 dark:bg-gray-800 dark:text-white p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 text-lg" autoCapitalize="none" />
                <Button onPress={() => connectToCircle(fleetCode)} className="w-full mb-4"><Text className="text-white font-bold">Connect to Family</Text></Button>
                
                <View className="flex-row items-center gap-4 mb-4">
                    <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-800" />
                    <Text className="text-gray-400 font-medium">OR</Text>
                    <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-800" />
                </View>

                <Button onPress={handleCreateFleet} variant="secondary" className="w-full bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900"><Text className="text-blue-600 dark:text-blue-400 font-bold">Create New Circle</Text></Button>
             </View>
        </View>
      ) : activeCode && (
        <View className="flex-1">
            <View className="absolute top-12 left-4 right-4 z-10 gap-2 items-center">
                 <View className="flex-row gap-2 w-full max-w-2xl">
                    <View className="flex-1 bg-white/90 dark:bg-black/80 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-md">
                        <View className="flex-row justify-between items-center">
                            <View><Text className="text-xs font-bold text-gray-500 uppercase">Circle Active</Text><Text className="text-lg font-bold text-black dark:text-white">#{activeCode}</Text></View>
                            <TouchableOpacity onPress={() => setShowInviteModal(true)} className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg"><Ionicons name="person-add" size={20} color="#2563eb" /></TouchableOpacity>
                        </View>
                        <Text className="text-xs text-blue-600 dark:text-blue-400 mt-1">{members.length} members online</Text>
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
            <Map 
                points={[]} 
                fleetMembers={[...members, ...ghosts]} 
                theme={colorScheme as 'light' | 'dark'} 
                currentPoint={currentLocation ? { ...currentLocation, timestamp: Date.now() } : undefined} 
                onMemberSelect={(m) => {
                    if (m.isGhost) setShowGhostModal(true);
                }}
            />

            {!myTrackId && (
                <View className="absolute bottom-48 left-6 right-6 z-20">
                    <Button onPress={handleJoinMap} className="w-full h-14 rounded-2xl shadow-lg shadow-blue-500/30">
                        <Text className="text-white font-bold text-xl">Enable Location Services</Text>
                    </Button>
                </View>
            )}
            
            <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-lg p-4 max-h-[40%]">
                <View className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full self-center mb-4" />
                <Text className="text-lg font-bold text-gray-900 dark:text-white mb-3 px-2">Family Members ({members.length})</Text>
                <ScrollView>
                    {members.map(member => (
                        <View key={member.id} className="flex-row items-center p-3 mb-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <View className="relative">
                                {member.avatarUrl ? (
                                    <Image source={{ uri: member.avatarUrl }} className="w-10 h-10 rounded-full" />
                                ) : (
                                    <Image source={require('@/assets/images/marker-green-cross.png')} className="w-10 h-10" resizeMode="contain" />
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
            </View>
        </View>
      )}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
          <View className="flex-1 justify-center items-center bg-black/50 p-6">
              <View className="bg-white dark:bg-gray-900 p-8 rounded-3xl items-center shadow-xl w-full max-w-sm">
                  <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invite to Circle</Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-center mb-6 text-sm">Have your family scan this code or use the link below to join #{activeCode} instantly.</Text>
                  <View className="bg-white p-4 rounded-2xl mb-6 shadow-sm border border-gray-100"><QRCode value={`${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/fleet?code=${activeCode}`} size={180} color="black" backgroundColor="white" /></View>
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
