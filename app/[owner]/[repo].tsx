import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
  GitHubAuthError,
  GitHubRateLimitError,
  createClient,
  syncRepo,
  type SyncResult,
} from '@core/github';
import { useSession } from '@components/session';

export default function RepoScreen() {
  const { owner, repo } = useLocalSearchParams<{ owner: string; repo: string }>();
  const {
    db,
    hasToken,
    loading: sessionLoading,
    getAccessToken,
    clearTokens,
  } = useSession();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const runSync = useCallback(async () => {
    if (!db || !hasToken || !owner || !repo) return;
    setStatus('syncing');
    setError(null);
    setProgress('');
    try {
      const client = createClient(async () => {
        const t = await getAccessToken();
        if (!t) throw new GitHubAuthError();
        return t;
      });
      const res = await syncRepo(client, db, owner, repo, (stage, count) => {
        setProgress(`${stage} (${count})`);
      });
      setResult(res);
      setStatus('done');
    } catch (err) {
      if (err instanceof GitHubAuthError) {
        await clearTokens();
        return;
      }
      if (err instanceof GitHubRateLimitError) {
        setError(
          `Rate limit exceeded. Resets at ${new Date(err.resetAt * 1000).toLocaleTimeString()}.`,
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Sync failed.');
      }
      setStatus('error');
    }
  }, [db, hasToken, owner, repo, getAccessToken, clearTokens]);

  useEffect(() => {
    if (status === 'idle' && db && hasToken) {
      void runSync();
    }
  }, [status, db, hasToken, runSync]);

  if (sessionLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (!hasToken) {
    return <Redirect href="/" />;
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="p-6 pt-16">
      <Link href="/repos" className="text-neutral-500">
        ← Back
      </Link>
      <Text className="mt-4 text-2xl font-bold text-neutral-900">
        {owner}/{repo}
      </Text>

      {status === 'syncing' && (
        <View className="mt-8 flex-row items-center">
          <ActivityIndicator />
          <Text className="ml-3 text-neutral-700">Syncing… {progress}</Text>
        </View>
      )}

      {status === 'done' && result && (
        <View className="mt-8 space-y-2">
          <Text className="text-neutral-900">
            Synced {result.commitsAdded} new commit{result.commitsAdded === 1 ? '' : 's'}.
          </Text>
          <Text className="text-neutral-600">
            {result.refsUpdated} ref{result.refsUpdated === 1 ? '' : 's'} updated in{' '}
            {Math.round(result.durationMs / 100) / 10}s.
          </Text>
        </View>
      )}

      {status === 'error' && (
        <Text className="mt-8 text-red-600">{error}</Text>
      )}

      <Pressable
        onPress={runSync}
        disabled={status === 'syncing'}
        className="mt-8 rounded-lg bg-neutral-900 p-3 disabled:opacity-50"
      >
        <Text className="text-center font-semibold text-white">
          {status === 'syncing' ? 'Syncing…' : 'Resync'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
