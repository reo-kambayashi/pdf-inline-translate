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
						// Basic validation for API key format
						const trimmedValue = value.trim();
						if (trimmedValue && !trimmedValue.startsWith('AIza')) {
							console.warn('APIキーの形式が正しくない可能性があります。');
						}
						this.plugin.settings.apiKey = trimmedValue;
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
						const trimmedValue = value.trim();
						// Validate model name to prevent empty values
						if (!trimmedValue) {
							console.warn('モデル名を空にすることはできません。');
							return;
						}
						this.plugin.settings.model = trimmedValue;
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
						const trimmedValue = value.trim() || DEFAULT_SETTINGS.targetLanguage;
						this.plugin.settings.targetLanguage = trimmedValue;
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
						// Validate token number
						if (!Number.isFinite(parsed) || parsed <= 0) {
							console.warn('最大出力トークンは正の数値である必要があります。');
							return;
						}
						this.plugin.settings.maxOutputTokens = parsed;
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
						// Validate alpha value
						if (value < 0 || value > 1) {
							console.warn('不透明度は0から1の間である必要があります。');
							return;
						}
						this.plugin.settings.popupBackgroundColorAlpha = value;
						this.plugin.updatePopupBackgroundColorAlpha();
						await this.plugin.saveSettings();
					}),
			);

		// New settings

		new Setting(containerEl)
			.setName("PDF選択時に自動翻訳")
			.setDesc("PDF++ 上でのテキスト選択完了後に自動で翻訳ビューを表示します。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAutoTranslate || false)
					.onChange(async (value) => {
						this.plugin.settings.enableAutoTranslate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("温度")
			.setDesc("モデル出力のランダム性を制御する値（0.0〜2.0）。低い値ほど決定的になります。")
			.addSlider((slider) =>
				slider
					.setLimits(0, 2, 0.05)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.temperature ?? 0.7)
					.onChange(async (value) => {
						if (value < 0 || value > 2) {
							console.warn('温度は0から2の間である必要があります。');
							return;
						}
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("タイムアウト (ミリ秒)")
			.setDesc("翻訳API呼び出しのタイムアウト時間（ミリ秒）。0に設定するとタイムアウトなし。")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.timeoutMs ?? 30000))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed) || parsed < 0) {
							console.warn('タイムアウトは0以上の数値である必要があります。');
							return;
						}
						this.plugin.settings.timeoutMs = parsed;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("システム指示")
			.setDesc("モデルに与える前提指示や翻訳スタイルを記述します。")
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.systemInstruction ?? DEFAULT_SETTINGS.systemInstruction)
					.onChange(async (value) => {
						this.plugin.settings.systemInstruction = value;
						await this.plugin.saveSettings();
					});
				textArea.inputEl.rows = 6;
				textArea.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("翻訳プロンプトテンプレート")
			.setDesc("翻訳に使用するプロンプトテンプレート。{{text}}, {{targetLanguage}}, {{page}} を使用できます。")
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.translationPromptTemplate ?? DEFAULT_SETTINGS.translationPromptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.translationPromptTemplate = value;
						await this.plugin.saveSettings();
					});
				textArea.inputEl.rows = 8;
				textArea.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("辞書プロンプトテンプレート")
			.setDesc("辞書検索に使用するプロンプトテンプレート。{{text}}, {{targetLanguage}}, {{page}} を使用できます。")
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.dictionaryPromptTemplate ?? DEFAULT_SETTINGS.dictionaryPromptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.dictionaryPromptTemplate = value;
						await this.plugin.saveSettings();
					});
				textArea.inputEl.rows = 8;
				textArea.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("翻訳履歴を有効にする")
			.setDesc("翻訳結果を履歴に保存し、同じテキストが翻訳された際にキャッシュを使用します。")
			.addToggle((toggle) => 
				toggle
					.setValue(this.plugin.settings.enableTranslationHistory)
					.onChange(async (value) => {
						this.plugin.settings.enableTranslationHistory = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("最大履歴アイテム数")
			.setDesc("保存する翻訳履歴アイテムの最大数。")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxHistoryItems))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed) || parsed <= 0) {
							console.warn('最大履歴アイテム数は正の数値である必要があります。');
							return;
						}
						this.plugin.settings.maxHistoryItems = parsed;
						await this.plugin.saveSettings();
					})
			);

		// Multi-provider settings
		new Setting(containerEl)
			.setName("翻訳プロバイダー")
			.setDesc("使用する翻訳サービスを選択してください。")
			.addDropdown((dropdown) => 
				dropdown
					.addOption('gemini', 'Gemini')
					.addOption('openai', 'OpenAI')
					.addOption('anthropic', 'Anthropic')
					.setValue(this.plugin.settings.translationProvider)
					.onChange(async (value) => {
						this.plugin.settings.translationProvider = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("OpenAI APIキー")
			.setDesc("OpenAI APIキーを入力してください（GPTを使用する場合）。")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.openAIApiKey || "")
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						this.plugin.settings.openAIApiKey = trimmedValue;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("OpenAI モデル")
			.setDesc("使用するOpenAIモデル名。")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.openAIModel || "gpt-4")
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						if (!trimmedValue) {
							console.warn('OpenAIモデル名を空にすることはできません。');
							return;
						}
						this.plugin.settings.openAIModel = trimmedValue;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Anthropic APIキー")
			.setDesc("Anthropic APIキーを入力してください（Claudeを使用する場合）。")
			.addText((text) =>
				text
					.setPlaceholder("ANTHROPIC_API_KEY")
					.setValue(this.plugin.settings.anthropicApiKey || "")
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						this.plugin.settings.anthropicApiKey = trimmedValue;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Anthropic モデル")
			.setDesc("使用するAnthropicモデル名。")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.anthropicModel || "claude-3-sonnet-20240229")
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						if (!trimmedValue) {
							console.warn('Anthropicモデル名を空にすることはできません。');
							return;
						}
						this.plugin.settings.anthropicModel = trimmedValue;
						await this.plugin.saveSettings();
					})
			);

		// UI customization settings
		new Setting(containerEl)
			.setName("ポップアップ幅")
			.setDesc("翻訳ポップアップの幅（ピクセル）")
			.addSlider((slider) =>
				slider
					.setLimits(200, 800, 50)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.popupWidth)
					.onChange(async (value) => {
						this.plugin.settings.popupWidth = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ポップアップ高さ")
			.setDesc("翻訳ポップアップの高さ（ピクセル）")
			.addSlider((slider) =>
				slider
					.setLimits(150, 600, 50)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.popupHeight)
					.onChange(async (value) => {
						this.plugin.settings.popupHeight = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ポップアップ位置")
			.setDesc("翻訳ポップアップのデフォルト位置")
			.addDropdown((dropdown) =>
				dropdown
					.addOption('top-right', '右上')
					.addOption('top-left', '左上')
					.addOption('bottom-right', '右下')
					.addOption('bottom-left', '左下')
					.addOption('custom', 'カスタム')
					.setValue(this.plugin.settings.popupPosition)
					.onChange(async (value) => {
						this.plugin.settings.popupPosition = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ポップアップテーマ")
			.setDesc("翻訳ポップアップのカラーテーマ")
			.addDropdown((dropdown) =>
				dropdown
					.addOption('default', 'デフォルト')
					.addOption('dark', 'ダーク')
					.addOption('light', 'ライト')
					.addOption('blue', 'ブルー')
					.addOption('green', 'グリーン')
					.setValue(this.plugin.settings.popupTheme)
					.onChange(async (value) => {
						this.plugin.settings.popupTheme = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("フォントサイズ")
			.setDesc("ポップアップ内のテキストフォントサイズ")
			.addDropdown((dropdown) =>
				dropdown
					.addOption('small', '小')
					.addOption('medium', '中')
					.addOption('large', '大')
					.setValue(this.plugin.settings.fontSize)
					.onChange(async (value) => {
						this.plugin.settings.fontSize = value as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("原文を表示")
			.setDesc("翻訳結果と一緒に原文を表示する")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showOriginalText)
					.onChange(async (value) => {
						this.plugin.settings.showOriginalText = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("自動でポップアップを展開")
			.setDesc("翻訳時に自動でポップアップを展開する")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoExpandPopup)
					.onChange(async (value) => {
						this.plugin.settings.autoExpandPopup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("言語検出を有効にする")
			.setDesc("入力テキストの言語を自動検出する")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableLanguageDetection)
					.onChange(async (value) => {
						this.plugin.settings.enableLanguageDetection = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("原文言語")
			.setDesc("言語検出を無効にした場合のデフォルト言語")
			.addText((text) =>
				text
					.setPlaceholder("例: en, ja, zh, auto")
					.setValue(this.plugin.settings.sourceLanguage)
					.onChange(async (value) => {
						const trimmedValue = value.trim() || 'auto';
						this.plugin.settings.sourceLanguage = trimmedValue;
						await this.plugin.saveSettings();
					})
			);

	}
}
