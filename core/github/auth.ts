export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresAt: number;
}

export async function startDeviceFlow(_clientId: string): Promise<DeviceFlowStart> {
  throw new Error('not implemented');
}

export async function pollForToken(
  _clientId: string,
  _start: DeviceFlowStart,
  _signal?: AbortSignal,
): Promise<string> {
  throw new Error('not implemented');
}
