import { App, PluginSettingTab, Setting } from "obsidian";
import PdfInlineTranslatePlugin from "./main";
import { DEFAULT_SETTINGS } from "./constants";

export class PdfInlineTranslateSettingTab extends PluginSettingTab {
	plugin: PdfInlineTranslatePlugin;

	constructor(app: App, plugin: PdfInlineTranslatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "PDF Inline Translate (Gemini) 設定" });

		new Setting(containerEl)
			.setName("Gemini APIキー")
			.setDesc("https://aistudio.google.com/ で発行したAPIキーを入力してください。")
			.addText((text) =>
				text
					.setPlaceholder("AIza...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("モデル")
			.setDesc("使用するGeminiモデル名。例: gemini-2.5-flash-lite")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("出力言語")
			.setDesc("翻訳結果を出力したい言語を指定します。")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.targetLanguage)
					.onChange(async (value) => {
						this.plugin.settings.targetLanguage = value.trim() || "日本語";
						await this.plugin.saveSettings();
					}),
			);






		new Setting(containerEl)
			.setName("最大出力トークン")
			.setDesc("翻訳結果の最大トークン数（単語数ではありません）。")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxOutputTokens))
					.onChange(async (value) => {
						const parsed = Number(value);
						this.plugin.settings.maxOutputTokens = Number.isFinite(parsed)
							? parsed
							: DEFAULT_SETTINGS.maxOutputTokens;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("ポップアップ背景の不透明度")
			.setDesc("値が小さいほど透明になります。")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.05)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.popupBackgroundColorAlpha)
					.onChange(async (value) => {
						this.plugin.settings.popupBackgroundColorAlpha = value;
						this.plugin.updatePopupBackgroundColorAlpha();
						await this.plugin.saveSettings();
					}),
			);
	}
}
