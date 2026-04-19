import type { Commit } from '../storage/commits';

export interface LaneAssignment {
  lanes: Map<string, number>;
  laneCount: number;
}

export function assignLanes(sorted: Commit[]): LaneAssignment {
  const lanes = new Map<string, number>();
  const active: (string | null)[] = [];
  let maxLanes = 0;

  const take = (sha: string): number => {
    for (let i = 0; i < active.length; i++) {
      if (active[i] === null) {
        active[i] = sha;
        return i;
      }
    }
    active.push(sha);
    return active.length - 1;
  };

  for (const c of sorted) {
    let lane = active.indexOf(c.sha);
    if (lane === -1) {
      lane = take(c.sha);
    }
    lanes.set(c.sha, lane);

    active[lane] = null;

    for (let i = 0; i < c.parents.length; i++) {
      const p = c.parents[i];
      if (active.includes(p)) continue;
      if (i === 0) {
        active[lane] = p;
      } else {
        take(p);
      }
    }

    if (active.length > maxLanes) maxLanes = active.length;
  }

  return { lanes, laneCount: maxLanes };
}
