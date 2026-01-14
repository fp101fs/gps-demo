import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Text, View, SafeAreaView, Image } from 'react-native';
import { Button } from '@/components/ui/Button'; 
import { useColorScheme } from 'nativewind';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import '../global.css';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

WebBrowser.maybeCompleteAuthSession();

function SignInScreen() {
    const handleGoogleSignIn = async () => {
      try {
        // Use a clean URL for redirects
        const redirectTo = Platform.OS === 'web' 
          ? window.location.origin 
          : Linking.createURL('/');
          
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
            redirectTo,
          },
        });

        if (error) throw error;
        if (data.url) {
          if (Platform.OS === 'web') {
            // On web, simple redirect is most reliable
            window.location.href = data.url;
          } else {
            // On native, use the auth session handler
            await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          }
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };

    return (
        <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black p-6">
             <View className="items-center mb-12">
                <View className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-3xl mb-6">
                    <Image 
                        source={require('../assets/images/favicon.png')} 
                        style={{ width: 80, height: 80, borderRadius: 16 }} 
                    />
                </View>
                <Text className="text-4xl font-black text-gray-900 dark:text-white mb-2">FindMyFam</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center text-lg">Keep your family circle safe and connected.</Text>
             </View>

             <Button onPress={handleGoogleSignIn} className="w-full h-16 rounded-2xl flex-row items-center justify-center gap-3">
                <Text className="text-white font-bold text-xl">Sign in with Google</Text>
             </Button>
             
             <Text className="mt-8 text-gray-400 text-sm text-center">
                Secure tracking for the people who matter most.
             </Text>
        </SafeAreaView>
    )
}

function InitialLayout() {
  const { colorScheme } = useColorScheme();
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded && !loading) {
      SplashScreen.hideAsync();
    }
  }, [loaded, loading]);

  if (!loaded || loading) {
    return null;
  }

  const isSignedIn = !!user;
  const isPublicRoute = segments[0] === 'track';

  if (!isSignedIn && !isPublicRoute && segments[0] === '(tabs)') {
      return <SignInScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="track/[id]" options={{ title: 'Shared Journey' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <InitialLayout />
    </AuthProvider>
  );
}