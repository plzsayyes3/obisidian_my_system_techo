import { App, TFile } from "obsidian";
import { TechoItem } from "../types";

const DATE_HEADING = /^#{1,6}\s+(\d{4})-(\d{2})-(\d{2})\s*$/;
const ITEM = /^-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2})\s+)?(.+?)\s*$/;

export function parseMarkdown(text: string, filePath: string): TechoItem[] {
  const lines = text.split(/\r?\n/);
  const items: TechoItem[] = [];
  let currentDate = "";
  lines.forEach((line, index) => {
    const heading = line.match(DATE_HEADING);
    if (heading) {
      currentDate = `${heading[1]}-${heading[2]}-${heading[3]}`;
      return;
    }
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
  const headingIndex = lines.findIndex((line) => line.match(DATE_HEADING)?.slice(1).join("-") === item.date);
  const prefix = item.kind === "task" ? `- [${item.checked ? "x" : " "}] ` : "- ";
  const line = `${prefix}${item.time ? `${item.time} ` : ""}${item.title}`;
  if (headingIndex >= 0) {
    lines.splice(headingIndex + 1, 0, line);
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(`## ${item.date}`, line);
  }
  await app.vault.modify(file, lines.join("\n"));
}

export async function createMarkdownFile(app: App, path: string, date: string): Promise<TFile> {
  const content = `## ${date}\n`;
  return app.vault.create(path, content);
}
