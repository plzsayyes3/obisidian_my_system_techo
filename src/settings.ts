import { PluginSettingTab, Setting } from "obsidian";
import type MySystemTechoPlugin from "./main";

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
      .addText((text) => text
        .setPlaceholder("techo")
        .setValue(this.plugin.settings.sourceFolder)
        .onChange(async (value) => {
          this.plugin.settings.sourceFolder = value.trim().replace(/^\/+|\/+$/g, "");
          await this.plugin.saveSettings();
        }));
  }
}
