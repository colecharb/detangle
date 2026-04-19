const DAY_MS = 86_400_000;

function toDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

function utcDayOfWeek(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

function isoThursdayOf(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const shift = 4 - utcDayOfWeek(t);
  t.setUTCDate(t.getUTCDate() + shift);
  return t;
}

function firstThursdayOfIsoYear(isoYear: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const shift = 4 - utcDayOfWeek(jan4);
  jan4.setUTCDate(jan4.getUTCDate() + shift);
  return jan4;
}

export function isoWeekKey(unixSeconds: number): string {
  const thursday = isoThursdayOf(toDate(unixSeconds));
  const isoYear = thursday.getUTCFullYear();
  const firstThu = firstThursdayOfIsoYear(isoYear);
  const week = 1 + Math.round((thursday.getTime() - firstThu.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isoWeekStart(key: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) throw new Error(`invalid iso week key: ${key}`);
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const firstThu = firstThursdayOfIsoYear(isoYear);
  const mondayMs = firstThu.getTime() + (week - 1) * 7 * DAY_MS - 3 * DAY_MS;
  return Math.floor(mondayMs / 1000);
}

export function weekKeysBetween(fromUnixSeconds: number, toUnixSeconds: number): string[] {
  if (toUnixSeconds < fromUnixSeconds) return [];
  const keys: string[] = [];
  let cursor = fromUnixSeconds;
  let seen = new Set<string>();
  while (cursor <= toUnixSeconds) {
    const key = isoWeekKey(cursor);
    if (!seen.has(key)) {
      keys.push(key);
      seen.add(key);
    }
    cursor += 7 * 86_400;
  }
  const tail = isoWeekKey(toUnixSeconds);
  if (!seen.has(tail)) keys.push(tail);
  return keys;
}
