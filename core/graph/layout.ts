import type { Commit } from '../storage/commits';
import type { Ref } from '../storage/refs';
import { topoSort } from './topology';
import { assignLanes } from './laneAssignment';
import { isoWeekKey, isoWeekStart, weekKeysBetween } from './time';
import type {
  BucketNode,
  CommitNode,
  Edge,
  GraphLayout,
  Tier,
  ViewMode,
} from './types';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 20;
const NODE_RADIUS = 5;
const PADDING = 40;

const BUCKET_WIDTH = 120;
const BUCKET_GAP = 4;
const BUCKET_MIN_HEIGHT = 16;
const BUCKET_HEIGHT_PER_COMMIT = 0.8;
const BUCKET_HEIGHT_COMMIT_CAP = 100;

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
): GraphLayout {
  if (viewMode === 'swimlane') {
    if (tier === 0) return tier0LayoutSwimLane(commits);
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

  const counts = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const c of commits) {
    const key = isoWeekKey(c.committedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (c.committedAt < minTs) minTs = c.committedAt;
    if (c.committedAt > maxTs) maxTs = c.committedAt;
  }

  const allKeys = weekKeysBetween(minTs, maxTs);
  const sortedCounts = [...counts.values()].sort((a, b) => a - b);

  const orderedNewestFirst = [...allKeys].sort(
    (a, b) => isoWeekStart(b) - isoWeekStart(a),
  );

  const nodes: BucketNode[] = [];
  let cursorY = PADDING;
  for (const key of orderedNewestFirst) {
    const count = counts.get(key) ?? 0;
    const height =
      BUCKET_MIN_HEIGHT +
      Math.min(count, BUCKET_HEIGHT_COMMIT_CAP) * BUCKET_HEIGHT_PER_COMMIT;
    nodes.push({
      id: key,
      x: PADDING,
      y: cursorY,
      width: BUCKET_WIDTH,
      height,
      count,
      color: quintileColor(count, sortedCounts),
    });
    cursorY += height + BUCKET_GAP;
  }

  return {
    tier: 0,
    viewMode: 'swimlane',
    nodes,
    edges: [],
    bounds: {
      width: PADDING * 2 + BUCKET_WIDTH,
      height: PADDING + cursorY,
    },
  };
}

export function tier1LayoutSwimLane(
  _commits: Commit[],
  _refs: Ref[],
): GraphLayout {
  throw new Error('not implemented (phase 3)');
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
