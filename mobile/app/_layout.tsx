import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { ClerkProvider, SignedIn, SignedOut, useOAuth, useAuth } from '@clerk/clerk-expo';
import { Text, View, SafeAreaView } from 'react-native';
import { Button } from '@/components/ui/Button'; 
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'nativewind';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import '../global.css';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error('Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env');
}

WebBrowser.maybeCompleteAuthSession();

function SignInScreen() {
    const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

    const onPress = async () => {
      try {
        const { createdSessionId, setActive } = await startOAuthFlow({
          redirectUrl: Linking.createURL('/', { scheme: 'gps-demo' }),
        });

        if (createdSessionId && setActive) {
          setActive({ session: createdSessionId });
        }
      } catch (err) {
        console.error("OAuth error", err);
      }
    };

    return (
        <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
             <Text className="text-2xl font-bold mb-4">Welcome to GPS Demo</Text>
             <Text className="text-gray-500 mb-8 text-center">Please sign in to track your location securely.</Text>
             <Button onPress={onPress} className="w-full">
                <Text className="text-white font-bold">Sign in with Google</Text>
             </Button>
        </SafeAreaView>
    )
}

function InitialLayout() {
  const { colorScheme } = useColorScheme();
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const isPublicRoute = segments[0] === 'track';

    if (!isSignedIn && !isPublicRoute && inAuthGroup) {
      // If the user is not signed in and the initial segment is not a public route, redirect to sign-in
      // (This is handled by SignedIn/SignedOut wrappers below, but segments check is good for deep linking)
    }
  }, [isSignedIn, segments, isLoaded]);

  if (!loaded || !isLoaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="track/[id]" options={{ title: 'Shared Journey' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      
      {/* Auth Gate for Tab routes */}
      {segments[0] === '(tabs)' && (
        <>
          <SignedOut>
            <View className="absolute inset-0 bg-white">
               <SignInScreen />
            </View>
          </SignedOut>
        </>
      )}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <InitialLayout />
    </ClerkProvider>
  );
}
