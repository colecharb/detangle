import type { Database } from '@platform/storage';

export interface Ref {
  repoId: number;
  name: string;
  type: 'branch' | 'tag';
  sha: string;
}

interface RefRow {
  repo_id: number;
  name: string;
  type: 'branch' | 'tag';
  sha: string;
}

export async function upsertRefs(db: Database, refs: Ref[]): Promise<void> {
  if (refs.length === 0) return;
  for (const r of refs) {
    await db.run(
      `INSERT INTO refs (repo_id, name, type, sha) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id, name) DO UPDATE SET
         type = excluded.type,
         sha = excluded.sha`,
      [r.repoId, r.name, r.type, r.sha],
    );
  }
}

export async function listRefs(db: Database, repoId: number): Promise<Ref[]> {
  const rows = await db.all<RefRow>(
    `SELECT repo_id, name, type, sha FROM refs WHERE repo_id = ? ORDER BY type, name`,
    [repoId],
  );
  return rows.map((r) => ({
    repoId: r.repo_id,
    name: r.name,
    type: r.type,
    sha: r.sha,
  }));
}
