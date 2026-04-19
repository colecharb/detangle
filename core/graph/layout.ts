import type { Commit } from '../storage/commits';
import type { Ref } from '../storage/refs';
import { topoSort } from './topology';
import { assignLanes } from './laneAssignment';
import type { CommitNode, Edge, GraphLayout, Tier, ViewMode } from './types';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 20;
const NODE_RADIUS = 5;
const PADDING = 40;

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
  if (viewMode === 'swimlane' && tier === 2) {
    return tier2LayoutSwimLane(commits, refs);
  }
  throw new Error(`layout not implemented: viewMode=${viewMode} tier=${tier}`);
}

export function tier0LayoutSwimLane(_commits: Commit[]): GraphLayout {
  throw new Error('not implemented (phase 3)');
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
