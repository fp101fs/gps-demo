import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Use standard env vars in Expo. 
// For web: import.meta.env (Vite) or process.env (Webpack/Metro)
// Expo handles .env automatically now via process.env usually
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
