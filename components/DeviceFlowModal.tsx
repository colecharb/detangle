import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import {
  DeviceFlowDeniedError,
  DeviceFlowExpiredError,
  pollForToken,
  startDeviceFlow,
  type DeviceFlowStart,
} from '@core/github';

interface Props {
  visible: boolean;
  clientId: string;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export function DeviceFlowModal({ visible, clientId, onClose, onSuccess }: Props) {
  const [start, setStart] = useState<DeviceFlowStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStart(null);
    setError(null);
    setCopied(false);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const flow = await startDeviceFlow(clientId);
        setStart(flow);
        const token = await pollForToken(clientId, flow, controller.signal);
        onSuccess(token);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DeviceFlowDeniedError) {
          setError('You denied the authorization request.');
        } else if (err instanceof DeviceFlowExpiredError) {
          setError('The code expired. Please try again.');
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred.');
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [visible, clientId, onSuccess]);

  const copyCode = async () => {
    if (!start) return;
    await Clipboard.setStringAsync(start.userCode);
    setCopied(true);
  };

  const openVerification = async () => {
    if (!start) return;
    await Linking.openURL(start.verificationUri);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 p-6">
        <View className="w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="text-xl font-bold text-neutral-900">Connect GitHub</Text>

          {!start && !error && (
            <View className="mt-6 items-center">
              <ActivityIndicator />
              <Text className="mt-2 text-neutral-600">Requesting code…</Text>
            </View>
          )}

          {start && !error && (
            <>
              <Text className="mt-3 text-neutral-700">
                1. Copy the code below.
              </Text>
              <Pressable
                onPress={copyCode}
                className="mt-2 rounded-lg bg-neutral-100 p-4 active:bg-neutral-200"
              >
                <Text className="text-center text-3xl font-mono font-bold tracking-widest text-neutral-900">
                  {start.userCode}
                </Text>
                <Text className="mt-1 text-center text-sm text-neutral-500">
                  {copied ? 'Copied!' : 'Tap to copy'}
                </Text>
              </Pressable>

              <Text className="mt-4 text-neutral-700">
                2. Open GitHub and paste the code.
              </Text>
              <Pressable
                onPress={openVerification}
                className="mt-2 rounded-lg bg-neutral-900 p-3"
              >
                <Text className="text-center font-semibold text-white">
                  Open {start.verificationUri}
                </Text>
              </Pressable>

              <View className="mt-4 flex-row items-center">
                <ActivityIndicator size="small" />
                <Text className="ml-2 text-sm text-neutral-500">
                  Waiting for authorization…
                </Text>
              </View>
            </>
          )}

          {error && (
            <Text className="mt-4 text-red-600">{error}</Text>
          )}

          <Pressable
            onPress={onClose}
            className="mt-6 rounded-lg border border-neutral-300 p-3"
          >
            <Text className="text-center font-semibold text-neutral-700">
              {error ? 'Close' : 'Cancel'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
