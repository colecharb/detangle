import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { storage, type Database } from '@platform/storage';
import { env } from '@platform/env';
import { migrate } from '@core/storage';
import { refreshAccessToken, RefreshTokenExpiredError } from '@core/github';

const CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';
const DB_NAME = 'detangle.db';
const TOKEN_KEY = 'github_token_bundle';
const REFRESH_SKEW_SECONDS = 60;

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

interface SessionState {
  db: Database | null;
  hasToken: boolean;
  loading: boolean;
  getAccessToken: () => Promise<string | null>;
  setTokens: (bundle: TokenBundle) => Promise<void>;
  clearTokens: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

let dbPromise: Promise<Database> | null = null;
function getDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await storage.openDatabase(DB_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [bundle, setBundle] = useState<TokenBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef<Promise<TokenBundle> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await getDatabase();
      const raw = await storage.getSecret(TOKEN_KEY);
      if (cancelled) return;
      setDb(opened);
      if (raw) {
        try {
          setBundle(JSON.parse(raw) as TokenBundle);
        } catch {
          await storage.deleteSecret(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTokens = useCallback(async (b: TokenBundle) => {
    await storage.setSecret(TOKEN_KEY, JSON.stringify(b));
    setBundle(b);
  }, []);

  const clearTokens = useCallback(async () => {
    await storage.deleteSecret(TOKEN_KEY);
    setBundle(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!bundle) return null;
    const t = now();

    if (bundle.accessTokenExpiresAt - t > REFRESH_SKEW_SECONDS) {
      return bundle.accessToken;
    }

    if (bundle.refreshTokenExpiresAt - t <= REFRESH_SKEW_SECONDS) {
      await clearTokens();
      return null;
    }

    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        try {
          const resp = await refreshAccessToken(
            CLIENT_ID,
            bundle.refreshToken,
            env.githubAuthBase,
          );
          const issuedAt = now();
          const fresh: TokenBundle = {
            accessToken: resp.accessToken,
            refreshToken: resp.refreshToken,
            accessTokenExpiresAt: issuedAt + resp.accessTokenExpiresIn,
            refreshTokenExpiresAt: issuedAt + resp.refreshTokenExpiresIn,
          };
          await setTokens(fresh);
          return fresh;
        } finally {
          refreshInFlight.current = null;
        }
      })();
    }

    try {
      const fresh = await refreshInFlight.current;
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof RefreshTokenExpiredError) {
        await clearTokens();
      }
      return null;
    }
  }, [bundle, clearTokens, setTokens]);

  return (
    <SessionContext.Provider
      value={{
        db,
        hasToken: bundle !== null,
        loading,
        getAccessToken,
        setTokens,
        clearTokens,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
