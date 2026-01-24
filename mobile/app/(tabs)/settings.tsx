import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TextInput, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';

export default function SettingsScreen() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // Settings state
  const [nickname, setNickname] = useState('');
  const [useProfilePhoto, setUseProfilePhoto] = useState(true);
  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityDistance, setProximityDistance] = useState('500');
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [arrivalDistance, setArrivalDistance] = useState('50');
  const [locationInterval, setLocationInterval] = useState('5000');

  // Load settings from storage on mount
  useEffect(() => {
    (async () => {
      const savedNickname = await storage.getItem('user_nickname');
      const savedUsePhoto = await storage.getItem('use_profile_photo');
      const savedProxEnabled = await storage.getItem('proximity_enabled');
      const savedProxDistance = await storage.getItem('proximity_distance');
      const savedArrEnabled = await storage.getItem('arrival_enabled');
      const savedArrDistance = await storage.getItem('arrival_distance');

      if (savedNickname) setNickname(savedNickname);
      if (savedUsePhoto !== null) setUseProfilePhoto(savedUsePhoto === 'true');
      if (savedProxEnabled !== null) setProximityEnabled(savedProxEnabled === 'true');
      if (savedProxDistance) setProximityDistance(savedProxDistance);
      if (savedArrEnabled !== null) setArrivalEnabled(savedArrEnabled === 'true');
      if (savedArrDistance) setArrivalDistance(savedArrDistance);

      const savedLocationInterval = await storage.getItem('location_interval');
      if (savedLocationInterval) setLocationInterval(savedLocationInterval);
    })();
  }, []);

  // Save settings when they change
  const saveNickname = async (value: string) => {
    setNickname(value);
    await storage.setItem('user_nickname', value);
  };

  const saveUseProfilePhoto = async (value: boolean) => {
    setUseProfilePhoto(value);
    await storage.setItem('use_profile_photo', value.toString());
  };

  const saveProximityEnabled = async (value: boolean) => {
    setProximityEnabled(value);
    await storage.setItem('proximity_enabled', value.toString());
  };

  const saveProximityDistance = async (value: string) => {
    setProximityDistance(value);
    await storage.setItem('proximity_distance', value);
  };

  const saveArrivalEnabled = async (value: boolean) => {
    setArrivalEnabled(value);
    await storage.setItem('arrival_enabled', value.toString());
  };

  const saveArrivalDistance = async (value: string) => {
    setArrivalDistance(value);
    await storage.setItem('arrival_distance', value);
  };

  const saveLocationInterval = async (value: string) => {
    setLocationInterval(value);
    await storage.setItem('location_interval', value);
  };

  const intervalOptions = [
    { label: '1s', value: '1000' },
    { label: '5s', value: '5000' },
    { label: '10s', value: '10000' },
    { label: '30s', value: '30000' },
    { label: '1m', value: '60000' },
  ];

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black" style={{ paddingTop: insets.top }}>
      <View className="p-4">
        <Text className="text-2xl font-bold mb-6 text-black dark:text-white">Settings</Text>

        {/* Profile Section */}
        <Text className="text-sm font-bold text-gray-500 uppercase mb-3">Profile</Text>

        {/* Nickname */}
        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-3">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Your Name / Nickname</Text>
          <TextInput
            value={nickname}
            onChangeText={saveNickname}
            placeholder="e.g. 'Mom', 'Billy'"
            placeholderTextColor="#9ca3af"
            className="bg-white dark:bg-gray-700 p-3 rounded-lg text-black dark:text-white"
          />
        </View>

        {/* Profile Photo Toggle */}
        <View className="flex-row items-center justify-between bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-6">
          <View className="flex-row items-center gap-3">
            {user?.user_metadata?.avatar_url ? (
              <Image source={{ uri: user.user_metadata.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
            ) : (
              <View className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600" />
            )}
            <Text className="text-gray-700 dark:text-gray-200 font-medium">Use Profile Picture</Text>
          </View>
          <Switch
            value={useProfilePhoto}
            onValueChange={saveUseProfilePhoto}
            trackColor={{ false: '#767577', true: '#2563eb' }}
            thumbColor={useProfilePhoto ? '#fff' : '#f4f3f4'}
          />
        </View>

        {/* Alerts Section */}
        <Text className="text-sm font-bold text-gray-500 uppercase mb-3">Alerts</Text>

        {/* Proximity Alert */}
        <View className="bg-blue-50 dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-gray-700 mb-3">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="radio-outline" size={20} color="#2563eb" />
              <Text className="text-gray-900 dark:text-white font-semibold">Proximity Alert</Text>
            </View>
            <Switch
              value={proximityEnabled}
              onValueChange={saveProximityEnabled}
              trackColor={{ false: '#767577', true: '#2563eb' }}
              thumbColor={proximityEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">Get notified when family members are nearby</Text>
          {proximityEnabled && (
            <View className="flex-row items-center gap-2 mt-2">
              <Text className="text-gray-600 dark:text-gray-400 text-sm">Alert when within</Text>
              <TextInput
                value={proximityDistance}
                onChangeText={saveProximityDistance}
                keyboardType="numeric"
                className="bg-white dark:bg-gray-700 px-3 py-2 rounded-lg text-black dark:text-white w-20 text-center"
              />
              <Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text>
            </View>
          )}
        </View>

        {/* Arrival Alert */}
        <View className="bg-green-50 dark:bg-gray-800 p-4 rounded-xl border border-green-100 dark:border-gray-700 mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ionicons name="flag-outline" size={20} color="#16a34a" />
              <Text className="text-gray-900 dark:text-white font-semibold">Arrival Alert</Text>
            </View>
            <Switch
              value={arrivalEnabled}
              onValueChange={saveArrivalEnabled}
              trackColor={{ false: '#767577', true: '#16a34a' }}
              thumbColor={arrivalEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2">Get notified when family members arrive at destination</Text>
          {arrivalEnabled && (
            <View className="flex-row items-center gap-2 mt-2">
              <Text className="text-gray-600 dark:text-gray-400 text-sm">Alert when within</Text>
              <TextInput
                value={arrivalDistance}
                onChangeText={saveArrivalDistance}
                keyboardType="numeric"
                className="bg-white dark:bg-gray-700 px-3 py-2 rounded-lg text-black dark:text-white w-20 text-center"
              />
              <Text className="text-gray-600 dark:text-gray-400 text-sm">meters</Text>
            </View>
          )}
        </View>

        {/* Location Section */}
        <Text className="text-sm font-bold text-gray-500 uppercase mb-3">Location</Text>

        <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-6">
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="location-outline" size={20} color="#2563eb" />
            <Text className="text-gray-900 dark:text-white font-semibold">Location Check Interval</Text>
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">How often to update your location. Shorter intervals use more battery.</Text>
          <View className="flex-row gap-2">
            {intervalOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => saveLocationInterval(option.value)}
                className={`flex-1 py-2 rounded-lg ${locationInterval === option.value ? 'bg-blue-600' : 'bg-white dark:bg-gray-700'}`}
              >
                <Text className={`text-center font-medium ${locationInterval === option.value ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Appearance Section */}
        <Text className="text-sm font-bold text-gray-500 uppercase mb-3">Appearance</Text>

        <View className="flex-row items-center justify-between bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-6">
          <View>
            <Text className="text-lg font-medium text-black dark:text-white">Dark Mode</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-sm">Toggle app theme</Text>
          </View>
          <Switch
            value={colorScheme === 'dark'}
            onValueChange={toggleColorScheme}
            trackColor={{ false: '#767577', true: '#2563eb' }}
            thumbColor={colorScheme === 'dark' ? '#fff' : '#f4f3f4'}
          />
        </View>

        {/* Notifications Link */}
        <Text className="text-sm font-bold text-gray-500 uppercase mb-3">More</Text>

        <TouchableOpacity
          onPress={() => router.push('/notifications')}
          className="flex-row items-center justify-between bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-3"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="notifications-outline" size={24} color={colorScheme === 'dark' ? '#fff' : '#000'} />
            <Text className="text-lg font-medium text-black dark:text-white">Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
