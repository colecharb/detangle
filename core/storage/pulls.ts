import type { Database } from '@platform/storage';

export interface Pull {
  repoId: number;
  number: number;
  title: string;
  mergeCommitSha: string | null;
}

interface PullRow {
  repo_id: number;
  number: number;
  title: string;
  merge_commit_sha: string | null;
}

export async function upsertPulls(
  db: Database,
  repoId: number,
  pulls: { number: number; title: string; mergeCommitSha: string | null }[],
): Promise<void> {
  if (pulls.length === 0) return;
  for (const p of pulls) {
    await db.run(
      `INSERT INTO pulls (repo_id, number, title, merge_commit_sha)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id, number) DO UPDATE SET
         title = excluded.title,
         merge_commit_sha = excluded.merge_commit_sha`,
      [repoId, p.number, p.title, p.mergeCommitSha],
    );
  }
}

export async function listPulls(db: Database, repoId: number): Promise<Pull[]> {
  const rows = await db.all<PullRow>(
    `SELECT repo_id, number, title, merge_commit_sha FROM pulls WHERE repo_id = ? ORDER BY number DESC`,
    [repoId],
  );
  return rows.map((r) => ({
    repoId: r.repo_id,
    number: r.number,
    title: r.title,
    mergeCommitSha: r.merge_commit_sha,
  }));
}
