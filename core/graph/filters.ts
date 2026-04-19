import type { CommitFilter } from '../storage/commits';

export interface GraphFilter {
  dateFrom?: number;
  dateTo?: number;
  authors?: string[];
  branches?: string[];
  paths?: string[];
}

export function filterToCommitFilter(
  _filter: GraphFilter,
  _pathSha: Set<string> | null,
): CommitFilter {
  throw new Error('not implemented');
}

export function encodeFilterToUrl(_filter: GraphFilter): string {
  throw new Error('not implemented');
}

export function decodeFilterFromUrl(_params: URLSearchParams): GraphFilter {
  throw new Error('not implemented');
}
