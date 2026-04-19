import type { Database } from '@platform/storage';
import { hasCommit, upsertCommits, type Commit } from '../storage/commits';
import { listRefs as listStoredRefs, upsertRefs, type Ref } from '../storage/refs';
import { upsertPulls } from '../storage/pulls';
import { setLastSynced, upsertRepo } from '../storage/repos';
import type { CommitSummary, GitHubClient } from './client';

export interface SyncResult {
  commitsAdded: number;
  refsUpdated: number;
  prsEnriched: number;
  durationMs: number;
}

export async function syncRepo(
  client: GitHubClient,
  db: Database,
  owner: string,
  name: string,
  onProgress?: (stage: string, count: number) => void,
): Promise<SyncResult> {
  const startedAt = Date.now();
  const repo = await upsertRepo(db, owner, name);

  onProgress?.('refs', 0);
  const remoteRefs = await client.listRefs(owner, name);
  const storedRefs = await listStoredRefs(db, repo.id);
  const storedByName = new Map(storedRefs.map((r) => [r.name, r]));

  const changedRefs = remoteRefs.filter(
    (r) => storedByName.get(r.name)?.sha !== r.sha,
  );

  let commitsAdded = 0;
  const seenInThisSync = new Set<string>();

  for (const [i, ref] of changedRefs.entries()) {
    onProgress?.(`commits:${ref.name}`, i);
    let cursor: string | undefined;
    let hitKnown = false;
    while (!hitKnown) {
      const { commits: page, nextCursor } = await client.listCommits(
        owner,
        name,
        ref.sha,
        cursor,
      );
      if (page.length === 0) break;

      const fresh: CommitSummary[] = [];
      for (const c of page) {
        if (seenInThisSync.has(c.sha)) {
          hitKnown = true;
          break;
        }
        if (await hasCommit(db, c.sha)) {
          hitKnown = true;
          break;
        }
        seenInThisSync.add(c.sha);
        fresh.push(c);
      }

      if (fresh.length > 0) {
        const rows: Commit[] = fresh.map((c) => ({
          sha: c.sha,
          repoId: repo.id,
          parents: c.parents,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          committedAt: c.committedAt,
          message: c.message,
          prNumber: parsePrNumberFromMessage(c.message),
        }));
        await upsertCommits(db, rows);
        commitsAdded += rows.length;
      }

      if (hitKnown || !nextCursor) break;
      cursor = nextCursor;
    }
  }

  const newRefs: Ref[] = remoteRefs.map((r) => ({
    repoId: repo.id,
    name: r.name,
    type: r.type,
    sha: r.sha,
  }));
  await upsertRefs(db, newRefs);

  const syncedAt = Math.floor(Date.now() / 1000);
  await setLastSynced(db, repo.id, syncedAt);

  onProgress?.('pulls', 0);
  let prsEnriched = 0;
  try {
    const { commitsUpdated } = await enrichWithPullRequests(client, db, owner, name);
    prsEnriched = commitsUpdated;
  } catch (err) {
    console.warn('[sync] PR enrichment failed:', err);
  }

  return {
    commitsAdded,
    refsUpdated: changedRefs.length,
    prsEnriched,
    durationMs: Date.now() - startedAt,
  };
}

export async function enrichWithPullRequests(
  client: GitHubClient,
  db: Database,
  owner: string,
  name: string,
): Promise<{ commitsUpdated: number }> {
  const repo = await upsertRepo(db, owner, name);
  const pulls = await client.listPulls(owner, name);

  await upsertPulls(
    db,
    repo.id,
    pulls.map((p) => ({
      number: p.number,
      title: p.title,
      mergeCommitSha: p.mergeCommitSha,
    })),
  );

  let updated = 0;
  for (const p of pulls) {
    if (!p.mergeCommitSha) continue;
    const result = await db.run(
      `UPDATE commits SET pr_number = ? WHERE sha = ? AND repo_id = ? AND pr_number IS NULL`,
      [p.number, p.mergeCommitSha, repo.id],
    );
    updated += result.changes;
  }
  return { commitsUpdated: updated };
}

function parsePrNumberFromMessage(message: string): number | null {
  const mergeMatch = message.match(/Merge pull request #(\d+)/);
  if (mergeMatch) return Number(mergeMatch[1]);
  const squashMatch = message.match(/\(#(\d+)\)\s*$/m);
  if (squashMatch) return Number(squashMatch[1]);
  return null;
}
