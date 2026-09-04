import { App, TFile } from "obsidian";
import { isoWeek, pad2, weekdayJa } from "../utils/date";
import { ensureFolder, joinPath, lineDates, parseItemLine, scanHeadings } from "./markdown";

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

interface DateHeadingStyle { level: number; iso: boolean; weekday: boolean; blankAfterHeading: boolean; }

const DEFAULT_STYLE: DateHeadingStyle = { level: 2, iso: false, weekday: true, blankAfterHeading: true };

export function monthFilePath(folder: string, year: number, month: number): string {
  return joinPath(folder, `${year}-${pad2(month)}.md`);
}

export function renderEntryLine(entry: GoogleTechoEntry): string {
  return `- ${entry.time ? `${entry.time} ` : ""}${entry.title} %%gcal:${entry.key}%%`;
}

/** Mirrors `entries` into `<folder>/<YYYY-MM>.md`, keeping the file's existing week/date structure. */
export async function applyGoogleEvents(app: App, folder: string, year: number, month: number, entries: GoogleTechoEntry[]): Promise<GoogleSyncResult> {
  const path = monthFilePath(folder, year, month);
  let file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    await ensureFolder(app, folder);
    file = await app.vault.create(path, `# ${year}年${month}月\n`);
  }

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
  for (const entry of insertions) lines = insertEntry(lines, entry, style);

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

function detectDateHeadingStyle(lines: string[]): DateHeadingStyle {
  const heading = scanHeadings(lines).find((info) => info.kind === "date");
  if (!heading) return DEFAULT_STYLE;
  const text = lines[heading.index];
  return {
    level: heading.level,
    iso: /\d{4}-\d{2}-\d{2}/.test(text),
    weekday: /\([^)]*\)\s*$/.test(text),
    blankAfterHeading: (lines[heading.index + 1] ?? "").trim() === "",
  };
}

function renderDateHeading(date: string, style: DateHeadingStyle): string {
  const hashes = "#".repeat(style.level);
  if (style.iso) return `${hashes} ${date}`;
  const [, month, day] = date.split("-").map(Number);
  return `${hashes} ${month}月${day}日${style.weekday ? `(${weekdayJa(date)})` : ""}`;
}

function insertEntry(lines: string[], entry: GoogleTechoEntry, style: DateHeadingStyle): string[] {
  const text = renderEntryLine(entry);
  const dates = lineDates(lines);
  const headings = scanHeadings(lines);
  const headingIndexes = new Set(headings.map((info) => info.index));

  // Append after the day's last existing line. The heading itself is not content, or an empty
  // day would take the item before the blank line that follows its heading.
  let lastOwned = -1;
  for (let index = 0; index < lines.length; index++) {
    if (dates[index] === entry.date && lines[index].trim() !== "" && !headingIndexes.has(index)) lastOwned = index;
  }
  if (lastOwned >= 0) {
    const next = [...lines];
    next.splice(lastOwned + 1, 0, text);
    return next;
  }

  const heading = headings.find((info) => info.kind === "date" && info.date === entry.date);
  if (heading) {
    // The day exists but is empty; keep the blank line the file puts under its headings, and
    // do not let the item run straight into the next heading.
    const offset = (lines[heading.index + 1] ?? "").trim() === "" ? 2 : 1;
    const position = heading.index + offset;
    const block = /^#{1,6}\s/.test(lines[position] ?? "") ? [text, ""] : [text];
    const next = [...lines];
    next.splice(position, 0, ...block);
    return next;
  }

  const position = findNewDateHeadingPosition(lines, entry.date);
  const block = style.blankAfterHeading ? [renderDateHeading(entry.date, style), "", text] : [renderDateHeading(entry.date, style), text];
  if (position > 0 && lines[position - 1]?.trim() !== "") block.unshift("");
  if (position < lines.length && lines[position]?.trim() !== "") block.push("");
  const next = [...lines];
  next.splice(position, 0, ...block);
  return next;
}

/**
 * Picks where a missing day belongs. When the file is organised into `## weekNN` sections the
 * day is placed inside the section for its ISO week; otherwise it is placed in date order.
 */
function findNewDateHeadingPosition(lines: string[], date: string): number {
  const headings = scanHeadings(lines);
  const weeks = headings.filter((info) => info.kind === "week");
  let start = 0;
  let end = lines.length;

  if (weeks.length) {
    const target = isoWeek(date);
    const exact = weeks.find((info) => info.week === target);
    if (exact) {
      start = exact.index + 1;
      end = weeks.find((info) => info.index > exact.index)?.index ?? lines.length;
    } else {
      const later = weeks.find((info) => (info.week ?? 0) > target);
      if (later) {
        const previous = [...weeks].reverse().find((info) => info.index < later.index);
        start = previous ? previous.index + 1 : 0;
        end = later.index;
      } else {
        start = weeks[weeks.length - 1].index + 1;
      }
    }
  }

  const next = headings.find((info) => info.kind === "date" && info.index >= start && info.index < end && info.date! > date);
  if (next) return next.index;

  let position = end;
  while (position > start && lines[position - 1].trim() === "") position--;
  return position;
}
