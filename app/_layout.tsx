import '../global.css';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SessionProvider } from '@components/session';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-white">
        <View className="mx-auto w-full max-w-2xl flex-1">
          <SessionProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'white' } }} />
          </SessionProvider>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}
