import type { Database } from '@platform/storage';

export interface Repo {
  id: number;
  owner: string;
  name: string;
  lastSyncedAt: number | null;
}

interface RepoRow {
  id: number;
  owner: string;
  name: string;
  last_synced_at: number | null;
}

function fromRow(row: RepoRow): Repo {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function upsertRepo(
  db: Database,
  owner: string,
  name: string,
): Promise<Repo> {
  await db.run(
    `INSERT INTO repos (owner, name) VALUES (?, ?)
     ON CONFLICT(owner, name) DO NOTHING`,
    [owner, name],
  );
  const row = await db.get<RepoRow>(
    `SELECT id, owner, name, last_synced_at FROM repos WHERE owner = ? AND name = ?`,
    [owner, name],
  );
  if (!row) throw new Error(`Failed to upsert repo ${owner}/${name}`);
  return fromRow(row);
}

export async function getRepo(
  db: Database,
  owner: string,
  name: string,
): Promise<Repo | null> {
  const row = await db.get<RepoRow>(
    `SELECT id, owner, name, last_synced_at FROM repos WHERE owner = ? AND name = ?`,
    [owner, name],
  );
  return row ? fromRow(row) : null;
}

export async function listRepos(db: Database): Promise<Repo[]> {
  const rows = await db.all<RepoRow>(
    `SELECT id, owner, name, last_synced_at FROM repos ORDER BY owner, name`,
  );
  return rows.map(fromRow);
}

export async function setLastSynced(
  db: Database,
  repoId: number,
  at: number,
): Promise<void> {
  await db.run(`UPDATE repos SET last_synced_at = ? WHERE id = ?`, [at, repoId]);
}
