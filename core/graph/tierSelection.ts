import type { Tier } from './types';

export function selectTier(
  _zoomLevel: number,
  _viewportWidth: number,
  _totalCommits: number,
): Tier {
  throw new Error('not implemented');
}
