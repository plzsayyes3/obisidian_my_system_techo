import { ItemView, WorkspaceLeaf } from "obsidian";
import type MySystemTechoPlugin from "../main";
import { appendItem, createMarkdownFile, readFolder } from "../data/markdown";
import { dateKey, daysInMonth, monthLabel, pad2 } from "../utils/date";
import { TechoItem } from "../types";

export const MONTH_VIEW_TYPE = "my-system-techo-month-grid";

export class MonthGridView extends ItemView {
  plugin: MySystemTechoPlugin;
  private year: number;
  private month: number;

  constructor(leaf: WorkspaceLeaf, plugin: MySystemTechoPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.year = plugin.settings.year;
    this.month = plugin.settings.month;
  }

  getViewType(): string { return MONTH_VIEW_TYPE; }
  getDisplayText(): string { return "My-system-Techo"; }
  getIcon(): string { return "calendar-days"; }

  async onOpen(): Promise<void> { await this.render(); }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("mst-grid-root");

    const toolbar = root.createDiv({ cls: "mst-toolbar" });
    const prev = toolbar.createEl("button", { text: "‹" });
    const title = toolbar.createEl("strong", { text: monthLabel(this.year, this.month) });
    const next = toolbar.createEl("button", { text: "›" });
    const today = toolbar.createEl("button", { text: "今日" });
    prev.onclick = async () => { this.shift(-1); await this.render(); };
    next.onclick = async () => { this.shift(1); await this.render(); };
    today.onclick = async () => { const d = new Date(); this.year = d.getFullYear(); this.month = d.getMonth() + 1; await this.render(); };

    const data = await readFolder(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    const items = data.flatMap((entry) => entry.items);
    const byDate = new Map<string, TechoItem[]>();
    items.forEach((item) => {
      const list = byDate.get(item.date) ?? [];
      list.push(item);
      byDate.set(item.date, list);
    });

    const grid = root.createDiv({ cls: "mst-grid" });
    ["月", "火", "水", "木", "金", "土", "日"].forEach((label) => grid.createDiv({ cls: "mst-grid-header", text: label }));

    const first = new Date(this.year, this.month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const total = Math.ceil((offset + daysInMonth(this.year, this.month)) / 7) * 7;
    for (let index = 0; index < total; index += 1) {
      const day = index - offset + 1;
      const cell = grid.createDiv({ cls: "mst-day" });
      if (day < 1 || day > daysInMonth(this.year, this.month)) { cell.addClass("is-outside"); continue; }
      const date = `${this.year}-${pad2(this.month)}-${pad2(day)}`;
      cell.createDiv({ cls: "mst-day-number", text: String(day) });
      (byDate.get(date) ?? []).forEach((item) => this.renderItem(cell, item));
      const add = cell.createEl("button", { cls: "mst-add", text: "+" });
      add.onclick = () => void this.addItem(date);
    }
  }

  private renderItem(cell: HTMLElement, item: TechoItem): void {
    const row = cell.createDiv({ cls: "mst-item" });
    row.createSpan({ text: `${item.time ? `${item.time} ` : ""}${item.kind === "task" ? `${item.checked ? "☑" : "☐"} ` : ""}${item.title}` });
  }

  private async addItem(date: string): Promise<void> {
    const title = window.prompt(`${date} の予定・タスク`);
    if (!title?.trim()) return;
    const isTask = window.confirm("タスクとして登録しますか？\nOK = タスク / キャンセル = 予定");
    const folder = this.plugin.settings.sourceFolder.replace(/\/+$/, "");
    const path = `${folder}/${date}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import("obsidian").TFile)) file = await createMarkdownFile(this.app, path, date);
    await appendItem(this.app, file, { date, title: title.trim(), kind: isTask ? "task" : "event", checked: false });
    await this.render();
  }

  private shift(delta: number): void {
    const d = new Date(this.year, this.month - 1 + delta, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth() + 1;
  }
}
