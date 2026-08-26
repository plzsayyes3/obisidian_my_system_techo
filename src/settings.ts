import { PluginSettingTab, Setting } from "obsidian";
import type MySystemTechoPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

export class MySystemTechoSettingTab extends PluginSettingTab {
  plugin: MySystemTechoPlugin;

  constructor(app: any, plugin: MySystemTechoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "My-system-Techo" });

    new Setting(containerEl)
      .setName("表示範囲")
      .setDesc("年・月・週の表示範囲")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("year", "年")
          .addOption("month", "月")
          .addOption("week", "週")
          .setValue(this.plugin.settings.scope)
          .onChange(async (value) => {
            this.plugin.settings.scope = value as any;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("表示形式")
      .setDesc("現在の公開版では基本形式から再構築します")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("techo-year", "年")
          .addOption("month-block", "1ブロック")
          .addOption("month-list", "2リスト")
          .addOption("month-block-series", "月リニアブロック")
          .addOption("month-chronos", "タイムライン")
          .addOption("week-vertical", "バーチカル")
          .addOption("week-block", "ブロック")
          .setValue(this.plugin.settings.style)
          .onChange(async (value) => {
            this.plugin.settings.style = value as any;
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }
}

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}
