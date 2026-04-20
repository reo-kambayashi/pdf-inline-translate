import { App, PluginSettingTab, Setting } from 'obsidian';
import PdfInlineTranslatePlugin from './main';
import { DEFAULT_GEMINI_MODEL, DEFAULT_SETTINGS, GEMINI_MODELS } from './constants';
import { GeminiModelId } from './types';
import {
    addToggleSetting,
    addTextSetting,
    addDropdownSetting,
    addSliderSetting,
} from './settings-helpers';

export class PdfInlineTranslateSettingTab extends PluginSettingTab {
    plugin: PdfInlineTranslatePlugin;

    constructor(app: App, plugin: PdfInlineTranslatePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private async saveProviderSettings() {
        await this.plugin.saveSettings();
        this.plugin.refreshTranslationProviders();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'PDF Inline Translate 設定' });

        // ── 一般設定 ──────────────────────────────────────────────
        containerEl.createEl('h3', { text: '一般設定' });

        addToggleSetting(
            containerEl,
            '言語検出を有効にする',
            '入力テキストの言語を自動検出する',
            () => this.plugin.settings.enableLanguageDetection,
            async (value) => { this.plugin.settings.enableLanguageDetection = value; await this.plugin.saveSettings(); },
        );

        addTextSetting(
            containerEl,
            '原文言語',
            '言語検出を無効にした場合のデフォルト言語',
            '例: en, ja, zh, auto',
            () => this.plugin.settings.sourceLanguage,
            async (value) => { this.plugin.settings.sourceLanguage = value.trim() || 'auto'; await this.plugin.saveSettings(); },
        );

        addTextSetting(
            containerEl,
            '出力言語',
            '翻訳結果を出力したい言語を指定します。',
            '',
            () => this.plugin.settings.targetLanguage,
            async (value) => { this.plugin.settings.targetLanguage = value.trim() || DEFAULT_SETTINGS.targetLanguage; await this.plugin.saveSettings(); },
        );

        // ── Gemini API ────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Gemini API' });

