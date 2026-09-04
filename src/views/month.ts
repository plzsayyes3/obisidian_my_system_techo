import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type MySystemTechoPlugin from "../main";
import { appendTechoItem, readFolder } from "../data/markdown";
import { daysInMonth, monthLabel, pad2 } from "../utils/date";
import type { TechoItem } from "../types";

export const MONTH_VIEW_TYPE = "my-system-techo-month-grid";

export class MonthGridView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: MySystemTechoPlugin) { super(leaf); }
  private get year() { return this.plugin.settings.year; }
  private get month() { return this.plugin.settings.month; }

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
    const googleSync = toolbar.createEl("button", { text: "Google取得" });
    const googleAdd = toolbar.createEl("button", { text: "Google予定追加" });
    prev.onclick = async () => { await this.shift(-1); };
    next.onclick = async () => { await this.shift(1); };
    today.onclick = async () => {
      const d = new Date();
      this.plugin.settings.year = d.getFullYear();
      this.plugin.settings.month = d.getMonth() + 1;
      await this.plugin.saveSettings();
      await this.render();
    };
    googleSync.onclick = async () => {
      googleSync.disabled = true;
      googleSync.setText("取得中…");
      try {
        await this.plugin.syncGoogleCalendar();
      } finally {
        // syncGoogleCalendar re-renders on success, which replaces this button.
        googleSync.disabled = false;
        googleSync.setText("Google取得");
      }
    };
    googleAdd.onclick = () => void this.plugin.addGoogleCalendarEvent();

    const data = await readFolder(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    const byDate = new Map<string, TechoItem[]>();
    for (const entry of data) for (const item of entry.items) {
      const list = byDate.get(item.date) ?? [];
      list.push(item);
      byDate.set(item.date, list);
    }

    const grid = root.createDiv({ cls: "mst-grid" });
    ["月", "火", "水", "木", "金", "土", "日"].forEach((label) => grid.createDiv({ cls: "mst-grid-header", text: label }));
    const first = new Date(this.year, this.month - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = daysInMonth(this.year, this.month);
    const total = Math.ceil((offset + count) / 7) * 7;

    for (let index = 0; index < total; index++) {
      const day = index - offset + 1;
      const cell = grid.createDiv({ cls: "mst-day" });
      if (day < 1 || day > count) { cell.addClass("is-outside"); continue; }
      const date = `${this.year}-${pad2(this.month)}-${pad2(day)}`;
      cell.createDiv({ cls: "mst-day-number", text: String(day) });
      for (const item of byDate.get(date) ?? []) this.renderItem(cell, item);
      const actions = cell.createDiv({ cls: "mst-day-actions" });
      const add = actions.createEl("button", { cls: "mst-add", text: "+" });
      add.setAttr("aria-label", `${date} にローカル予定を追加`);
      add.onclick = () => void this.addItem(date);
      const google = actions.createEl("button", { cls: "mst-add-google", text: "G+" });
      google.setAttr("aria-label", `${date} にGoogle Calendar予定を追加`);
      google.onclick = () => void this.plugin.addGoogleCalendarEvent(date);
    }
  }

  private renderItem(cell: HTMLElement, item: TechoItem): void {
    const row = cell.createDiv({ cls: item.googleId ? "mst-item is-google" : "mst-item" });
    row.setText(`${item.time ? `${item.time} ` : ""}${item.kind === "task" ? `${item.checked ? "☑" : "☐"} ` : ""}${item.title}`);
  }

  private async addItem(date: string): Promise<void> {
    const title = window.prompt(`${date} の予定・タスク`);
    if (!title?.trim()) return;
    const isTask = window.confirm("タスクとして登録しますか？\nOK = タスク / キャンセル = 予定");
    try {
      await appendTechoItem(this.app, this.plugin.settings.sourceFolder, { date, title: title.trim(), kind: isTask ? "task" : "event", checked: false });
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "手帳への書き込みに失敗しました。");
      return;
    }
    await this.render();
  }

  private async shift(delta: number): Promise<void> {
    const d = new Date(this.year, this.month - 1 + delta, 1);
    this.plugin.settings.year = d.getFullYear();
    this.plugin.settings.month = d.getMonth() + 1;
    await this.plugin.saveSettings();
    await this.render();
  }
}
