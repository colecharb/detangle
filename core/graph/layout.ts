import type { Commit } from '../storage/commits';
import type { Ref } from '../storage/refs';
import type { GraphLayout, Tier, ViewMode } from './types';

export function layoutGraph(
  _commits: Commit[],
  _refs: Ref[],
  _viewMode: ViewMode,
  _tier: Tier,
): GraphLayout {
  throw new Error('not implemented');
}

export function tier0LayoutSwimLane(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented');
}

export function tier1LayoutSwimLane(
  _commits: Commit[],
  _refs: Ref[],
): GraphLayout {
  throw new Error('not implemented');
}

export function tier2LayoutSwimLane(
  _commits: Commit[],
  _refs: Ref[],
): GraphLayout {
  throw new Error('not implemented');
}

export function tier0LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented');
}

export function tier1LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented');
}

export function tier2LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented');
}
