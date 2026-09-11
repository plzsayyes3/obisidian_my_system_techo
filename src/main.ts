import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MySystemTechoSettings, TechoScope } from "./types";
import { addDays, pad2 } from "./utils/date";
import { MySystemTechoSettingTab } from "./settings";
import { TECHO_VIEW_TYPE, TechoView } from "./views/techo";
import { GoogleCalendarSummary, calendarSlug, createGoogleEvent, listGoogleCalendars, listGoogleEvents, notifyGoogleError, refreshGoogleToken, toTechoEntries } from "./google";
import { GoogleSyncResult, GoogleSyncScope, GoogleTechoEntry, applyGoogleEvents } from "./data/googleSync";
import { promptText } from "./ui/textPrompt";

export default class MySystemTechoPlugin extends Plugin {
  settings: MySystemTechoSettings = DEFAULT_SETTINGS;
  private googleSyncInProgress = false;

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!Array.isArray(saved?.googleCalendarIds) || !saved.googleCalendarIds.length) {
      // Upgrade from the single-calendar setting.
      this.settings.googleCalendarIds = [saved?.googleCalendarId || DEFAULT_SETTINGS.googleCalendarIds[0]];
    }
    if (!saved?.googleCalendarNames || typeof saved.googleCalendarNames !== "object" || Array.isArray(saved.googleCalendarNames)) {
      this.settings.googleCalendarNames = {};
    }
    if (!saved?.googleCalendarPrefixes || typeof saved.googleCalendarPrefixes !== "object" || Array.isArray(saved.googleCalendarPrefixes)) {
      this.settings.googleCalendarPrefixes = {};
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
    this.addCommand({ id: "test-google-calendar-read", name: "Test Google Calendar read (current month)", callback: () => void this.testGoogleCalendarRead() });
    this.addCommand({ id: "sync-google-calendar-day", name: "Sync Google Calendar: today", callback: () => void this.syncGoogleCalendarToday() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar: current + next month", callback: () => void this.syncGoogleCalendar() });
    this.addCommand({ id: "sync-google-calendar-range", name: "Sync Google Calendar: date range (fiscal year default)", callback: () => void this.syncGoogleCalendarCustomRange() });
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

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error && typeof error === "object") {
      const value = error as Record<string, unknown>;
      for (const key of ["message", "error", "statusText", "text"]) {
        const candidate = value[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      }
      const status = value.status ?? value.statusCode;
      if (typeof status === "number" || typeof status === "string") return `HTTP ${status}`;
      try {
        const json = JSON.stringify(error);
        if (json && json !== "{}") return json;
      } catch {
        // Fall through to the generic message below.
      }
    }
    return "Google Calendarとの通信に失敗しました。";
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
    const calendars = await listGoogleCalendars(await this.getGoogleAccessToken());
    this.settings.googleCalendarNames = {
      ...this.settings.googleCalendarNames,
      ...Object.fromEntries(calendars.map((calendar) => [calendar.id, calendar.summary])),
    };
    await this.saveSettings();
    return calendars;
  }

  /**
   * Read-only diagnostic. It never changes Markdown or Google Calendar.
   * The diagnostic follows the same rule as the normal commands: today's date is the baseline,
   * not whichever month happens to be open in the Techo view.
   */
  async testGoogleCalendarRead(): Promise<void> {
    try {
      const accessToken = await this.getGoogleAccessToken();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();

      let calendarListCount: number | null = null;
      let calendarListError: string | null = null;
      try {
        const calendars = await listGoogleCalendars(accessToken);
        calendarListCount = calendars.length;
        console.log("[My-system-Techo][Google read test] calendar list", calendars);
      } catch (error) {
        calendarListError = this.describeError(error);
        console.warn(`[My-system-Techo][Google read test] calendar list failed | ${calendarListError}`);
      }

      const results: Array<{ calendarId: string; count: number }> = [];
      const failures: Array<{ calendarId: string; message: string }> = [];
      for (const calendarId of this.syncCalendarIds()) {
        try {
          const events = await listGoogleEvents(accessToken, calendarId, start, end);
          results.push({ calendarId, count: events.length });
          console.log("[My-system-Techo][Google read test] events", { calendarId, count: events.length, sample: events.slice(0, 5) });
        } catch (error) {
          const message = this.describeError(error);
          failures.push({ calendarId, message });
          console.warn(`[My-system-Techo][Google read test] events failed | ${calendarId} | ${message}`);
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

  private isoLocal(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  private parseSyncDate(value: string, label: string): string {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) throw new Error(`${label}は YYYY-MM-DD 形式で入力してください。`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
      throw new Error(`${label}の日付が正しくありません。`);
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  private fiscalYearRange(reference = new Date()): GoogleSyncScope {
    const startYear = reference.getMonth() + 1 >= 4 ? reference.getFullYear() : reference.getFullYear() - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
  }

  /** Mirrors one calendar month (or a clipped range within it) into its month file. */
  private async syncGoogleCalendarMonth(
    accessToken: string,
    year: number,
    month: number,
    requestedScope?: GoogleSyncScope,
  ): Promise<{ summary: string; failedCalendars: string[]; sync: GoogleSyncResult }> {
    const monthFrom = `${year}-${pad2(month)}-01`;
    const monthTo = `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`;
    const scope: GoogleSyncScope = {
      from: requestedScope && requestedScope.from > monthFrom ? requestedScope.from : monthFrom,
      to: requestedScope && requestedScope.to < monthTo ? requestedScope.to : monthTo,
    };
    if (scope.from > scope.to) throw new Error(`${year}-${pad2(month)} は指定期間に含まれていません。`);

    const start = new Date(`${scope.from}T00:00:00`).toISOString();
    const end = new Date(`${addDays(scope.to, 1)}T00:00:00`).toISOString();

    const calendarIds = this.syncCalendarIds();
    const entries: GoogleTechoEntry[] = [];
    const syncedSlugs: string[] = [];
    const failedCalendars: string[] = [];
    const failureMessages: string[] = [];
    for (const calendarId of calendarIds) {
      try {
        const events = await listGoogleEvents(accessToken, calendarId, start, end);
        const calendarPrefix = this.settings.googleCalendarPrefixes[calendarId]?.trim() ?? "";
        const calendarEntries = toTechoEntries(events, year, month, calendarId)
          .filter((entry) => entry.date >= scope.from && entry.date <= scope.to);
        entries.push(...calendarEntries.map((entry) => calendarPrefix ? { ...entry, title: `${calendarPrefix}${entry.title}` } : entry));
        syncedSlugs.push(calendarSlug(calendarId));
      } catch (error) {
        // One unreachable calendar must not wipe the lines the others already wrote.
        const message = this.describeError(error);
        failedCalendars.push(calendarId);
        failureMessages.push(message);
        console.warn(`[My-system-Techo][Google sync][Google API] failed | ${scope.from}〜${scope.to} | ${calendarId} | ${message}`);
      }
    }
    if (!syncedSlugs.length) {
      const reasons = [...new Set(failureMessages)].join(" / ");
      throw new Error(`${year}-${pad2(month)} はどのカレンダーからも取得できませんでした。${reasons ? ` 原因: ${reasons}` : ""}`);
    }

    let sync: GoogleSyncResult;
    try {
      sync = await applyGoogleEvents(
        this.app,
        this.settings.sourceFolder,
        year,
        month,
        entries,
        syncedSlugs,
        scope,
        calendarSlug(calendarIds[0] ?? "primary"),
      );
    } catch (error) {
      const message = this.describeError(error);
      console.error(`[My-system-Techo][Google sync][Techo save] failed | ${scope.from}〜${scope.to} | ${message}`);
      throw new Error(`Techoへの保存に失敗しました: ${message}`);
    }
    return {
      summary: `${scope.from}〜${scope.to}: 追加${sync.added} / 更新${sync.updated} / 既存に紐付け${sync.adopted} / 削除${sync.removed}`,
      failedCalendars,
      sync,
    };
  }

  private async runGoogleCalendarRange(scope: GoogleSyncScope, label: string): Promise<void> {
    const period = scope.from === scope.to ? scope.from : `${scope.from}〜${scope.to}`;
    if (this.googleSyncInProgress) {
      new Notice("Google Calendarを同期中です。完了後にもう一度実行してください。");
      return;
    }
    this.googleSyncInProgress = true;
    try {
      if (scope.from > scope.to) throw new Error("終了日は開始日以降にしてください。");
      const accessToken = await this.getGoogleAccessToken();
      const [fromYear, fromMonth] = scope.from.split("-").map(Number);
      const [toYear, toMonth] = scope.to.split("-").map(Number);
      let cursor = new Date(fromYear, fromMonth - 1, 1);
      const lastMonth = new Date(toYear, toMonth - 1, 1);
      let monthCount = 0;
      const failedCalendars = new Set<string>();
      const addedKeys = new Set<string>();
      const removedKeys = new Set<string>();
      const totals = { added: 0, updated: 0, adopted: 0, removed: 0, migrated: 0 };

      while (cursor <= lastMonth) {
        const result = await this.syncGoogleCalendarMonth(accessToken, cursor.getFullYear(), cursor.getMonth() + 1, scope);
        monthCount++;
        result.failedCalendars.forEach((calendarId) => failedCalendars.add(calendarId));
        result.sync.addedKeys.forEach((key) => addedKeys.add(key));
        result.sync.removedKeys.forEach((key) => removedKeys.add(key));
        totals.added += result.sync.added;
        totals.updated += result.sync.updated;
        totals.adopted += result.sync.adopted;
        totals.removed += result.sync.removed;
        totals.migrated += result.sync.migrated;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }

      // A date change across month files looks like one removal and one addition locally. Reconcile
      // matching Google identities so the user-facing result reports it as one update.
      let crossMonthUpdates = 0;
      for (const key of addedKeys) {
        if (removedKeys.has(key)) crossMonthUpdates++;
      }
      totals.added -= crossMonthUpdates;
      totals.removed -= crossMonthUpdates;
      totals.updated += crossMonthUpdates;

      const failedCalendarCount = failedCalendars.size;
      console.log("[My-system-Techo][Google sync] completed", {
        label,
        scope,
        monthCount,
        failedCalendarCount,
        crossMonthUpdates,
        ...totals,
      });
      const status = failedCalendarCount ? "一部失敗" : "同期成功";
      const failureSummary = failedCalendarCount ? `｜取得失敗 ${failedCalendarCount}件` : "";
      new Notice(
        `${status}｜${period}｜追加 ${totals.added}・更新 ${totals.updated}・削除 ${totals.removed}${failureSummary}`,
        8000,
      );
      await this.refreshMonthViews();
    } catch (error) {
      const message = this.describeError(error);
      console.error(`[My-system-Techo][Google sync] failed | ${label} | ${period} | ${message}`);
      if (error instanceof Error && error.stack) console.error(error.stack);
      new Notice(`同期失敗｜${period}｜${message}`, 10000);
    } finally {
      this.googleSyncInProgress = false;
    }
  }

  /** Minimal daily sync: always refresh today, regardless of the open Techo view. */
  async syncGoogleCalendarToday(): Promise<void> {
    const today = this.isoLocal(new Date());
    await this.runGoogleCalendarRange({ from: today, to: today }, "今日");
  }

  /** Broad sync: current calendar month plus the following calendar month, always based on today. */
  async syncGoogleCalendar(): Promise<void> {
    const now = new Date();
    const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const to = this.isoLocal(nextMonth);
    await this.runGoogleCalendarRange({ from, to }, "今月＋翌月");
  }

  /** Opens Obsidian input dialogs for an arbitrary range. Defaults to the current Japanese fiscal year, 4/1–3/31. */
  async syncGoogleCalendarCustomRange(): Promise<void> {
    try {
      const defaults = this.fiscalYearRange();
      const fromInput = await promptText(this.app, "Google Calendar取得の開始日（YYYY-MM-DD）", defaults.from);
      if (fromInput === null) return;
      const toInput = await promptText(this.app, "Google Calendar取得の終了日（YYYY-MM-DD）", defaults.to);
      if (toInput === null) return;
      const from = this.parseSyncDate(fromInput, "開始日");
      const to = this.parseSyncDate(toInput, "終了日");
      if (from > to) throw new Error("終了日は開始日以降にしてください。");
      await this.runGoogleCalendarRange({ from, to }, "指定期間");
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

  async addGoogleCalendarEvent(date?: string): Promise<void> {
    try {
      let targetDate: string;
      if (date) {
        targetDate = this.parseSyncDate(date, "日付");
      } else {
        const today = this.isoLocal(new Date());
        const input = await promptText(this.app, "Google Calendarへ追加する日付（YYYY-MM-DD）", today);
        if (input === null) return;
        targetDate = this.parseSyncDate(input, "日付");
      }

      const title = await promptText(this.app, `${targetDate} にGoogle Calendarへ追加する予定のタイトル`);
      if (!title?.trim()) return;
      const startTime = await promptText(this.app, "開始時刻（例: 09:00）。空欄なら終日予定", "09:00");
      if (startTime === null) return;
      const allDay = !startTime.trim();
      let start: Date;
      let end: Date;
      if (allDay) {
        start = new Date(`${targetDate}T00:00:00`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())) throw new Error("開始時刻は HH:MM 形式で入力してください。");
        const endTime = await promptText(this.app, "終了時刻（例: 10:00）", "10:00");
        if (endTime === null) return;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime.trim())) throw new Error("終了時刻は HH:MM 形式で入力してください。");
        start = new Date(`${targetDate}T${startTime.trim()}:00`);
        end = new Date(`${targetDate}T${endTime.trim()}:00`);
        if (end <= start) throw new Error("終了時刻は開始時刻より後にしてください。");
      }

      if (this.googleSyncInProgress) {
        new Notice("Google Calendarを同期中です。完了後にもう一度実行してください。");
        return;
      }
      this.googleSyncInProgress = true;
      try {
        const accessToken = await this.getGoogleAccessToken();
        const result = await createGoogleEvent(
          accessToken,
          this.settings.googleWriteCalendarId || this.syncCalendarIds()[0],
          title.trim(),
          start,
          end,
          allDay,
        );
        new Notice(`Google Calendarに「${title.trim()}」を追加しました。`);

        // A newly created event only needs the day it was written to refreshed.
        const [targetYear, targetMonth] = targetDate.split("-").map(Number);
        await this.syncGoogleCalendarMonth(accessToken, targetYear, targetMonth, { from: targetDate, to: targetDate });
        await this.refreshMonthViews();
        if (result.htmlLink) console.log("[My-system-Techo][Google OAuth] created event link", result.htmlLink);
      } finally {
        this.googleSyncInProgress = false;
      }
    } catch (error) {
      notifyGoogleError(error);
    }
  }
}
