import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MySystemTechoSettings, TechoScope } from "./types";
import { pad2 } from "./utils/date";
import { MySystemTechoSettingTab } from "./settings";
import { TECHO_VIEW_TYPE, TechoView } from "./views/techo";
import { GoogleCalendarSummary, calendarSlug, createGoogleEvent, listGoogleCalendars, listGoogleEvents, notifyGoogleError, refreshGoogleToken, toTechoEntries } from "./google";
import { GoogleTechoEntry, applyGoogleEvents } from "./data/googleSync";

export default class MySystemTechoPlugin extends Plugin {
  settings: MySystemTechoSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!Array.isArray(saved?.googleCalendarIds) || !saved.googleCalendarIds.length) {
      // Upgrade from the single-calendar setting.
      this.settings.googleCalendarIds = [saved?.googleCalendarId || DEFAULT_SETTINGS.googleCalendarIds[0]];
    }
    if (!this.settings.googleCalendarIds.includes(this.settings.googleWriteCalendarId)) {
      // Includes the migration case, where the write target still holds the "primary" default.
      this.settings.googleWriteCalendarId = this.settings.googleCalendarIds[0];
    }
    await this.saveSettings();
    this.registerView(TECHO_VIEW_TYPE, (leaf) => new TechoView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open techo", callback: () => void this.activateView() });
    for (const scope of ["year", "month", "week"] as const) {
      this.addCommand({ id: `open-${scope}-view`, name: `Open ${scope} view`, callback: () => void this.openScope(scope) });
    }
    this.addCommand({ id: "test-google-calendar-read", name: "Test Google Calendar read", callback: () => void this.testGoogleCalendarRead() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar (current + next month)", callback: () => void this.syncGoogleCalendar() });
    this.addCommand({ id: "add-google-calendar-event", name: "Add Google Calendar event", callback: () => void this.addGoogleCalendarEvent() });
    this.addSettingTab(new MySystemTechoSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TECHO_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: TECHO_VIEW_TYPE, active: true });
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

  syncCalendarIds(): string[] {
    const ids = this.settings.googleCalendarIds.map((id) => id.trim()).filter(Boolean);
    return ids.length ? ids : ["primary"];
  }

  async listGoogleCalendars(): Promise<GoogleCalendarSummary[]> {
    return listGoogleCalendars(await this.getGoogleAccessToken());
  }

  /**
   * Read-only diagnostic. It never changes Markdown or Google Calendar.
   * It separates calendar-list permission problems from event-read problems so OAuth failures are easier to identify.
   */
  async testGoogleCalendarRead(): Promise<void> {
    try {
      const accessToken = await this.getGoogleAccessToken();
      const { year, month } = this.settings;
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();

      let calendarListCount: number | null = null;
      let calendarListError: string | null = null;
      try {
        const calendars = await listGoogleCalendars(accessToken);
        calendarListCount = calendars.length;
        console.log("[My-system-Techo][Google read test] calendar list", calendars);
      } catch (error) {
        calendarListError = error instanceof Error ? error.message : String(error);
        console.warn("[My-system-Techo][Google read test] calendar list failed", calendarListError);
      }

      const results: Array<{ calendarId: string; count: number }> = [];
      const failures: Array<{ calendarId: string; message: string }> = [];
      for (const calendarId of this.syncCalendarIds()) {
        try {
          const events = await listGoogleEvents(accessToken, calendarId, start, end);
          results.push({ calendarId, count: events.length });
          console.log("[My-system-Techo][Google read test] events", { calendarId, count: events.length, sample: events.slice(0, 5) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({ calendarId, message });
          console.warn("[My-system-Techo][Google read test] events failed", { calendarId, message });
        }
      }

      if (!results.length) {
        const detail = failures.map((item) => `${item.calendarId}: ${item.message}`).join(" / ");
        throw new Error(`Google Calendarの予定を取得できませんでした。${detail ? ` ${detail}` : ""}`);
      }

      const total = results.reduce((sum, item) => sum + item.count, 0);
      const eventSummary = results.map((item) => `${item.calendarId}=${item.count}件`).join(" / ");
      const listSummary = calendarListCount === null
        ? `カレンダー一覧は失敗（${calendarListError ?? "原因不明"}）`
        : `カレンダー一覧${calendarListCount}件`;
      const failureSummary = failures.length ? ` / 取得失敗${failures.length}件` : "";
      new Notice(`Google取得テスト成功: ${listSummary} / ${year}-${pad2(month)} 予定合計${total}件 / ${eventSummary}${failureSummary}`, 12000);
    } catch (error) {
      notifyGoogleError(error);
    }
  }

  /** Mirrors one calendar month into its `<sourceFolder>/YYYY-MM.md` file. */
  private async syncGoogleCalendarMonth(accessToken: string, year: number, month: number): Promise<{ summary: string; failedCalendars: string[] }> {
    const start = new Date(year, month - 1, 1).toISOString();
    const end = new Date(year, month, 1).toISOString();

    const entries: GoogleTechoEntry[] = [];
    const syncedSlugs: string[] = [];
    const failedCalendars: string[] = [];
    for (const calendarId of this.syncCalendarIds()) {
      try {
        const events = await listGoogleEvents(accessToken, calendarId, start, end);
        entries.push(...toTechoEntries(events, year, month, calendarId));
        syncedSlugs.push(calendarSlug(calendarId));
      } catch (error) {
        // One unreachable calendar must not wipe the lines the others already wrote.
        failedCalendars.push(calendarId);
        notifyGoogleError(error);
      }
    }
    if (!syncedSlugs.length) throw new Error(`${year}-${pad2(month)} はどのカレンダーからも取得できませんでした。`);

    const result = await applyGoogleEvents(this.app, this.settings.sourceFolder, year, month, entries, syncedSlugs);
    return {
      summary: `${year}-${pad2(month)}: 追加${result.added} / 更新${result.updated} / 既存に紐付け${result.adopted} / 削除${result.removed}`,
      failedCalendars,
    };
  }

  /**
   * Default Google sync is independent of the month currently shown in Techo.
   * It always mirrors the current calendar month and the following calendar month.
   */
  async syncGoogleCalendar(): Promise<void> {
    try {
      const accessToken = await this.getGoogleAccessToken();
      const now = new Date();
      const targets = [
        new Date(now.getFullYear(), now.getMonth(), 1),
        new Date(now.getFullYear(), now.getMonth() + 1, 1),
      ];
      const summaries: string[] = [];
      let failedCalendarCount = 0;

      for (const target of targets) {
        const year = target.getFullYear();
        const month = target.getMonth() + 1;
        const result = await this.syncGoogleCalendarMonth(accessToken, year, month);
        summaries.push(result.summary);
        failedCalendarCount += result.failedCalendars.length;
      }

      const failureSummary = failedCalendarCount ? `（カレンダー取得失敗 延べ${failedCalendarCount}件）` : "";
      new Notice(`Google取得（今月＋翌月）: ${summaries.join(" / ")}${failureSummary}`, 12000);
      await this.refreshMonthViews();
    } catch (error) {
      notifyGoogleError(error);
    }
  }

  async openScope(scope: TechoScope): Promise<void> {
    this.settings.scope = scope;
    await this.saveSettings();
    await this.activateView();
    await this.refreshMonthViews();
  }

  async refreshMonthViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(TECHO_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof TechoView) await view.render();
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
      const result = await createGoogleEvent(accessToken, this.settings.googleWriteCalendarId || this.syncCalendarIds()[0], title.trim(), start, end);
      new Notice(`Google Calendarに「${title.trim()}」を追加しました。`);

      // Creation follows the selected day, which may be outside the default current + next month window.
      const [targetYear, targetMonth] = targetDate.split("-").map(Number);
      await this.syncGoogleCalendarMonth(accessToken, targetYear, targetMonth);
      await this.refreshMonthViews();
      if (result.htmlLink) console.log("[My-system-Techo][Google OAuth] created event link", result.htmlLink);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
}
