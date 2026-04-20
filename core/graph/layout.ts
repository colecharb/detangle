import type { Commit } from '../storage/commits';
import type { Ref } from '../storage/refs';
import { topoSort } from './topology';
import { assignLanes } from './laneAssignment';
import { isoWeekKey, isoWeekStart, weekKeysBetween } from './time';
import type {
  BucketNode,
  ClusterNode,
  CommitNode,
  Edge,
  GraphLayout,
  Tier,
  ViewMode,
} from './types';

export interface LayoutContext {
  prTitles?: Map<number, string>;
}

const ROW_HEIGHT = 28;
const LANE_WIDTH = 20;
const NODE_RADIUS = 5;
const PADDING = 40;

const BUCKET_WIDTH = 2000;

const BUCKET_PALETTE = ['#e5e5e5', '#bae6fd', '#60a5fa', '#2563eb', '#1e3a8a'];

const LANE_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#db2777',
];

function laneColor(lane: number): string {
  return LANE_PALETTE[lane % LANE_PALETTE.length];
}

export function layoutGraph(
  commits: Commit[],
  refs: Ref[],
  viewMode: ViewMode,
  tier: Tier,
  context?: LayoutContext,
): GraphLayout {
  if (viewMode === 'swimlane') {
    if (tier === 0) return tier0LayoutSwimLane(commits);
    if (tier === 1) return tier1LayoutSwimLane(commits, refs, context?.prTitles);
    if (tier === 2) return tier2LayoutSwimLane(commits, refs);
  }
  throw new Error(`layout not implemented: viewMode=${viewMode} tier=${tier}`);
}

function quintileColor(count: number, sortedCounts: number[]): string {
  if (count === 0 || sortedCounts.length === 0) return BUCKET_PALETTE[0];
  const q = (p: number) =>
    sortedCounts[Math.min(sortedCounts.length - 1, Math.floor(p * sortedCounts.length))];
  const thresholds = [q(0.2), q(0.4), q(0.6), q(0.8)];
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]) return BUCKET_PALETTE[i + 1];
  }
  return BUCKET_PALETTE[4];
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatWeekLabel(weekStartUnix: number, count: number): string {
  const d = new Date(weekStartUnix * 1000);
  const date = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return count > 0 ? `${date} · ${count}` : date;
}

export function tier0LayoutSwimLane(commits: Commit[]): GraphLayout {
  if (commits.length === 0) {
    return {
      tier: 0,
      viewMode: 'swimlane',
      nodes: [],
      edges: [],
      bounds: { width: PADDING * 2 + BUCKET_WIDTH, height: PADDING * 2 },
    };
  }

  // Walk commits in the same topo order tier 2 uses so each week's bucket
  // occupies the exact row range its commits land in.
  const sorted = topoSort(commits);
  const counts = new Map<string, number>();
  const firstRow = new Map<string, number>();
  const lastRow = new Map<string, number>();

  for (let row = 0; row < sorted.length; row++) {
    const key = isoWeekKey(sorted[row].committedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstRow.has(key)) firstRow.set(key, row);
    lastRow.set(key, row);
  }

  const sortedCounts = [...counts.values()].sort((a, b) => a - b);

  const keys = [...counts.keys()].sort((a, b) => {
    const fa = firstRow.get(a) ?? 0;
    const fb = firstRow.get(b) ?? 0;
    return fa - fb;
  });

  const nodes: BucketNode[] = keys.map((key) => {
    const count = counts.get(key) ?? 0;
    const rowStart = firstRow.get(key) ?? 0;
    const rowEnd = lastRow.get(key) ?? rowStart;
    const y = PADDING + rowStart * ROW_HEIGHT;
    const height = (rowEnd - rowStart + 1) * ROW_HEIGHT;
    return {
      id: key,
      x: PADDING,
      y,
      width: BUCKET_WIDTH,
      height,
      count,
      color: quintileColor(count, sortedCounts),
      label: formatWeekLabel(isoWeekStart(key), count),
    };
  });

  return {
    tier: 0,
    viewMode: 'swimlane',
    nodes,
    edges: [],
    bounds: {
      width: PADDING * 2 + BUCKET_WIDTH,
      height: PADDING * 2 + sorted.length * ROW_HEIGHT,
    },
  };
}

