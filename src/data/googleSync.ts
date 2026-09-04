import { App } from "obsidian";
import { detectDateHeadingStyle, insertItemLine, lineDates, monthFilePath, openMonthFile, parseItemLine } from "./markdown";

/** One line's worth of Google Calendar data, already resolved to a single techo day. */
export interface GoogleTechoEntry {
  /** Stable identity written into the line marker. Multi-day events get one key per day. */
  key: string;
  date: string;
  time?: string;
  title: string;
}

export interface GoogleSyncResult {
  path: string;
  added: number;
  updated: number;
  /** Lines that already held the same event and were claimed by adding a marker. */
  adopted: number;
  removed: number;
}

export function renderEntryLine(entry: GoogleTechoEntry): string {
  return `- ${entry.time ? `${entry.time} ` : ""}${entry.title} %%gcal:${entry.key}%%`;
}

/** Mirrors `entries` into `<folder>/<YYYY-MM>.md`, keeping the file's existing week/date structure. */
export async function applyGoogleEvents(app: App, folder: string, year: number, month: number, entries: GoogleTechoEntry[]): Promise<GoogleSyncResult> {
  const path = monthFilePath(folder, year, month);
  const file = await openMonthFile(app, folder, year, month);

  const original = await app.vault.read(file);
  let lines = original.split(/\r?\n/);
  const style = detectDateHeadingStyle(lines);
  const result: GoogleSyncResult = { path, added: 0, updated: 0, adopted: 0, removed: 0 };

  const marked = collectMarkedLines(lines);
  const wanted = new Map(entries.map((entry) => [entry.key, entry]));

  // Replacements and removals are index-stable until applied, so decide everything first.
  const replacements = new Map<number, string>();
  const removals = new Set<number>();
  const insertions: GoogleTechoEntry[] = [];
  const claimed = new Set<number>();

  for (const entry of entries) {
    const existing = marked.get(entry.key);
    const desired = renderEntryLine(entry);
    if (existing) {
      if (existing.date === entry.date && lines[existing.index] === desired) continue;
      if (existing.date === entry.date) {
        replacements.set(existing.index, desired);
        result.updated++;
      } else {
        removals.add(existing.index);
        insertions.push(entry);
        result.updated++;
      }
      continue;
    }

    const adoptable = findAdoptableLine(lines, entry, claimed);
    if (adoptable !== null) {
      claimed.add(adoptable);
      replacements.set(adoptable, `${lines[adoptable].replace(/\s+$/, "")} %%gcal:${entry.key}%%`);
      result.adopted++;
      continue;
    }

    insertions.push(entry);
    result.added++;
  }

  for (const [key, existing] of marked) {
    if (wanted.has(key)) continue;
    removals.add(existing.index);
    result.removed++;
  }

  for (const [index, text] of replacements) lines[index] = text;
  if (removals.size) lines = lines.filter((_, index) => !removals.has(index));
  for (const entry of insertions) lines = insertItemLine(lines, entry.date, renderEntryLine(entry), style);

  const updated = lines.join("\n");
  if (updated !== original) await app.vault.modify(file, updated);
  return result;
}

function collectMarkedLines(lines: string[]): Map<string, { index: number; date: string }> {
  const dates = lineDates(lines);
  const marked = new Map<string, { index: number; date: string }>();
  lines.forEach((line, index) => {
    const parsed = parseItemLine(line);
    if (parsed?.googleId && !marked.has(parsed.googleId)) marked.set(parsed.googleId, { index, date: dates[index] });
  });
  return marked;
}

/**
 * Finds an unmarked line that already spells out this event, so a techo filled in by hand
 * is claimed on the first sync instead of being duplicated.
 */
function findAdoptableLine(lines: string[], entry: GoogleTechoEntry, claimed: Set<number>): number | null {
  const dates = lineDates(lines);
  for (let index = 0; index < lines.length; index++) {
    if (dates[index] !== entry.date || claimed.has(index)) continue;
    const parsed = parseItemLine(lines[index]);
    if (!parsed || parsed.googleId) continue;
    if ((parsed.time ?? "") === (entry.time ?? "") && parsed.title === entry.title) return index;
  }
  return null;
}
