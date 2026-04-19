export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresAt: number;
}

const DEFAULT_BASE = 'https://github.com';
const SCOPE = 'repo';

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

export async function startDeviceFlow(
  clientId: string,
  authBase: string = DEFAULT_BASE,
): Promise<DeviceFlowStart> {
  const res = await fetch(`${authBase}/login/device/code`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, scope: SCOPE }),
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
): Promise<string> {
  let interval = start.intervalSeconds;
  while (Math.floor(Date.now() / 1000) < start.expiresAt) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await sleep(interval * 1000, signal);

    const res = await fetch(`${authBase}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Device flow poll failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
      interval?: number;
    };
    if (data.access_token) return data.access_token;
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
