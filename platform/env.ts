export interface Env {
  // Base URL for GitHub OAuth device-flow endpoints. On native this is
  // the real host; on web (dev) this is a path that Metro proxies to
  // github.com because the OAuth endpoints don't set CORS headers.
  githubAuthBase: string;
}

export declare const env: Env;
