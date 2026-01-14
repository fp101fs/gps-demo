import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Notifications } from '@/lib/notifications';
import { Ionicons } from '@expo/vector-icons';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (data) setNotifications(data);
      setLoading(false);
    };

    fetchNotifications();

    // Real-time subscription
    const channel = supabase
      .channel('my_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handlePress = async (notification: Notification) => {
    if (!notification.is_read) {
        await Notifications.markAsRead(notification.id);
        setNotifications(prev => 
            prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
    }
  };

  const markAllRead = async () => {
      if (!user) return;
      await Notifications.markAllAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'alert': return 'warning-outline';
          case 'success': return 'checkmark-circle-outline';
          default: return 'information-circle-outline';
      }
  };

  const getColor = (type: string) => {
      switch(type) {
          case 'alert': return 'text-red-500';
          case 'success': return 'text-green-500';
          default: return 'text-blue-500';
      }
  };

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <Stack.Screen 
        options={{ 
            title: 'Notifications',
            headerRight: () => (
                <TouchableOpacity onPress={markAllRead}>
                    <Text className="text-blue-600 font-semibold">Read All</Text>
                </TouchableOpacity>
            )
        }} 
      />
      
      {loading ? (
          <ActivityIndicator size="large" className="mt-10" />
      ) : (
          <FlatList
            data={notifications}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={() => (
                <Text className="text-center text-gray-500 mt-10">No notifications yet.</Text>
            )}
            renderItem={({ item }) => (
                <TouchableOpacity 
                    onPress={() => handlePress(item)}
                    className={`flex-row p-4 mb-3 rounded-xl border ${item.is_read ? 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800' : 'bg-blue-50 border-blue-100 dark:bg-gray-800 dark:border-blue-900'}`}
                >
                    <View className="mr-3 justify-center">
                        <Ionicons name={getIcon(item.type) as any} size={24} className={getColor(item.type)} />
                    </View>
                    <View className="flex-1">
                        <Text className={`font-semibold mb-1 ${item.is_read ? 'text-gray-900 dark:text-gray-200' : 'text-black dark:text-white'}`}>
                            {item.title}
                        </Text>
                        <Text className="text-gray-600 dark:text-gray-400 text-sm">
                            {item.body}
                        </Text>
                        <Text className="text-gray-400 text-xs mt-2">
                            {new Date(item.created_at).toLocaleString()}
                        </Text>
                    </View>
                    {!item.is_read && (
                        <View className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                    )}
                </TouchableOpacity>
            )}
          />
      )}
    </View>
  );
}