import { App, TFile } from "obsidian";
import { TechoItem } from "../types";

const MONTH_HEADING = /^#{1,6}\s+(\d{4})年(\d{1,2})月\s*$/;
const ISO_DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
const JP_DATE_HEADING = /^#{1,6}\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/;
const ITEM = /^-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/;

export function parseMarkdown(text: string, filePath: string): TechoItem[] {
  const lines = text.split(/\r?\n/);
  const items: TechoItem[] = [];
  let currentDate = "";
  let currentYear = 0;
  let currentMonth = 0;

  lines.forEach((line, index) => {
    const monthHeading = line.match(MONTH_HEADING);
    if (monthHeading) {
      currentYear = Number(monthHeading[1]);
      currentMonth = Number(monthHeading[2]);
      currentDate = "";
      return;
    }

    const isoHeading = line.match(ISO_DATE_HEADING);
    if (isoHeading) {
      currentDate = `${isoHeading[1]}-${isoHeading[2]}-${isoHeading[3]}`;
      currentYear = Number(isoHeading[1]);
      currentMonth = Number(isoHeading[2]);
      return;
    }

    const jpHeading = line.match(JP_DATE_HEADING);
    if (jpHeading && currentYear && currentMonth === Number(jpHeading[1])) {
      currentDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(Number(jpHeading[2])).padStart(2, "0")}`;
      return;
    }

    // Non-date headings such as "week35" and "日付未定" do not change currentDate.
    const match = line.match(ITEM);
    if (!match || !currentDate) return;
    items.push({
      id: `${filePath}:${index + 1}`,
      date: currentDate,
      time: match[2] || undefined,
      title: match[3],
      kind: match[1] !== undefined ? "task" : "event",
      checked: Boolean(match[1] && match[1].toLowerCase() === "x"),
      sourceLine: index + 1,
    });
  });
  return items;
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
