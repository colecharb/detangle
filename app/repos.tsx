import { Link, Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createClient, GitHubAuthError, type RepoSummary } from '@core/github';
import { useSession } from '@components/session';

export default function ReposScreen() {
  const { hasToken, loading: sessionLoading, getAccessToken, clearTokens } = useSession();
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    (async () => {
      try {
        const client = createClient(async () => {
          const t = await getAccessToken();
          if (!t) throw new GitHubAuthError();
          return t;
        });
        const list = await client.listRepos();
        if (!cancelled) setRepos(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GitHubAuthError) {
          await clearTokens();
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load repos');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken, getAccessToken, clearTokens]);

  const filtered = useMemo(() => {
    if (!repos) return null;
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      `${r.owner}/${r.name}`.toLowerCase().includes(q),
    );
  }, [repos, query]);

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
    <View className="flex-1 bg-white pt-16">
      <View className="px-6 pb-4">
        <Text className="text-2xl font-bold text-neutral-900">Your repositories</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter…"
          placeholderTextColor="#a3a3a3"
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          className="mt-4 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </View>

      {error && (
        <Text className="px-6 text-red-600">{error}</Text>
      )}

      {!filtered && !error && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}

      {filtered && (
        <FlatList
          data={filtered}
          extraData={query}
          keyExtractor={(r) => `${r.owner}/${r.name}`}
          ItemSeparatorComponent={() => <View className="h-px bg-neutral-200" />}
          renderItem={({ item }) => (
            <Link href={`/${item.owner}/${item.name}`} asChild>
              <Pressable className="px-6 py-4 active:bg-neutral-100">
                <Text className="text-base font-semibold text-neutral-900">
                  {item.owner}/{item.name}
                </Text>
                {item.isPrivate && (
                  <Text className="mt-1 text-xs text-neutral-500">Private</Text>
                )}
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-neutral-500">
              No repositories match.
            </Text>
          }
        />
      )}

      <Pressable
        onPress={clearTokens}
        className="m-6 rounded-lg border border-neutral-300 p-3"
      >
        <Text className="text-center text-neutral-700">Sign out</Text>
      </Pressable>
    </View>
  );
}
