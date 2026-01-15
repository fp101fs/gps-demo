import React from 'react';
import { View, Text, Switch } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-white dark:bg-black p-4" style={{ paddingTop: insets.top }}>
      <Text className="text-2xl font-bold mb-6 text-black dark:text-white">Settings</Text>
      
      <View className="flex-row items-center justify-between bg-gray-100 dark:bg-gray-800 p-4 rounded-xl">
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
    </View>
  );
}