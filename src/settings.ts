import { Notice, PluginSettingTab, Setting } from "obsidian";
import type MySystemTechoPlugin from "./main";
import { authorizeGoogle, notifyGoogleError } from "./google";

export class MySystemTechoSettingTab extends PluginSettingTab {
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
    containerEl.createEl("p", { text: "読み取り専用でGoogle Calendarの予定を取得します。OAuthトークンとClient SecretはこのVaultのプラグインデータに保存され、GitHubには送信されません。" });

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

    new Setting(containerEl)
      .setName("Calendar ID")
      .setDesc("取得するカレンダー。通常は primary。")
      .addText((text) => text.setPlaceholder("primary").setValue(this.plugin.settings.googleCalendarId).onChange(async (value) => {
        this.plugin.settings.googleCalendarId = value.trim() || "primary";
        await this.plugin.saveSettings();
      }));

    const tokens = this.plugin.settings.googleTokens;
    const isConnected = Boolean(tokens?.accessToken || tokens?.refreshToken);

    new Setting(containerEl)
      .setName("Google Calendarに接続")
      .setDesc("デスクトップ版ObsidianでGoogleの認証画面を開きます。")
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
  }
}
