import { MarkdownView, Notice, Plugin } from 'obsidian';
import { PdfInlineTranslatePluginSettings, TranslationContext } from './types';
import { DEFAULT_SETTINGS, LEGACY_DEFAULT_GEMINI_MODEL } from './constants';
import { PdfInlineTranslateSettingTab } from './settings-tab';
import { GeminiTranslationFloatingPopup } from './ui/floating-popup';
import { GeminiClient } from './api/gemini-client';
import { SelectionManager } from './selection-manager';
import { UIManager } from './ui/ui-manager';
import { TranslationHistoryManager } from './translation-history-manager';
import {
    TRANSLATION_HISTORY_VIEW_TYPE,
    TranslationHistoryView,
} from './ui/translation-history-view';
import { TranslationProviderManager } from './translation-provider-manager';
import { BatchTranslationService } from './batch-translation-service';
import { registerCommands } from './commands';

declare global {
    interface Window {
        pdfPlus?: {
            getActiveViewer: () => any;
        };
    }
}

import { TranslationHistory } from './types';

export default class PdfInlineTranslatePlugin extends Plugin {
    settings: PdfInlineTranslatePluginSettings;
    geminiClient: GeminiClient;
    selectionManager: SelectionManager;
    uiManager: UIManager;
    providerManager: TranslationProviderManager;
    lastSelection: { text: string; context: TranslationContext } | null = null;
    translationHistory: TranslationHistory;

    async onload() {
        console.info('PDF Inline Translate (Gemini) ロード開始');
        await this.loadSettings();
        this.updatePopupBackgroundColorAlpha();

        this.selectionManager = new SelectionManager(this);
        this.uiManager = new UIManager(this);
        this.batchTranslationService = new BatchTranslationService(
            this.providerManager,
            this.translationHistoryManager,
            this.uiManager,
        );

        this.selectionManager.onload();
        this.uiManager.onload();

        // Register the translation history view
        this.registerView(
            TRANSLATION_HISTORY_VIEW_TYPE,
            (leaf) => new TranslationHistoryView(leaf, this),
        );

        registerCommands(this);

        this.addSettingTab(new PdfInlineTranslateSettingTab(this.app, this));

        if (!window.pdfPlus) {
            new Notice(
                'PDF Inline Translate: PDF++プラグインが見つかりません。PDF++を有効化してください。',
            );
        }
    }

    public initiateBatchTranslation() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;

        if (!editor) {
            new Notice('Please open a note with text to translate in batch');
            return;
        }

        this.batchService.initiateBatchTranslationFromEditor(
            editor,
            this.settings.targetLanguage,
        );
    }



    async openTranslationHistoryView() {
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: TRANSLATION_HISTORY_VIEW_TYPE,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        console.info('PDF Inline Translate (Gemini) アンロード');
        if (this.selectionManager) {
            this.selectionManager.onunload();
        }
        if (this.uiManager) {
            this.uiManager.onunload();
        }
    }

    private translationHistoryManager: TranslationHistoryManager;
    private batchTranslationService: BatchTranslationService;

    async loadSettings() {
        const loadedData = await this.loadData();
        let shouldPersistMigratedSettings = false;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
        if (
            !loadedData?.model ||
            loadedData.model === LEGACY_DEFAULT_GEMINI_MODEL
        ) {
            this.settings.model = DEFAULT_SETTINGS.model;
            shouldPersistMigratedSettings = true;
        }

        // Initialize or load translation history
        const historyData = loadedData?.translationHistory;
        this.translationHistory = {
            items: Array.isArray(historyData?.items) ? historyData.items : [],
        };

        // Initialize the translation history manager
        this.translationHistoryManager = new TranslationHistoryManager(this);

        // Initialize the provider manager and gemini client
        this.providerManager = new TranslationProviderManager(
            this.settings,
            this.translationHistoryManager,
        );
        this.geminiClient = new GeminiClient(this.settings, this.translationHistoryManager);

        if (shouldPersistMigratedSettings) {
            await this.saveSettings();
        }
    }

    async saveSettings() {
        // Merge translation history into settings before saving
        await this.saveData({
            ...this.settings,
            translationHistory: this.translationHistory,
        });
    }

    refreshTranslationProviders() {
        this.providerManager.refreshProviders();
    }

    updatePopupBackgroundColorAlpha() {
        document.body.style.setProperty(
            '--popup-background-alpha',
            this.settings.popupBackgroundColorAlpha.toString(),
        );
    }

    openTranslation(selectionText: string, context: any) {
        try {
            this.providerManager.validateProvider();
        } catch (error) {
            new Notice(error.message);
            this.openSettingTab();
            return;
        }

        if (
            !selectionText ||
            typeof selectionText !== 'string' ||
            selectionText.trim().length === 0
        ) {
            new Notice('選択テキストが無効です。');
            return;
        }

        // Check if text is too long
        if (selectionText.length > 10000) {
            // Adjust as needed based on API limits
            new Notice('選択テキストが長すぎます（最大10,000文字）。');
            return;
        }

        try {
            const preparedContext = this.selectionManager.prepareContext(context);

            this.lastSelection = {
                text: selectionText,
                context: preparedContext,
            };
            void this.uiManager.openTranslationInPopup(selectionText, preparedContext);
        } catch (error) {
            console.error('PDF Inline Translate: Failed to open translation', error);
            new Notice('翻訳を開く際にエラーが発生しました。詳細はコンソールをご確認ください。');
        }
    }

    getAssetUrl(relativePath: string): string | null {
        if (!relativePath || typeof relativePath !== 'string' || relativePath.trim().length === 0) {
            return null;
        }

        const adapter = this.app?.vault?.adapter;
        if (!adapter) {
            return null;
        }

        const configDir =
            this.app?.vault?.configDir && typeof this.app.vault.configDir === 'string'
                ? this.app.vault.configDir
                : '.obsidian';
        const pluginId =
            this.manifest?.id && typeof this.manifest.id === 'string'
                ? this.manifest.id
                : 'pdf-inline-translate';
        const normalizedPath = `${configDir}/plugins/${pluginId}/${relativePath}`;

        if (typeof adapter.getResourcePath === 'function') {
            try {
                const resourcePath = adapter.getResourcePath(normalizedPath);
                return typeof resourcePath === 'string' && resourcePath.length > 0
                    ? resourcePath
                    : null;
            } catch (error) {
                console.error('PDF Inline Translate: アセットURLの取得に失敗しました。', error);
            }
        }
        return null;
    }

    closeFloatingPopup() {
        this.uiManager.closeFloatingPopup();
    }

    openSettingTab() {
        const settingTabManager = (this.app as any).setting;
        if (!settingTabManager) {
            return;
        }
        if (typeof settingTabManager.open === 'function') {
            settingTabManager.open();
        }
        if (typeof settingTabManager.openTabById === 'function') {
            settingTabManager.openTabById(this.manifest.id);
        }
    }

    get floatingPopup(): GeminiTranslationFloatingPopup | null {
        return this.uiManager?.floatingPopup ?? null;
    }

    get historyManager(): TranslationHistoryManager {
        return this.translationHistoryManager;
    }

    get batchService(): BatchTranslationService {
        return this.batchTranslationService;
    }
}
