import type { Commit } from '../storage/commits';

export function topoSort(commits: Commit[]): Commit[] {
  const bySha = new Map<string, Commit>();
  for (const c of commits) bySha.set(c.sha, c);

  const childCount = new Map<string, number>();
  for (const c of commits) childCount.set(c.sha, 0);
  for (const c of commits) {
    for (const p of c.parents) {
      if (bySha.has(p)) childCount.set(p, (childCount.get(p) ?? 0) + 1);
    }
  }

  const roots: Commit[] = [];
  for (const c of commits) {
    if ((childCount.get(c.sha) ?? 0) === 0) roots.push(c);
  }
  roots.sort((a, b) => b.committedAt - a.committedAt);

  const result: Commit[] = [];
  const remaining = new Map(childCount);
  const heap = [...roots];

  while (heap.length > 0) {
    heap.sort((a, b) => b.committedAt - a.committedAt);
    const c = heap.shift()!;
    result.push(c);
    for (const p of c.parents) {
      if (!bySha.has(p)) continue;
      const next = (remaining.get(p) ?? 0) - 1;
      remaining.set(p, next);
      if (next === 0) heap.push(bySha.get(p)!);
    }
  }

  return result;
}