interface ClusterAccumulator {
  key: string;
  prNumber: number | null;
  authorName: string | null;
  lane: number;
  firstRow: number;
  lastRow: number;
  count: number;
  firstMessage: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function tier1LayoutSwimLane(
  commits: Commit[],
  _refs: Ref[],
  prTitles?: Map<number, string>,
): GraphLayout {
  const sorted = topoSort(commits);
  const { lanes, laneCount } = assignLanes(sorted);

  const prClusters = new Map<number, ClusterAccumulator>();
  const runClusters: ClusterAccumulator[] = [];
  let currentRun: ClusterAccumulator | null = null;

  for (let row = 0; row < sorted.length; row++) {
    const c = sorted[row];
    const lane = lanes.get(c.sha) ?? 0;

    if (c.prNumber !== null) {
      const existing = prClusters.get(c.prNumber);
      if (existing) {
        existing.firstRow = Math.min(existing.firstRow, row);
        existing.lastRow = Math.max(existing.lastRow, row);
        existing.count += 1;
      } else {
        prClusters.set(c.prNumber, {
          key: `pr-${c.prNumber}`,
          prNumber: c.prNumber,
          authorName: c.authorName,
          lane,
          firstRow: row,
          lastRow: row,
          count: 1,
          firstMessage: c.message.split('\n')[0],
        });
      }
      currentRun = null;
      continue;
    }

    if (
      currentRun &&
      currentRun.authorName === c.authorName &&
      currentRun.lane === lane &&
      currentRun.lastRow === row - 1
    ) {
      currentRun.lastRow = row;
      currentRun.count += 1;
    } else {
      currentRun = {
        key: `run-${row}`,
        prNumber: null,
        authorName: c.authorName,
        lane,
        firstRow: row,
        lastRow: row,
        count: 1,
        firstMessage: c.message.split('\n')[0],
      };
      runClusters.push(currentRun);
    }
  }

  const allClusters = [...prClusters.values(), ...runClusters];

  const nodes: ClusterNode[] = allClusters.map((cluster) => {
    const x = PADDING + cluster.lane * LANE_WIDTH - LANE_WIDTH / 2;
    const y = PADDING + cluster.firstRow * ROW_HEIGHT;
    const height = (cluster.lastRow - cluster.firstRow + 1) * ROW_HEIGHT;

    let label: string;
    if (cluster.prNumber !== null) {
      const title = prTitles?.get(cluster.prNumber);
      const suffix = `· ${cluster.count} commit${cluster.count === 1 ? '' : 's'}`;
      label = title
        ? `#${cluster.prNumber} ${truncate(title, 40)} ${suffix}`
        : `#${cluster.prNumber} ${suffix}`;
    } else if (cluster.count === 1) {
      label = truncate(cluster.firstMessage, 40);
    } else {
      label = `${cluster.authorName ?? 'unknown'} · ${cluster.count}`;
    }

    return {
      id: cluster.key,
      x,
      y,
      width: LANE_WIDTH,
      height,
      label,
      count: cluster.count,
      color: laneColor(cluster.lane),
    };
  });

  return {
    tier: 1,
    viewMode: 'swimlane',
    nodes,
    edges: [],
    bounds: {
      width: PADDING * 2 + Math.max(1, laneCount) * LANE_WIDTH,
      height: PADDING * 2 + sorted.length * ROW_HEIGHT,
    },
  };
}

export function tier2LayoutSwimLane(
  commits: Commit[],
  _refs: Ref[],
): GraphLayout {
  const sorted = topoSort(commits);
  const { lanes, laneCount } = assignLanes(sorted);

  const nodes: CommitNode[] = sorted.map((c, row) => {
    const lane = lanes.get(c.sha) ?? 0;
    return {
      sha: c.sha,
      x: PADDING + lane * LANE_WIDTH,
      y: PADDING + row * ROW_HEIGHT,
      radius: NODE_RADIUS,
      color: laneColor(lane),
      label: c.message.split('\n')[0],
      meta: {
        authorName: c.authorName,
        committedAt: c.committedAt,
        message: c.message,
      },
    };
  });

  const byShaNode = new Map<string, CommitNode>();
  for (const n of nodes) byShaNode.set(n.sha, n);

  const edges: Edge[] = [];
  for (const c of sorted) {
    const child = byShaNode.get(c.sha);
    if (!child) continue;
    const isMerge = c.parents.length >= 2;
    for (const p of c.parents) {
      const parent = byShaNode.get(p);
      if (!parent) continue;
      edges.push({
        from: { x: child.x, y: child.y },
        to: { x: parent.x, y: parent.y },
        kind: isMerge ? 'merge' : 'parent',
      });
    }
  }

  return {
    tier: 2,
    viewMode: 'swimlane',
    nodes,
    edges,
    bounds: {
      width: PADDING * 2 + Math.max(1, laneCount) * LANE_WIDTH,
      height: PADDING * 2 + sorted.length * ROW_HEIGHT,
    },
  };
}

export function tier0LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented (phase 4)');
}

export function tier1LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented (phase 4)');
}

export function tier2LayoutAuthorLanes(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented (phase 4)');
}
