import { App, TFile } from "obsidian";
import { ItemKind, TechoItem } from "../types";
import { isoWeek, pad2, weekdayJa } from "../utils/date";

const MONTH_HEADING = /^#{1,6}\s+(\d{4})年(\d{1,2})月\s*$/;
const ISO_DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
const JP_DATE_HEADING = /^#{1,6}\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/;
const WEEK_HEADING = /^#{1,6}\s+week\s*(\d{1,2})\s*$/i;
const HEADING = /^(#{1,6})\s+/;
/**
 * A full-width space before the bullet is a Japanese-input artefact and still marks an item.
 * ASCII indentation is not: it marks a note nested under the item above.
 */
const ITEM = /^　*-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/;

/** Marks a line as owned by a Google Calendar event so re-syncing updates it instead of duplicating it. */
export const GOOGLE_MARKER = /\s*%%gcal:([^%\s]+)%%\s*$/;

export type HeadingKind = "month" | "date" | "week" | "other";
export interface HeadingInfo { index: number; level: number; kind: HeadingKind; date?: string; week?: number; }

/** Classifies every heading in the file and resolves 9月1日-style headings against the enclosing 年月 heading. */
export function scanHeadings(lines: string[]): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  let year = 0;
  let month = 0;

  lines.forEach((line, index) => {
    const level = line.match(HEADING)?.[1].length;
    if (!level) return;

    const monthHeading = line.match(MONTH_HEADING);
    if (monthHeading) {
      year = Number(monthHeading[1]);
      month = Number(monthHeading[2]);
      headings.push({ index, level, kind: "month" });
      return;
    }

    const isoHeading = line.match(ISO_DATE_HEADING);
    if (isoHeading) {
      year = Number(isoHeading[1]);
      month = Number(isoHeading[2]);
      headings.push({ index, level, kind: "date", date: `${isoHeading[1]}-${isoHeading[2]}-${isoHeading[3]}` });
      return;
    }

    const jpHeading = line.match(JP_DATE_HEADING);
    if (jpHeading && year && month === Number(jpHeading[1])) {
      headings.push({ index, level, kind: "date", date: `${year}-${pad2(month)}-${pad2(Number(jpHeading[2]))}` });
      return;
    }

    const weekHeading = line.match(WEEK_HEADING);
    headings.push(weekHeading ? { index, level, kind: "week", week: Number(weekHeading[1]) } : { index, level, kind: "other" });
  });

  return headings;
}

/**
 * Maps every line to the date whose section it belongs to. Non-date headings such as
 * `## week36`, `### 日付未定` and `### タスク` end the previous date section rather than
 * extending it, so their items are not attributed to the day above them.
 */
export function lineDates(lines: string[]): string[] {
  const byIndex = new Map(scanHeadings(lines).map((heading) => [heading.index, heading]));
  const dates: string[] = [];
  let current = "";
  for (let index = 0; index < lines.length; index++) {
    const heading = byIndex.get(index);
    if (heading) current = heading.kind === "date" ? heading.date! : "";
    dates.push(current);
  }
  return dates;
}

export function parseMarkdown(text: string, filePath: string): TechoItem[] {
  const lines = text.split(/\r?\n/);
  const dates = lineDates(lines);
  const items: TechoItem[] = [];

  lines.forEach((line, index) => {
    const date = dates[index];
    if (!date) return;
    const parsed = parseItemLine(line);
    if (!parsed) return;
    items.push({
      id: `${filePath}:${index + 1}`,
      date,
      time: parsed.time,
      title: parsed.title,
      kind: parsed.kind,
      checked: parsed.checked,
      sourceLine: index + 1,
      googleId: parsed.googleId,
    });
  });
  return items;
}

export interface ParsedItemLine { time?: string; title: string; kind: ItemKind; checked: boolean; googleId?: string; }

/** Splits an item line into its parts, or null if the line is not a techo item. */
export function parseItemLine(line: string): ParsedItemLine | null {
  const marker = line.match(GOOGLE_MARKER);
  const match = (marker ? line.slice(0, marker.index) : line).match(ITEM);
  if (!match) return null;
  return {
    time: match[2] || undefined,
    title: match[3],
    kind: match[1] !== undefined ? "task" : "event",
    checked: Boolean(match[1] && match[1].toLowerCase() === "x"),
    googleId: marker?.[1],
  };
}

export function renderItemLine(item: { kind: ItemKind; checked: boolean; time?: string; title: string }): string {
  const checkbox = item.kind === "task" ? `[${item.checked ? "x" : " "}] ` : "";
  return `- ${checkbox}${item.time ? `${item.time} ` : ""}${item.title}`;
}

