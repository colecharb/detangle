import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { Commit } from '@core/storage';

interface Props {
  sha: string | null;
  commits: Commit[];
  onClose: () => void;
}

export function CommitDetailSheet({ sha, commits, onClose }: Props) {
  const commit = sha ? commits.find((c) => c.sha === sha) ?? null : null;
  const visible = commit !== null;

  const [firstLine, ...rest] = (commit?.message ?? '').split('\n');
  const body = rest.join('\n').trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="rounded-t-2xl bg-white p-6 pb-10"
          onPress={(e) => e.stopPropagation()}
        >
          {commit && (
            <View className="gap-3">
              <Text className="text-lg font-semibold text-neutral-900">
                {firstLine || '(no message)'}
              </Text>
              {body.length > 0 && (
                <ScrollView className="max-h-48">
                  <Text className="font-mono text-sm text-neutral-700">{body}</Text>
                </ScrollView>
              )}
              <View className="gap-1 pt-2">
                <Text className="text-sm text-neutral-600">
                  {commit.authorName ?? 'unknown'}
                </Text>
                <Text className="font-mono text-xs text-neutral-500">
                  {commit.sha.slice(0, 7)}
                </Text>
                <Text className="text-xs text-neutral-500">
                  {new Date(commit.committedAt * 1000).toLocaleString()}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="mt-2 rounded-lg bg-neutral-900 p-3"
              >
                <Text className="text-center font-semibold text-white">Close</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
