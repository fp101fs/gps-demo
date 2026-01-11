import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { ClerkProvider, SignedIn, SignedOut, useOAuth } from '@clerk/clerk-expo';
import { Text, View, SafeAreaView } from 'react-native';
import { Button } from '@/components/ui/Button'; 
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'nativewind';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import '../global.css';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Token cache for Native (persists login)
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

// Use the key from environment
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

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SignedIn>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </SignedIn>
        <SignedOut>
          <SignInScreen />
        </SignedOut>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ClerkProvider>
  );
}