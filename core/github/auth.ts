export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresAt: number;
}

export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

const DEFAULT_BASE = 'https://github.com';

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export class DeviceFlowDeniedError extends Error {
  constructor() {
    super('Device flow denied by user');
    this.name = 'DeviceFlowDeniedError';
  }
}

export class DeviceFlowExpiredError extends Error {
  constructor() {
    super('Device code expired before authorization');
    this.name = 'DeviceFlowExpiredError';
  }
}

export class RefreshTokenExpiredError extends Error {
  constructor() {
    super('Refresh token is expired or invalid');
    this.name = 'RefreshTokenExpiredError';
  }
}

export async function startDeviceFlow(
  clientId: string,
  authBase: string = DEFAULT_BASE,
): Promise<DeviceFlowStart> {
  const res = await fetch(`${authBase}/login/device/code`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({ client_id: clientId }),
  });
  if (!res.ok) {
    throw new Error(`Device flow start failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    intervalSeconds: data.interval,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export async function pollForToken(
  clientId: string,
  start: DeviceFlowStart,
  signal?: AbortSignal,
  authBase: string = DEFAULT_BASE,
): Promise<TokenResponse> {
  let interval = start.intervalSeconds;
  while (Math.floor(Date.now() / 1000) < start.expiresAt) {
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    await sleep(interval * 1000, signal);

    const res = await fetch(`${authBase}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody({
        client_id: clientId,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Device flow poll failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as TokenEndpointResponse;
    if (data.access_token) return toTokenResponse(data);
    switch (data.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        interval = data.interval ?? interval + 5;
        continue;
      case 'expired_token':
        throw new DeviceFlowExpiredError();
      case 'access_denied':
        throw new DeviceFlowDeniedError();
      default:
        throw new Error(`Device flow error: ${data.error ?? 'unknown'}`);
    }
  }
  throw new DeviceFlowExpiredError();
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
  authBase: string = DEFAULT_BASE,
): Promise<TokenResponse> {
  const res = await fetch(`${authBase}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TokenEndpointResponse;
  if (data.error) {
    // bad_refresh_token / bad_verification_code / etc — refresh token is unusable
    throw new RefreshTokenExpiredError();
  }
  if (!data.access_token) {
    throw new Error('Refresh response missing access_token');
  }
  return toTokenResponse(data);
}

interface TokenEndpointResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  error?: string;
  interval?: number;
}

function toTokenResponse(data: TokenEndpointResponse): TokenResponse {
  if (
    !data.access_token ||
    data.expires_in === undefined ||
    !data.refresh_token ||
    data.refresh_token_expires_in === undefined
  ) {
    throw new Error(
      'Token response missing fields — is this a GitHub App with expiring tokens?',
    );
  }
  return {
    accessToken: data.access_token,
    accessTokenExpiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
}
