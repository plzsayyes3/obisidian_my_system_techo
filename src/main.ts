import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MySystemTechoSettings } from "./types";
import { pad2 } from "./utils/date";
import { MySystemTechoSettingTab } from "./settings";
import { MONTH_VIEW_TYPE, MonthGridView } from "./views/month";
import { createGoogleEvent, listGoogleEvents, notifyGoogleError, refreshGoogleToken, toTechoEntries } from "./google";
import { applyGoogleEvents } from "./data/googleSync";

export default class MySystemTechoPlugin extends Plugin {
  settings: MySystemTechoSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(MONTH_VIEW_TYPE, (leaf) => new MonthGridView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open month grid", callback: () => void this.activateView() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar", callback: () => void this.syncGoogleCalendar() });
    this.addCommand({ id: "add-google-calendar-event", name: "Add Google Calendar event", callback: () => void this.addGoogleCalendarEvent() });
    this.addSettingTab(new MySystemTechoSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(MONTH_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: MONTH_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async getGoogleAccessToken(): Promise<string> {
    const config = this.settings.googleTokens;
    if (!this.settings.googleClientId || !config?.accessToken) throw new Error("Google Calendarが接続されていません。設定から接続してください。");
    if (config.expiresAt > Date.now() + 60_000) return config.accessToken;
    if (!config.refreshToken) throw new Error("Google refresh token is unavailable. Please reconnect.");
    if (!this.settings.googleClientSecret) throw new Error("Google Client Secret is unavailable. Please reconnect.");
    const refreshed = await refreshGoogleToken(this.settings.googleClientId, this.settings.googleClientSecret, config.refreshToken);
    this.settings.googleTokens = refreshed;
    await this.saveSettings();
    return refreshed.accessToken;
  }

  /** Mirrors the displayed month from Google Calendar into `<sourceFolder>/YYYY-MM.md`. */
  async syncGoogleCalendar(): Promise<void> {
    try {
      const { year, month } = this.settings;
      const accessToken = await this.getGoogleAccessToken();
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const events = await listGoogleEvents(accessToken, this.settings.googleCalendarId || "primary", start.toISOString(), end.toISOString());
      const entries = toTechoEntries(events, year, month);
      const result = await applyGoogleEvents(this.app, this.settings.sourceFolder, year, month, entries);
      new Notice(`${result.path}: 追加${result.added} / 更新${result.updated} / 既存に紐付け${result.adopted} / 削除${result.removed}`);
      await this.refreshMonthViews();
    } catch (error) {
      notifyGoogleError(error);
    }
  }

  async refreshMonthViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(MONTH_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof MonthGridView) await view.render();
    }
  }

  /** Today when the displayed month is the current one, otherwise its first day: `2月30日` is not a date. */
  private defaultEventDate(): string {
    const { year, month } = this.settings;
    const today = new Date();
    const day = today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : 1;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  async addGoogleCalendarEvent(date?: string): Promise<void> {
    try {
      const targetDate = date || this.defaultEventDate();
      const title = window.prompt(`${targetDate} にGoogle Calendarへ追加する予定のタイトル`);
      if (!title?.trim()) return;
      const startTime = window.prompt("開始時刻（例: 09:00）。空欄なら終日予定", "09:00");
      if (startTime === null) return;
      let start: Date;
      let end: Date;
      if (!startTime.trim()) {
        start = new Date(`${targetDate}T00:00:00`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())) throw new Error("開始時刻は HH:MM 形式で入力してください。");
        const endTime = window.prompt("終了時刻（例: 10:00）", "10:00");
        if (endTime === null) return;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime.trim())) throw new Error("終了時刻は HH:MM 形式で入力してください。");
        start = new Date(`${targetDate}T${startTime.trim()}:00`);
        end = new Date(`${targetDate}T${endTime.trim()}:00`);
        if (end <= start) throw new Error("終了時刻は開始時刻より後にしてください。");
      }

      const accessToken = await this.getGoogleAccessToken();
      const result = await createGoogleEvent(accessToken, this.settings.googleCalendarId || "primary", title.trim(), start, end);
      new Notice(`Google Calendarに「${title.trim()}」を追加しました。`);
      await this.syncGoogleCalendar();
      if (result.htmlLink) console.log("[My-system-Techo][Google OAuth] created event link", result.htmlLink);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
}
