import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  GitHubAuthError,
  GitHubRateLimitError,
  createClient,
  syncRepo,
  type SyncResult,
} from '@core/github';
import {
  getRepo,
  listCommits,
  listRefs,
  type Commit,
  type Ref,
} from '@core/storage';
import { layoutGraph, type GraphLayout } from '@core/graph';
import { useSession } from '@components/session';
import { GraphCanvas } from '@components/GraphCanvas';
import { CommitDetailSheet } from '@components/CommitDetailSheet';

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
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    if (!db || !owner || !repo) return;
    const r = await getRepo(db, owner, repo);
    if (!r) {
      setCommits(null);
      setLayout(null);
      return;
    }
    const [loadedCommits, loadedRefs] = await Promise.all([
      listCommits(db, r.id),
      listRefs(db, r.id),
    ]);
    setCommits(loadedCommits);
    if (loadedCommits.length === 0) {
      setLayout(null);
      return;
    }
    const next = layoutGraph(loadedCommits, loadedRefs as Ref[], 'swimlane', 2);
    setLayout(next);
  }, [db, owner, repo]);

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
      await loadGraph();
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
  }, [db, hasToken, owner, repo, getAccessToken, clearTokens, loadGraph]);

  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!db || !hasToken || bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      await loadGraph();
      void runSync();
    })();
  }, [db, hasToken, loadGraph, runSync]);

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
    <View className="flex-1 bg-white">
      <View className="border-b border-neutral-200 px-6 pt-16 pb-4">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/repos'))}>
          <Text className="text-neutral-500">← Back</Text>
        </Pressable>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-neutral-900" numberOfLines={1}>
            {owner}/{repo}
          </Text>
          <Pressable
            onPress={runSync}
            disabled={status === 'syncing'}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 disabled:opacity-50"
          >
            <Text className="text-sm font-semibold text-white">
              {status === 'syncing' ? 'Syncing…' : 'Resync'}
            </Text>
          </Pressable>
        </View>
        {status === 'syncing' && (
          <View className="mt-2 flex-row items-center">
            <ActivityIndicator size="small" />
            <Text className="ml-2 text-sm text-neutral-600">{progress || 'Syncing…'}</Text>
          </View>
        )}
        {status === 'done' && result && (
          <Text className="mt-2 text-sm text-neutral-600">
            Synced {result.commitsAdded} new · {result.refsUpdated} ref
            {result.refsUpdated === 1 ? '' : 's'} · {Math.round(result.durationMs / 100) / 10}s
          </Text>
        )}
        {status === 'error' && error && (
          <Text className="mt-2 text-sm text-red-600">{error}</Text>
        )}
      </View>

      <View className="flex-1">
        {layout ? (
          <GraphCanvas layout={layout} onCommitTap={setSelectedSha} />
        ) : commits !== null && commits.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-neutral-500">No commits yet.</Text>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        )}
      </View>

      <CommitDetailSheet
        sha={selectedSha}
        commits={commits ?? []}
        onClose={() => setSelectedSha(null)}
      />
    </View>
  );
}
