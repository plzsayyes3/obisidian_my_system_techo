import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MySystemTechoSettings } from "./types";
import { MySystemTechoSettingTab } from "./settings";
import { MONTH_VIEW_TYPE, MonthGridView } from "./views/month";
import { listGoogleEvents, notifyGoogleError, refreshGoogleToken } from "./google";

export default class MySystemTechoPlugin extends Plugin {
  settings: MySystemTechoSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(MONTH_VIEW_TYPE, (leaf) => new MonthGridView(leaf, this));
    this.addRibbonIcon("calendar-days", "My-system-Techo", () => void this.activateView());
    this.addCommand({ id: "open-month-grid", name: "Open month grid", callback: () => void this.activateView() });
    this.addCommand({ id: "sync-google-calendar", name: "Sync Google Calendar", callback: () => void this.syncGoogleCalendar() });
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

  async syncGoogleCalendar(): Promise<void> {
    const config = this.settings.googleTokens;
    if (!this.settings.googleClientId || !config?.accessToken) {
      new Notice("Google Calendarが接続されていません。設定から接続してください。");
      return;
    }

    try {
      let accessToken = config.accessToken;
      if (config.expiresAt <= Date.now() + 60_000) {
        if (!config.refreshToken) throw new Error("Google refresh token is unavailable. Please reconnect.");
        if (!this.settings.googleClientSecret) throw new Error("Google Client Secret is unavailable. Please reconnect.");
        const refreshed = await refreshGoogleToken(this.settings.googleClientId, this.settings.googleClientSecret, config.refreshToken);
        this.settings.googleTokens = refreshed;
        await this.saveSettings();
        accessToken = refreshed.accessToken;
      }

      const start = new Date(this.settings.year, this.settings.month - 1, 1);
      const end = new Date(this.settings.year, this.settings.month, 1);
      const events = await listGoogleEvents(accessToken, this.settings.googleCalendarId || "primary", start.toISOString(), end.toISOString());
      await this.saveData({ ...this.settings, googleLastSyncCount: events.length });
      new Notice(`Google Calendar: ${events.length}件取得しました。`);
    } catch (error) {
      notifyGoogleError(error);
    }
  }
}
