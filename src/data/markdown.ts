import { App, TFile } from "obsidian";
import { TechoItem } from "../types";

const MONTH_HEADING = /^#{1,6}\s+(\d{4})年(\d{1,2})月\s*$/;
const ISO_DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
const JP_DATE_HEADING = /^#{1,6}\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/;
const WEEK_HEADING = /^#{1,6}\s+week\s*(\d{1,2})\s*$/i;
const HEADING = /^(#{1,6})\s+/;
const ITEM = /^-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/;

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
      headings.push({ index, level, kind: "date", date: `${year}-${String(month).padStart(2, "0")}-${String(Number(jpHeading[2])).padStart(2, "0")}` });
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
  const headings = scanHeadings(lines);
  const byIndex = new Map(headings.map((heading) => [heading.index, heading]));
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
    const marker = line.match(GOOGLE_MARKER);
    const match = (marker ? line.slice(0, marker.index) : line).match(ITEM);
    if (!match) return;
    items.push({
      id: `${filePath}:${index + 1}`,
      date,
      time: match[2] || undefined,
      title: match[3],
      kind: match[1] !== undefined ? "task" : "event",
      checked: Boolean(match[1] && match[1].toLowerCase() === "x"),
      sourceLine: index + 1,
      googleId: marker?.[1],
    });
  });
  return items;
}

/** Splits an item line into the pieces the Google sync compares against, or null if it is not an item. */
export function parseItemLine(line: string): { time?: string; title: string; googleId?: string } | null {
  const marker = line.match(GOOGLE_MARKER);
  const match = (marker ? line.slice(0, marker.index) : line).match(ITEM);
  if (!match) return null;
  return { time: match[2] || undefined, title: match[3], googleId: marker?.[1] };
}

export function joinPath(folder: string, name: string): string {
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${name}` : name;
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

export async function appendItem(app: App, file: TFile, item: Omit<TechoItem, "id" | "sourceLine">): Promise<void> {
  const current = await app.vault.read(file);
  const lines = current.split(/\r?\n/);
  const isoHeading = `## ${item.date}`;
  const dateParts = item.date.split("-").map(Number);
  const jpHeading = `## ${dateParts[1]}月${dateParts[2]}日`;
  const headingIndex = lines.findIndex((line) => line.trim() === isoHeading || line.trim() === jpHeading || line.match(JP_DATE_HEADING)?.[0] === line.trim() && line.includes(`${dateParts[1]}月${dateParts[2]}日`));
  const prefix = item.kind === "task" ? `- [${item.checked ? "x" : " "}] ` : "- ";
  const line = `${prefix}${item.time ? `${item.time} ` : ""}${item.title}`;
  if (headingIndex >= 0) lines.splice(headingIndex + 1, 0, line);
  else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(isoHeading, line);
  }
  await app.vault.modify(file, lines.join("\n"));
}

export async function createMarkdownFile(app: App, path: string, date: string): Promise<TFile> {
  const [year, month, day] = date.split("-").map(Number);
  const content = `# ${year}年${month}月\n\n## ${month}月${day}日\n`;
  return app.vault.create(path, content);
}
