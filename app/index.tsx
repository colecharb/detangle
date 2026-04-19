import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { DeviceFlowModal } from '@components/DeviceFlowModal';
import { useSession } from '@components/session';

const CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';

export default function Landing() {
  const { hasToken, loading, setTokens } = useSession();
  const [modalVisible, setModalVisible] = useState(false);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (hasToken) {
    return <Redirect href="/repos" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="text-4xl font-bold text-neutral-900">Detangle</Text>
      <Text className="mt-2 text-center text-neutral-600">
        A GitHub repo graph viewer with semantic zoom.
      </Text>

      {!CLIENT_ID ? (
        <Text className="mt-8 text-center text-red-600">
          EXPO_PUBLIC_GITHUB_CLIENT_ID is not set. Copy `.env.example` to `.env` and fill
          in your GitHub App's Client ID.
        </Text>
      ) : (
        <Pressable
          onPress={() => setModalVisible(true)}
          className="mt-8 rounded-lg bg-neutral-900 px-6 py-3"
        >
          <Text className="font-semibold text-white">Connect GitHub</Text>
        </Pressable>
      )}

      <DeviceFlowModal
        visible={modalVisible}
        clientId={CLIENT_ID}
        onClose={() => setModalVisible(false)}
        onSuccess={async (bundle) => {
          await setTokens(bundle);
          setModalVisible(false);
        }}
      />
    </View>
  );
}
