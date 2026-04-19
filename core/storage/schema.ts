import type { Database } from '@platform/storage';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  last_synced_at INTEGER,
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  parents TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  committed_at INTEGER NOT NULL,
  message TEXT NOT NULL,
  pr_number INTEGER
);

CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_repo_date ON commits(repo_id, committed_at DESC);

CREATE TABLE IF NOT EXISTS refs (
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sha TEXT NOT NULL,
  PRIMARY KEY (repo_id, name)
);
`;

export async function migrate(db: Database): Promise<void> {
  await db.exec(SCHEMA_SQL);
}
