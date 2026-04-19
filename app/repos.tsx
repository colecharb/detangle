import { Link, Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  createClient,
  GitHubAuthError,
  type ReposWithInstallations,
} from '@core/github';
import { useSession } from '@components/session';

// Accept either a bare slug ('colecharb-detangle') or a pasted URL
// ('https://github.com/apps/colecharb-detangle') — strip anything up to
// and including the '/apps/' segment, plus trailing slashes.
const APP_SLUG = (process.env.EXPO_PUBLIC_GITHUB_APP_SLUG ?? '')
  .replace(/^https?:\/\//, '')
  .replace(/^.*\/apps\//, '')
  .replace(/\/+$/, '')
  .trim();
const INSTALL_URL = APP_SLUG
  ? `https://github.com/apps/${APP_SLUG}/installations/new`
  : null;

export default function ReposScreen() {
  const { hasToken, loading: sessionLoading, getAccessToken, clearTokens } = useSession();
  const [data, setData] = useState<ReposWithInstallations | null>(null);
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
        const result = await client.listRepos();
        if (!cancelled) setData(result);
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
    if (!data) return null;
    const q = query.trim().toLowerCase();
    if (!q) return data.repos;
    return data.repos.filter((r) =>
      `${r.owner}/${r.name}`.toLowerCase().includes(q),
    );
  }, [data, query]);

  const openInstall = async () => {
    if (!INSTALL_URL) return;
    if (Platform.OS === 'web') {
      window.open(INSTALL_URL, '_blank', 'noopener,noreferrer');
    } else {
      await Linking.openURL(INSTALL_URL);
    }
  };

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

  const showInstallPrompt =
    data !== null && (data.installationCount === 0 || data.repos.length === 0);

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

      {error && <Text className="px-6 text-red-600">{error}</Text>}

      {!data && !error && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}

      {showInstallPrompt && (
        <View className="px-6 py-8">
          <Text className="text-base text-neutral-800">
            {data!.installationCount === 0
              ? "You haven't installed the Detangle GitHub App yet."
              : 'The Detangle GitHub App is installed, but no repositories are shared with it.'}
          </Text>
          <Text className="mt-2 text-sm text-neutral-500">
            Install (or update the install) and pick which repos to share.
          </Text>
          {INSTALL_URL ? (
            <Pressable
              onPress={openInstall}
              className="mt-4 rounded-lg bg-neutral-900 p-3"
            >
              <Text className="text-center font-semibold text-white">
                Install / configure on GitHub
              </Text>
            </Pressable>
          ) : (
            <Text className="mt-2 text-xs text-red-600">
              EXPO_PUBLIC_GITHUB_APP_SLUG is not set — can&apos;t link you to the install page.
            </Text>
          )}
        </View>
      )}

      {filtered && !showInstallPrompt && (
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
