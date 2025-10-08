import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { PluginSettings } from "../settings";
import { translate, LocaleId } from "../locales";

export interface SettingsHost extends Plugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  getLocale(): LocaleId;
}

/**
 * 設定タブで Gemini API キーなどを入力させる。
 */
export class TranslatableSettingsTab extends PluginSettingTab {
  private readonly host: SettingsHost;

  constructor(app: App, plugin: SettingsHost) {
    super(app, plugin);
    this.host = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const locale = this.host.getLocale();

    containerEl.createEl("h2", { text: translate("settings.title", locale) });

    new Setting(containerEl)
      .setName(translate("settings.apiKey.name", locale))
      .setDesc(translate("settings.apiKey.desc", locale))
      .addText((text) =>
        text
          .setPlaceholder("AIza...")
          .setValue(this.host.settings.apiKey)
          .onChange(async (value) => {
            this.host.settings.apiKey = value.trim();
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(translate("settings.targetLang.name", locale))
      .setDesc(translate("settings.targetLang.desc", locale))
      .addText((text) =>
        text
          .setPlaceholder("ja")
          .setValue(this.host.settings.targetLanguage)
          .onChange(async (value) => {
            this.host.settings.targetLanguage = value.trim() || "ja";
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(translate("settings.sourceLang.name", locale))
      .setDesc(translate("settings.sourceLang.desc", locale))
      .addText((text) =>
        text
          .setPlaceholder("auto detect")
          .setValue(this.host.settings.sourceLanguage ?? "")
          .onChange(async (value) => {
            this.host.settings.sourceLanguage = value.trim() || null;
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(translate("settings.timeout.name", locale))
      .setDesc(translate("settings.timeout.desc", locale))
      .addSlider((slider) =>
        slider
          .setLimits(5_000, 60_000, 1_000)
          .setValue(this.host.settings.timeoutMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings.timeoutMs = value;
            await this.host.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(translate("settings.retries.name", locale))
      .setDesc(translate("settings.retries.desc", locale))
      .addSlider((slider) =>
        slider
          .setLimits(0, 5, 1)
          .setValue(this.host.settings.maxRetries)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.host.settings.maxRetries = value;
            await this.host.saveSettings();
          })
      );
  }
}
