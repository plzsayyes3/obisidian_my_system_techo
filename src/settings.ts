import { Notice, PluginSettingTab, Setting } from "obsidian";
import type MySystemTechoPlugin from "./main";
import { GoogleCalendarSummary, authorizeGoogle, notifyGoogleError } from "./google";

export class MySystemTechoSettingTab extends PluginSettingTab {
  /** Fetched on demand and kept across re-renders so the picker survives a toggle. */
  private calendars: GoogleCalendarSummary[] = [];

  constructor(app: any, private plugin: MySystemTechoPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "My-system-Techo" });

    new Setting(containerEl)
      .setName("Markdownフォルダ")
      .setDesc("手帳データを保存するVault内のフォルダ")
      .addText((text) => text.setPlaceholder("techo").setValue(this.plugin.settings.sourceFolder).onChange(async (value) => {
        this.plugin.settings.sourceFolder = value.trim().replace(/^\/+|\/+$/g, "");
        await this.plugin.saveSettings();
      }));

    containerEl.createEl("h3", { text: "Google Calendar" });
    containerEl.createEl("p", { text: "Google Calendarの予定を取得・追加します。OAuthトークンとClient SecretはこのVaultのプラグインデータに保存され、GitHubには送信されません。予定の追加には再認証が必要です。" });

    new Setting(containerEl)
      .setName("Google Client ID")
      .setDesc("Google Cloudで作成したOAuthクライアントのClient ID")
      .addText((text) => text.setPlaceholder("xxxx.apps.googleusercontent.com").setValue(this.plugin.settings.googleClientId).onChange(async (value) => {
        this.plugin.settings.googleClientId = value.trim();
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Google Client Secret")
      .setDesc("Google Cloudの同じOAuthクライアントに表示されるClient Secret。GitHubには保存されません。")
      .addText((text) => text.setPlaceholder("GOCSPX-...").setValue(this.plugin.settings.googleClientSecret).onChange(async (value) => {
        this.plugin.settings.googleClientSecret = value.trim();
        await this.plugin.saveSettings();
      }));

    const tokens = this.plugin.settings.googleTokens;
    const isConnected = Boolean(tokens?.accessToken || tokens?.refreshToken);

    new Setting(containerEl)
      .setName("Google Calendarに接続")
      .setDesc("デスクトップ版ObsidianでGoogleの認証画面を開きます。読み取り・予定追加の権限を取得します。")
      .addButton((button) => button
        .setButtonText(isConnected ? "再認証" : "接続")
        .setCta()
        .onClick(async () => {
          if (!this.plugin.settings.googleClientId) {
            new Notice("先にGoogle Client IDを設定してください。");
            return;
          }
          if (!this.plugin.settings.googleClientSecret) {
            new Notice("先にGoogle Client Secretを設定してください。");
            return;
          }
          button.setDisabled(true);
          try {
            new Notice("Google OAuth: 認証を開始します。");
            const newTokens = await authorizeGoogle(this.plugin.settings.googleClientId, this.plugin.settings.googleClientSecret);
            new Notice(`Google OAuth: トークン取得成功（access token: ${newTokens.accessToken ? "あり" : "なし"} / refresh token: ${newTokens.refreshToken ? "あり" : "なし"}）`);
            if (!newTokens.accessToken) throw new Error("Google OAuthは完了しましたが、アクセストークンを取得できませんでした。");
            this.plugin.settings.googleTokens = newTokens;
            await this.plugin.saveSettings();
            new Notice(`Google Calendar: 設定保存完了（接続状態: ${this.plugin.settings.googleTokens?.accessToken ? "保存済み" : "未保存"}）`);
            this.display();
          } catch (error) {
            notifyGoogleError(error);
          } finally {
            button.setDisabled(false);
          }
        }));

    new Setting(containerEl)
      .setName("接続状態")
      .setDesc(isConnected ? "接続済み" : "未接続");

    new Setting(containerEl)
      .setName("Google取得テスト")
      .setDesc("Markdownには書き込まず、現在表示中の月についてGoogleからカレンダー一覧と予定を取得できるか確認します。")
      .addButton((button) => button
        .setButtonText("取得テスト")
        .setDisabled(!isConnected)
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("取得中…");
          try {
            await this.plugin.testGoogleCalendarRead();
          } finally {
            button.setDisabled(false);
            button.setButtonText("取得テスト");
          }
        }));

    this.renderCalendarPicker(containerEl, isConnected);
  }

  private async setCalendarIds(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    this.plugin.settings.googleCalendarIds = unique.length ? unique : ["primary"];
    if (!this.plugin.settings.googleCalendarIds.includes(this.plugin.settings.googleWriteCalendarId)) {
      this.plugin.settings.googleWriteCalendarId = this.plugin.settings.googleCalendarIds[0];
    }
    await this.plugin.saveSettings();
    this.display();
  }

  private async setCalendarPrefix(calendarId: string, value: string): Promise<void> {
    const prefixes = { ...this.plugin.settings.googleCalendarPrefixes };
    const prefix = value.trim();
    if (prefix) prefixes[calendarId] = prefix;
    else delete prefixes[calendarId];
    this.plugin.settings.googleCalendarPrefixes = prefixes;
    await this.plugin.saveSettings();
  }

  private calendarName(calendarId: string): string {
    return this.calendars.find((calendar) => calendar.id === calendarId)?.summary
      || this.plugin.settings.googleCalendarNames[calendarId]
      || calendarId;
  }

  private renderCalendarPicker(containerEl: HTMLElement, isConnected: boolean): void {
    const selected = this.plugin.syncCalendarIds();

    containerEl.createEl("h3", { text: "同期するカレンダー" });
    containerEl.createEl("p", { text: "選んだカレンダーの予定が手帳のMarkdownに書き込まれます。カレンダー名を表示し、IDはその下に表示します。各カレンダーの接頭記号には 👪 や 💼 など任意の文字を設定できます。" });

    new Setting(containerEl)
      .setName("カレンダー一覧を取得")
      .setDesc(isConnected ? "Googleから購読中のカレンダーを読み込みます。取得したカレンダー名は次回以降も保存されます。" : "先にGoogle Calendarへ接続してください。")
      .addButton((button) => button
        .setButtonText("取得")
        .setDisabled(!isConnected)
        .onClick(async () => {
          button.setDisabled(true);
          try {
            this.calendars = await this.plugin.listGoogleCalendars();
            new Notice(`${this.calendars.length}件のカレンダーを取得しました。`);
            this.display();
          } catch (error) {
            notifyGoogleError(error);
            button.setDisabled(false);
          }
        }));

    if (this.calendars.length) {
      for (const calendar of this.calendars) {
        new Setting(containerEl)
          .setName(calendar.primary ? `${calendar.summary}（メイン）` : calendar.summary)
          .setDesc(`ID: ${calendar.id}`)
          .addText((text) => {
            text.setPlaceholder("接頭記号 👪")
              .setValue(this.plugin.settings.googleCalendarPrefixes[calendar.id] ?? "")
              .onChange(async (value) => { await this.setCalendarPrefix(calendar.id, value); });
            text.inputEl.setAttribute("aria-label", `${calendar.summary} の接頭記号`);
          })
          .addToggle((toggle) => toggle
            .setValue(selected.includes(calendar.id))
            .onChange(async (value) => {
              const next = value ? [...selected, calendar.id] : selected.filter((id) => id !== calendar.id);
              await this.setCalendarIds(next);
            }));
      }
    }

    // Calendars the picker has not loaded — or that were typed in by hand — still need to be visible.
    for (const id of selected.filter((id) => !this.calendars.some((calendar) => calendar.id === id))) {
      const name = this.calendarName(id);
      new Setting(containerEl)
        .setName(name)
        .setDesc(name === id ? `同期対象 / ID: ${id}` : `ID: ${id}`)
        .addText((text) => {
          text.setPlaceholder("接頭記号 👪")
            .setValue(this.plugin.settings.googleCalendarPrefixes[id] ?? "")
            .onChange(async (value) => { await this.setCalendarPrefix(id, value); });
          text.inputEl.setAttribute("aria-label", `${name} の接頭記号`);
        })
        .addExtraButton((button) => button
          .setIcon("trash")
          .setTooltip("同期対象から外す")
          .onClick(async () => { await this.setCalendarIds(selected.filter((value) => value !== id)); }));
    }

    let manualId = "";
    new Setting(containerEl)
      .setName("カレンダーIDを手動で追加")
      .setDesc("一覧を取得できない場合に、GoogleカレンダーのIDを直接入力します。")
      .addText((text) => text.setPlaceholder("xxxx@group.calendar.google.com").onChange((value) => { manualId = value; }))
      .addButton((button) => button
        .setButtonText("追加")
        .onClick(async () => {
          if (!manualId.trim()) return;
          await this.setCalendarIds([...selected, manualId]);
        }));

    new Setting(containerEl)
      .setName("予定の追加先")
      .setDesc("「Google予定追加」で書き込むカレンダー。")
      .addDropdown((dropdown) => {
        for (const id of selected) dropdown.addOption(id, this.calendarName(id));
        dropdown.setValue(this.plugin.settings.googleWriteCalendarId || selected[0]);
        dropdown.onChange(async (value) => {
          this.plugin.settings.googleWriteCalendarId = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
