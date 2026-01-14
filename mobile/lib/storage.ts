import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      } catch (e) {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') localStorage.setItem(key, value);
      } catch (e) {}
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {}
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') localStorage.removeItem(key);
      } catch (e) {}
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {}
  }
};
