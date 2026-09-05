import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type MySystemTechoPlugin from "../main";
import { UndatedItem, appendTechoItem, readItems, readUndatedItems } from "../data/markdown";
import { addDays, clampDay, daysInMonth, isoDate, isoWeek, monthLabel, pad2, startOfWeek, weekdayJa } from "../utils/date";
import type { TechoItem, TechoScope } from "../types";

/** Unchanged from when this view only rendered a month, so saved workspace layouts keep working. */
export const TECHO_VIEW_TYPE = "my-system-techo-month-grid";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const SCOPES: Array<{ scope: TechoScope; label: string }> = [
  { scope: "year", label: "年" },
  { scope: "month", label: "月" },
  { scope: "week", label: "週" },
];

export class TechoView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: MySystemTechoPlugin) { super(leaf); }

  private get year() { return this.plugin.settings.year; }
  private get month() { return this.plugin.settings.month; }
  private get scope(): TechoScope { return this.plugin.settings.scope; }
  /** The week view anchors on this day; it is clamped because months differ in length. */
  private get day() { return clampDay(this.year, this.month, this.plugin.settings.day || 1); }

  getViewType(): string { return TECHO_VIEW_TYPE; }
  getDisplayText(): string { return "My-system-Techo"; }
  getIcon(): string { return "calendar-days"; }

  async onOpen(): Promise<void> { await this.render(); }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("mst-grid-root");
    if (this.scope === "year") await this.renderYear(root);
    else if (this.scope === "week") await this.renderWeek(root);
    else await this.renderMonth(root);
  }

  // --- shared chrome -------------------------------------------------------

  private buildToolbar(root: HTMLElement, title: string, shift: (delta: number) => Promise<void>, todayLabel: string): void {
    const toolbar = root.createDiv({ cls: "mst-toolbar" });
    toolbar.createEl("button", { text: "‹" }).onclick = async () => { await shift(-1); };
    toolbar.createEl("strong", { text: title });
    toolbar.createEl("button", { text: "›" }).onclick = async () => { await shift(1); };
    toolbar.createEl("button", { text: todayLabel }).onclick = async () => { await this.goToToday(); };

    const scopes = toolbar.createDiv({ cls: "mst-scopes" });
    for (const { scope, label } of SCOPES) {
      const button = scopes.createEl("button", { cls: scope === this.scope ? "mst-scope is-active" : "mst-scope", text: label });
      button.onclick = async () => {
        this.plugin.settings.scope = scope;
        await this.plugin.saveSettings();
        await this.render();
      };
    }

    const sync = toolbar.createEl("button", { text: "Google取得" });
    sync.onclick = async () => {
      sync.disabled = true;
      sync.setText("取得中…");
      try {
        await this.plugin.syncGoogleCalendar();
      } finally {
        // syncGoogleCalendar re-renders on success, which replaces this button.
        sync.disabled = false;
        sync.setText("Google取得");
      }
    };
  }

  private renderItem(cell: HTMLElement, item: TechoItem): void {
    const row = cell.createDiv({ cls: item.googleId ? "mst-item is-google" : "mst-item" });
    row.setText(`${item.time ? `${item.time} ` : ""}${item.kind === "task" ? `${item.checked ? "☑" : "☐"} ` : ""}${item.title}`);
  }

  /** Renders `### 日付未定` / `### タスク` blocks, which have no day to sit under in the grid. */
  private renderUndated(root: HTMLElement, items: UndatedItem[]): void {
    if (!items.length) return;
    const sections = new Map<string, UndatedItem[]>();
    for (const item of items) sections.set(item.section, [...(sections.get(item.section) ?? []), item]);

    const wrapper = root.createDiv({ cls: "mst-undated" });
    for (const [section, entries] of sections) {
      const box = wrapper.createDiv({ cls: "mst-undated-section" });
      box.createDiv({ cls: "mst-undated-title", text: section });
      for (const entry of entries) {
        box.createDiv({ cls: "mst-item" }).setText(`${entry.time ? `${entry.time} ` : ""}${entry.kind === "task" ? `${entry.checked ? "☑" : "☐"} ` : ""}${entry.title}`);
      }
    }
  }

  private dayActions(cell: HTMLElement, date: string): void {
    const actions = cell.createDiv({ cls: "mst-day-actions" });
    const add = actions.createEl("button", { cls: "mst-add", text: "+" });
    add.setAttr("aria-label", `${date} にローカル予定を追加`);
    add.onclick = () => void this.addItem(date);
    const google = actions.createEl("button", { cls: "mst-add-google", text: "G+" });
    google.setAttr("aria-label", `${date} にGoogle Calendar予定を追加`);
    google.onclick = () => void this.plugin.addGoogleCalendarEvent(date);
  }

  private async byDate(from: string, to: string): Promise<Map<string, TechoItem[]>> {
    const items = await readItems(this.app, this.plugin.settings.sourceFolder, from, to);
    const byDate = new Map<string, TechoItem[]>();
    for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return byDate;
  }

  // --- month ---------------------------------------------------------------

  private async renderMonth(root: HTMLElement): Promise<void> {
    this.buildToolbar(root, monthLabel(this.year, this.month), (delta) => this.shiftMonth(delta), "今日");

    const count = daysInMonth(this.year, this.month);
    const byDate = await this.byDate(isoDate(this.year, this.month, 1), isoDate(this.year, this.month, count));
    const grid = root.createDiv({ cls: "mst-grid" });
    WEEKDAYS.forEach((label) => grid.createDiv({ cls: "mst-grid-header", text: label }));

    const offset = (new Date(this.year, this.month - 1, 1).getDay() + 6) % 7;
    const total = Math.ceil((offset + count) / 7) * 7;
    for (let index = 0; index < total; index++) {
      const day = index - offset + 1;
      const cell = grid.createDiv({ cls: "mst-day" });
      if (day < 1 || day > count) { cell.addClass("is-outside"); continue; }
      const date = isoDate(this.year, this.month, day);
      cell.createDiv({ cls: "mst-day-number", text: String(day) });
      for (const item of byDate.get(date) ?? []) this.renderItem(cell, item);
      this.dayActions(cell, date);
    }

    // Month-level sections sit outside every week, so the month view is where they belong.
    const undated = await readUndatedItems(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    this.renderUndated(root, undated.filter((item) => item.week === undefined));
  }

  // --- week ----------------------------------------------------------------

  private async renderWeek(root: HTMLElement): Promise<void> {
    const monday = startOfWeek(isoDate(this.year, this.month, this.day));
    const sunday = addDays(monday, 6);
    const week = isoWeek(monday);
    this.buildToolbar(root, `week${week}（${monday} 〜 ${sunday}）`, (delta) => this.shiftWeek(delta), "今週");

    const byDate = await this.byDate(monday, sunday);
    const list = root.createDiv({ cls: "mst-week" });
    for (let index = 0; index < 7; index++) {
      const date = addDays(monday, index);
      const [, month, day] = date.split("-").map(Number);
      const row = list.createDiv({ cls: "mst-week-day" });
      if (date === todayIso()) row.addClass("is-today");
      const head = row.createDiv({ cls: "mst-week-head" });
      head.createSpan({ cls: `mst-week-date is-${["mon", "tue", "wed", "thu", "fri", "sat", "sun"][index]}`, text: `${month}月${day}日(${weekdayJa(date)})` });
      const body = row.createDiv({ cls: "mst-week-body" });
      for (const item of byDate.get(date) ?? []) this.renderItem(body, item);
      this.dayActions(head, date);
    }

    // Only this week's own 日付未定 / タスク; the month-level ones belong to the month view.
    const undated = await readUndatedItems(this.app, this.plugin.settings.sourceFolder, this.year, this.month);
    this.renderUndated(root, undated.filter((item) => item.week === week));
  }

  // --- year ----------------------------------------------------------------

  private async renderYear(root: HTMLElement): Promise<void> {
    this.buildToolbar(root, `${this.year}年`, (delta) => this.shiftYear(delta), "今年");

    const byDate = await this.byDate(isoDate(this.year, 1, 1), isoDate(this.year, 12, 31));
    const grid = root.createDiv({ cls: "mst-year" });
    grid.createDiv({ cls: "mst-year-corner" });
    for (let month = 1; month <= 12; month++) {
      const header = grid.createDiv({ cls: "mst-year-header", text: `${month}月` });
      header.onclick = () => void this.openMonth(month, 1);
    }

    for (let day = 1; day <= 31; day++) {
      grid.createDiv({ cls: "mst-year-day", text: String(day) });
      for (let month = 1; month <= 12; month++) {
        const cell = grid.createDiv({ cls: "mst-year-cell" });
        if (day > daysInMonth(this.year, month)) { cell.addClass("is-empty"); continue; }
        const date = isoDate(this.year, month, day);
        const weekday = new Date(this.year, month - 1, day).getDay();
        if (weekday === 0) cell.addClass("is-sun");
        else if (weekday === 6) cell.addClass("is-sat");
        if (date === todayIso()) cell.addClass("is-today");
        cell.createSpan({ cls: "mst-year-weekday", text: weekdayJa(date) });

        const items = byDate.get(date) ?? [];
        if (items.length) {
          cell.addClass("has-items");
          cell.createSpan({ cls: "mst-year-count", text: String(items.length) });
        }
        cell.setAttr("aria-label", items.length ? `${date}（${items.length}件）` : date);
        cell.setAttr("title", items.length ? `${date}\n${items.map((item) => `${item.time ? `${item.time} ` : ""}${item.title}`).join("\n")}` : date);
        cell.onclick = () => void this.openMonth(month, day);
      }
    }
  }

  // --- navigation ----------------------------------------------------------

  private async openMonth(month: number, day: number): Promise<void> {
    this.plugin.settings.month = month;
    this.plugin.settings.day = day;
    this.plugin.settings.scope = "month";
    await this.plugin.saveSettings();
    await this.render();
  }

  private async goToToday(): Promise<void> {
    const now = new Date();
    this.plugin.settings.year = now.getFullYear();
    this.plugin.settings.month = now.getMonth() + 1;
    this.plugin.settings.day = now.getDate();
    await this.plugin.saveSettings();
    await this.render();
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

  private async shiftMonth(delta: number): Promise<void> {
    const shifted = new Date(this.year, this.month - 1 + delta, 1);
    this.plugin.settings.year = shifted.getFullYear();
    this.plugin.settings.month = shifted.getMonth() + 1;
    await this.plugin.saveSettings();
    await this.render();
  }

  private async shiftWeek(delta: number): Promise<void> {
    const [year, month, day] = addDays(isoDate(this.year, this.month, this.day), delta * 7).split("-").map(Number);
    this.plugin.settings.year = year;
    this.plugin.settings.month = month;
    this.plugin.settings.day = day;
    await this.plugin.saveSettings();
    await this.render();
  }

  private async shiftYear(delta: number): Promise<void> {
    this.plugin.settings.year += delta;
    await this.plugin.saveSettings();
    await this.render();
  }
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