export function joinPath(folder: string, name: string): string {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${name}` : name;
}

export function monthFilePath(folder: string, year: number, month: number): string {
  return joinPath(folder, `${year}-${pad2(month)}.md`);
}

/** Creates every missing segment of `folder`, so the first write into a fresh vault does not fail. */
export async function ensureFolder(app: App, folder: string): Promise<void> {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  if (!prefix) return;
  let current = "";
  for (const segment of prefix.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (app.vault.getAbstractFileByPath(current)) continue;
    try {
      await app.vault.createFolder(current);
    } catch {
      // Another writer may have created it first; a real failure surfaces on the following create().
    }
  }
}

/** The techo keeps one file per month. Returns it, creating the file and its folder if needed. */
export async function openMonthFile(app: App, folder: string, year: number, month: number): Promise<TFile> {
  const path = monthFilePath(folder, year, month);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  await ensureFolder(app, folder);
  return app.vault.create(path, `# ${year}年${month}月\n`);
}

export interface DateHeadingStyle { level: number; iso: boolean; weekday: boolean; blankAfterHeading: boolean; }

const DEFAULT_DATE_HEADING_STYLE: DateHeadingStyle = { level: 2, iso: false, weekday: true, blankAfterHeading: true };

/** Reads back how this file writes its day headings, so new ones match what is already there. */
export function detectDateHeadingStyle(lines: string[]): DateHeadingStyle {
  const heading = scanHeadings(lines).find((info) => info.kind === "date");
  if (!heading) return DEFAULT_DATE_HEADING_STYLE;
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

/** Appends `text` to `date`'s section, creating the day heading in the right place if it is missing. */
export function insertItemLine(lines: string[], date: string, text: string, style: DateHeadingStyle): string[] {
  const dates = lineDates(lines);
  const headings = scanHeadings(lines);
  const headingIndexes = new Set(headings.map((info) => info.index));
  const next = [...lines];

  // Append after the day's last existing line. The heading itself is not content, or an empty
  // day would take the item before the blank line that follows its heading.
  let lastOwned = -1;
  for (let index = 0; index < lines.length; index++) {
    if (dates[index] === date && lines[index].trim() !== "" && !headingIndexes.has(index)) lastOwned = index;
  }
  if (lastOwned >= 0) {
    next.splice(lastOwned + 1, 0, text);
    return next;
  }

  const heading = headings.find((info) => info.kind === "date" && info.date === date);
  if (heading) {
    // The day exists but is empty; keep the blank line the file puts under its headings, and
    // do not let the item run straight into the next heading.
    const position = heading.index + ((lines[heading.index + 1] ?? "").trim() === "" ? 2 : 1);
    next.splice(position, 0, ...(/^#{1,6}\s/.test(lines[position] ?? "") ? [text, ""] : [text]));
    return next;
  }

  const position = findNewDateHeadingPosition(lines, date);
  const block = style.blankAfterHeading ? [renderDateHeading(date, style), "", text] : [renderDateHeading(date, style), text];
  if (position > 0 && lines[position - 1]?.trim() !== "") block.unshift("");
  if (position < lines.length && lines[position]?.trim() !== "") block.push("");
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

/** Writes one item into the month file that owns its date. Returns the file it landed in. */
export async function appendTechoItem(app: App, folder: string, item: Omit<TechoItem, "id" | "sourceLine">): Promise<string> {
  const [year, month] = item.date.split("-").map(Number);
  const file = await openMonthFile(app, folder, year, month);
  const lines = (await app.vault.read(file)).split(/\r?\n/);
  const updated = insertItemLine(lines, item.date, renderItemLine(item), detectDateHeadingStyle(lines));
  await app.vault.modify(file, updated.join("\n"));
  return file.path;
}

export async function readFolder(app: App, folder: string, year: number, month: number): Promise<{ file: TFile; items: TechoItem[] }[]> {
  const prefix = folder.replace(/\/+$/, "");
  const files = app.vault.getMarkdownFiles().filter((file) => !prefix || file.path.startsWith(`${prefix}/`));
  const result: { file: TFile; items: TechoItem[] }[] = [];
  for (const file of files) {
    const items = parseMarkdown(await app.vault.cachedRead(file), file.path).filter((item) => {
      const d = new Date(`${item.date}T00:00:00`);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    if (items.length) result.push({ file, items });
  }
  return result;
}
