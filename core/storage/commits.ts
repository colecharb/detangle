import type { Database } from '@platform/storage';

export interface Commit {
  sha: string;
  repoId: number;
  parents: string[];
  authorName: string | null;
  authorEmail: string | null;
  committedAt: number;
  message: string;
  prNumber: number | null;
}

export interface CommitFilter {
  dateFrom?: number;
  dateTo?: number;
  authors?: string[];
  branches?: string[];
  shas?: string[];
}

interface CommitRow {
  sha: string;
  repo_id: number;
  parents: string;
  author_name: string | null;
  author_email: string | null;
  committed_at: number;
  message: string;
  pr_number: number | null;
}

function fromRow(row: CommitRow): Commit {
  return {
    sha: row.sha,
    repoId: row.repo_id,
    parents: JSON.parse(row.parents) as string[],
    authorName: row.author_name,
    authorEmail: row.author_email,
    committedAt: row.committed_at,
    message: row.message,
    prNumber: row.pr_number,
  };
}

export async function upsertCommits(
  db: Database,
  commits: Commit[],
): Promise<void> {
  if (commits.length === 0) return;
  for (const c of commits) {
    await db.run(
      `INSERT INTO commits
        (sha, repo_id, parents, author_name, author_email, committed_at, message, pr_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sha) DO UPDATE SET
         repo_id = excluded.repo_id,
         parents = excluded.parents,
         author_name = excluded.author_name,
         author_email = excluded.author_email,
         committed_at = excluded.committed_at,
         message = excluded.message,
         pr_number = COALESCE(excluded.pr_number, commits.pr_number)`,
      [
        c.sha,
        c.repoId,
        JSON.stringify(c.parents),
        c.authorName,
        c.authorEmail,
        c.committedAt,
        c.message,
        c.prNumber,
      ],
    );
  }
}

export async function getCommit(
  db: Database,
  sha: string,
): Promise<Commit | null> {
  const row = await db.get<CommitRow>(
    `SELECT sha, repo_id, parents, author_name, author_email, committed_at, message, pr_number
     FROM commits WHERE sha = ?`,
    [sha],
  );
  return row ? fromRow(row) : null;
}

export async function listCommits(
  db: Database,
  repoId: number,
  filter?: CommitFilter,
): Promise<Commit[]> {
  const clauses: string[] = ['repo_id = ?'];
  const params: unknown[] = [repoId];

  if (filter?.dateFrom !== undefined) {
    clauses.push('committed_at >= ?');
    params.push(filter.dateFrom);
  }
  if (filter?.dateTo !== undefined) {
    clauses.push('committed_at <= ?');
    params.push(filter.dateTo);
  }
  if (filter?.authors?.length) {
    clauses.push(`author_name IN (${filter.authors.map(() => '?').join(',')})`);
    params.push(...filter.authors);
  }
  if (filter?.shas?.length) {
    clauses.push(`sha IN (${filter.shas.map(() => '?').join(',')})`);
    params.push(...filter.shas);
  }

  const rows = await db.all<CommitRow>(
    `SELECT sha, repo_id, parents, author_name, author_email, committed_at, message, pr_number
     FROM commits
     WHERE ${clauses.join(' AND ')}
     ORDER BY committed_at DESC`,
    params,
  );
  return rows.map(fromRow);
}

export async function hasCommit(db: Database, sha: string): Promise<boolean> {
  const row = await db.get<{ one: number }>(
    `SELECT 1 AS one FROM commits WHERE sha = ? LIMIT 1`,
    [sha],
  );
  return row !== null;
}
