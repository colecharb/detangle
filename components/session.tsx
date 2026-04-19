import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { storage, type Database } from '@platform/storage';
import { migrate } from '@core/storage';

const DB_NAME = 'detangle.db';
const TOKEN_KEY = 'github_token';

interface SessionState {
  db: Database | null;
  token: string | null;
  loading: boolean;
  setToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await storage.openDatabase(DB_NAME);
      await migrate(opened);
      const stored = await storage.getSecret(TOKEN_KEY);
      if (cancelled) return;
      setDb(opened);
      setTokenState(stored);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setToken = async (value: string) => {
    await storage.setSecret(TOKEN_KEY, value);
    setTokenState(value);
  };

  const clearToken = async () => {
    await storage.deleteSecret(TOKEN_KEY);
    setTokenState(null);
  };

  return (
    <SessionContext.Provider value={{ db, token, loading, setToken, clearToken }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
