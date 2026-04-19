export type ViewMode = 'swimlane' | 'authorLanes' | 'heatmap';
export type Tier = 0 | 1 | 2;

export interface CommitNode {
  sha: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  label?: string;
  meta: {
    authorName: string | null;
    committedAt: number;
    message: string;
  };
}

export interface ClusterNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  count: number;
  color: string;
}

export interface BucketNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  color: string;
}

export interface Edge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: 'parent' | 'merge' | 'author-arc';
}

export interface GraphLayout {
  tier: Tier;
  viewMode: ViewMode;
  nodes: CommitNode[] | ClusterNode[] | BucketNode[];
  edges: Edge[];
  bounds: { width: number; height: number };
}