        // API key — rendered as a password input so it isn't shoulder-surfed.
        new Setting(containerEl)
            .setName('Gemini APIキー')
            .setDesc('https://aistudio.google.com/ で発行したAPIキーを入力してください。')
            .addText((text) => {
                text.inputEl.type = 'password';
                text.inputEl.autocomplete = 'off';
                text.inputEl.spellcheck = false;
                text.setPlaceholder('AIza...')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        const trimmedValue = value.trim();
                        if (trimmedValue && !trimmedValue.startsWith('AIza')) {
                            console.warn('APIキーの形式が正しくない可能性があります。');
                        }
                        this.plugin.settings.apiKey = trimmedValue;
                        await this.saveProviderSettings();
                    });
            });

        const modelOptions = Object.fromEntries(
            Object.values(GEMINI_MODELS).map((info) => [info.id, info.label]),
        );
        const currentModelId = this.plugin.settings.model ?? DEFAULT_GEMINI_MODEL;
        const currentModelInfo = GEMINI_MODELS[currentModelId] ?? GEMINI_MODELS[DEFAULT_GEMINI_MODEL];
        addDropdownSetting(
            containerEl,
            'モデル',
            `現在: ${currentModelInfo.description} ` +
                `(入力 $${currentModelInfo.inputPricePerMTokenUsd}/M / 出力 $${currentModelInfo.outputPricePerMTokenUsd}/M)`,
            modelOptions,
            () => currentModelId,
            async (value) => {
                this.plugin.settings.model = value as GeminiModelId;
                await this.saveProviderSettings();
                this.display();
            },
        );

        // ── ポップアップUI ─────────────────────────────────────────
        containerEl.createEl('h3', { text: 'ポップアップUI' });

        addDropdownSetting(
            containerEl,
            'ポップアップ位置',
            '翻訳ポップアップのデフォルト位置',
            { 'top-right': '右上', 'top-left': '左上', 'bottom-right': '右下', 'bottom-left': '左下', custom: 'カスタム' },
            () => this.plugin.settings.popupPosition,
            async (value) => { this.plugin.settings.popupPosition = value as never; await this.plugin.saveSettings(); },
        );

        addDropdownSetting(
            containerEl,
            'ポップアップテーマ',
            '翻訳ポップアップのカラーテーマ',
            { system: 'システム (自動)', dark: 'ダーク', light: 'ライト', blue: 'ブルー', green: 'グリーン' },
            () => this.plugin.settings.popupTheme,
            async (value) => { this.plugin.settings.popupTheme = value as never; await this.plugin.saveSettings(); },
        );

        addDropdownSetting(
            containerEl,
            'フォントサイズ',
            'ポップアップ内のテキストフォントサイズ',
            { small: '小', medium: '中', large: '大' },
            () => this.plugin.settings.fontSize,
            async (value) => { this.plugin.settings.fontSize = value as never; await this.plugin.saveSettings(); },
        );

        addSliderSetting(
            containerEl,
            'ポップアップ背景の不透明度',
            '値が小さいほど透明になります。',
            0, 1, 0.05,
            () => this.plugin.settings.popupBackgroundColorAlpha,
            async (value) => {
                if (value < 0 || value > 1) { console.warn('不透明度は0から1の間である必要があります。'); return; }
                this.plugin.settings.popupBackgroundColorAlpha = value;
                this.plugin.updatePopupBackgroundColorAlpha();
                await this.plugin.saveSettings();
            },
        );

        addToggleSetting(
            containerEl,
            '原文を表示',
            '翻訳結果と一緒に原文を表示する',
            () => this.plugin.settings.showOriginalText,
            async (value) => { this.plugin.settings.showOriginalText = value; await this.plugin.saveSettings(); },
        );

        addToggleSetting(
            containerEl,
            '自動でポップアップを展開',
            '翻訳時に自動でポップアップを展開する',
            () => this.plugin.settings.autoExpandPopup,
            async (value) => { this.plugin.settings.autoExpandPopup = value; await this.plugin.saveSettings(); },
        );

        // ── 高度な設定 ─────────────────────────────────────────────
        containerEl.createEl('h3', { text: '高度な設定' });

        addSliderSetting(
            containerEl,
            '温度',
            'モデル出力のランダム性を制御する値（0.0〜2.0）。低い値ほど決定的になります。',
            0, 2, 0.05,
            () => this.plugin.settings.temperature ?? DEFAULT_SETTINGS.temperature ?? 0.2,
            async (value) => {
                if (value < 0 || value > 2) { console.warn('温度は0から2の間である必要があります。'); return; }
                this.plugin.settings.temperature = value;
                await this.plugin.saveSettings();
            },
        );

        addTextSetting(
            containerEl,
            '最大出力トークン',
            '翻訳結果の最大トークン数（単語数ではありません）。',
            '',
            () => String(this.plugin.settings.maxOutputTokens),
            async (value) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) { console.warn('最大出力トークンは正の数値である必要があります。'); return; }
                this.plugin.settings.maxOutputTokens = parsed;
                await this.plugin.saveSettings();
            },
        );

        addTextSetting(
            containerEl,
            'タイムアウト (ミリ秒)',
            '翻訳API呼び出しのタイムアウト時間（ミリ秒）。0に設定するとタイムアウトなし。',
            '',
            () => String(this.plugin.settings.timeoutMs ?? 30000),
            async (value) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed < 0) { console.warn('タイムアウトは0以上の数値である必要があります。'); return; }
                this.plugin.settings.timeoutMs = parsed;
                await this.plugin.saveSettings();
            },
        );

        // Prompts (system instruction / translation / dictionary) are now
        // maintained in code (src/constants.ts) and intentionally omitted
        // from the settings UI so that improvements ship with the plugin.

        // ── 翻訳履歴 ───────────────────────────────────────────────
        containerEl.createEl('h3', { text: '翻訳履歴' });

        addToggleSetting(
            containerEl,
            '翻訳履歴を有効にする',
            '翻訳結果を履歴に保存し、同じテキストが翻訳された際にキャッシュを使用します。',
            () => this.plugin.settings.enableTranslationHistory,
            async (value) => { this.plugin.settings.enableTranslationHistory = value; await this.plugin.saveSettings(); },
        );

        addTextSetting(
            containerEl,
            '最大履歴アイテム数',
            '保存する翻訳履歴アイテムの最大数。',
            '',
            () => String(this.plugin.settings.maxHistoryItems),
            async (value) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) { console.warn('最大履歴アイテム数は正の数値である必要があります。'); return; }
                this.plugin.settings.maxHistoryItems = parsed;
                await this.plugin.saveSettings();
            },
        );
    }
}
