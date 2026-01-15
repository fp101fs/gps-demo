import React, { useState, useEffect } from 'react';
import { View, Text, Switch } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { storage } from '@/lib/storage';

export default function SettingsScreen() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const [midnightMode, setMidnightMode] = useState(false);

  useEffect(() => {
    storage.getItem('midnight_mode').then(val => {
      setMidnightMode(val === 'true');
    });
  }, []);

  const toggleMidnightMode = async (val: boolean) => {
    setMidnightMode(val);
    await storage.setItem('midnight_mode', String(val));
  };

  return (
    <View className="flex-1 bg-white dark:bg-black p-4" style={{ paddingTop: insets.top }}>
      <Text className="text-2xl font-bold mb-6 text-black dark:text-white">Settings</Text>
      
      <View className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-4">
        <View className="flex-row items-center justify-between mb-4">
            <View>
                <Text className="text-lg font-medium text-black dark:text-white">Dark Mode</Text>
                <Text className="text-gray-500 dark:text-gray-400">Toggle app theme</Text>
            </View>
            <Switch 
                value={colorScheme === 'dark'}
                onValueChange={toggleColorScheme}
                trackColor={{ false: '#767577', true: '#2563eb' }}
                thumbColor={colorScheme === 'dark' ? '#fff' : '#f4f3f4'}
            />
        </View>

        {colorScheme === 'dark' && (
            <View className="flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                <View>
                    <Text className="text-lg font-medium text-black dark:text-white">Midnight Mode</Text>
                    <Text className="text-gray-500 dark:text-gray-400">Super dark map style</Text>
                </View>
                <Switch 
                    value={midnightMode}
                    onValueChange={toggleMidnightMode}
                    trackColor={{ false: '#767577', true: '#818cf8' }}
                    thumbColor={midnightMode ? '#fff' : '#f4f3f4'}
                />
            </View>
        )}
      </View>
    </View>
  );
}