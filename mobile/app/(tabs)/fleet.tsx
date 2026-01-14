import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, TouchableOpacity, Modal, useWindowDimensions, Platform, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import Map from '@/components/Map';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { storage } from '@/lib/storage';

interface FleetMember {
  id: string;
  lat: number;
  lng: number;
  avatarUrl?: string;
  user_id: string;
  nickname?: string;
  isSos?: boolean;
  lastSeen?: string;
}

export default function FleetScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { code: inviteCode } = useLocalSearchParams<{ code?: string }>();
  
  const [fleetCode, setFleetCode] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [members, setMembers] = useState<FleetMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
    };
    init();
  }, [inviteCode]);

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
        .select('id, lat, lng, avatar_url, user_id, is_sos, nickname, updated_at')
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
            lastSeen: m.updated_at
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
                 if (exists) return prev.map(p => p.id === m.id ? { ...p, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at } : p);
                 return [...prev, { id: m.id, lat: m.lat, lng: m.lng, avatarUrl: m.avatar_url, user_id: m.user_id, isSos: m.is_sos, nickname: m.nickname, lastSeen: m.updated_at }];
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

  const shareInvite = async () => {
      const url = `${Platform.OS === 'web' ? window.location.origin : Linking.createURL('/')}/fleet?code=${activeCode}`;
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (Platform.OS !== 'web') {
          await Share.share({ message: `Join my Family Circle on FindMyFam! Click here: ${url}`, url });
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
                <Button onPress={() => connectToCircle(fleetCode)} className="w-full"><Text className="text-white font-bold">Connect to Family</Text></Button>
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
            <Map points={[]} fleetMembers={members} theme={colorScheme as 'light' | 'dark'} />
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
    </View>
  );
}