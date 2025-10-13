import { Notice } from 'obsidian';
import PdfInlineTranslatePlugin from '../main';
import { GeminiTranslationFloatingPopup } from './floating-popup';
import { TranslationContext } from '../types';
import { validateAndTrim } from '../utils';
import { TranslationProviderManager } from '../translation-provider-manager';
import { LanguageDetector } from '../language-detector';

export class UIManager {
    private plugin: PdfInlineTranslatePlugin;
    floatingPopup: GeminiTranslationFloatingPopup | null = null;
    private popupAbortController: AbortController | null = null;
    private providerManager: TranslationProviderManager;

    constructor(plugin: PdfInlineTranslatePlugin) {
        this.plugin = plugin;
        this.providerManager = new TranslationProviderManager(
            plugin.settings,
            plugin.historyManager,
        );
    }

    onload() {
        this.plugin.app.workspace.onLayoutReady(() => {
            this.ensureFloatingPopupContainer();
        });
    }

    onunload() {
        this.destroyFloatingPopup();
    }

    openTranslationInPopup(selectionText: string, context: TranslationContext) {
        // Use the validation utility function
        const validatedText = validateAndTrim(selectionText);
        if (!validatedText) {
            new Notice('選択テキストが無効です。');
            return;
        }

        if (validatedText.length > 10000) {
            // Set a reasonable limit
            new Notice('選択テキストが長すぎます。');
            return;
        }

        let popup;
        try {
            popup = this.getOrCreateFloatingPopup();
        } catch (error) {
            console.error('PDF Inline Translate: ポップアップを初期化できませんでした。', error);
            new Notice(
                '翻訳ポップアップを開くことができませんでした。詳細はコンソールを確認してください。',
            );
            return;
        }

        if (!popup) {
            new Notice('翻訳ポップアップが利用できません。');
            return;
        }

        if (this.popupAbortController) {
            try {
                this.popupAbortController.abort();
            } catch (error) {
                console.error(
                    'PDF Inline Translate: AbortControllerの処理中にエラーが発生しました',
                    error,
                );
            }
            this.popupAbortController = null;
        }

        const safeContext = context && typeof context === 'object' ? context : {};

        // Set up the expand handler to execute translation when expanded
        popup.setExpandHandler(() => {
            if (this.popupAbortController) {
                return;
            }
            void this.executeTranslationRequest(popup, validatedText, safeContext);
        });

        // Prepare the collapsed state with the new text
        popup.prepareCollapsedState(validatedText, safeContext);

        // If the popup is already expanded, execute the translation immediately
        if (popup.expanded) {
            void this.executeTranslationRequest(popup, validatedText, safeContext);
        } else if (this.plugin.settings.autoExpandPopup) {
            // If auto-expand is enabled, expand the popup and start translation
            void this.executeTranslationRequest(popup, validatedText, safeContext);
        } else {
            // If popup is collapsed but already exists, focus the popup
            popup.focus();
        }
    }

    private async prepareTranslationRequest(
        popup: GeminiTranslationFloatingPopup,
        selectionText: string,
        context: TranslationContext,
    ) {
        if (!popup) {
            console.error('PDF Inline Translate: ポップアップが無効です。');
            return false;
        }

        if (
            !selectionText ||
            typeof selectionText !== 'string' ||
            selectionText.trim().length === 0
        ) {
            popup.showError(selectionText || '', context || {}, '選択テキストが無効です。');
            new Notice('選択テキストが無効です。');
            return false;
        }

        const safeContext = context && typeof context === 'object' ? context : {};

        // Cancel any existing request
        if (this.popupAbortController) {
            try {
                this.popupAbortController.abort();
            } catch (error) {
                console.error(
                    'PDF Inline Translate: AbortControllerの処理中にエラーが発生しました',
                    error,
                );
            }
        }

        // Set up new abort controller
        const abortController = new AbortController();
        this.popupAbortController = abortController;

        // Configure the popup
        popup.setExpandHandler(null);
        popup.showLoading(selectionText, safeContext, true);
        popup.focus();

        return { safeContext, abortController };
    }

    private handleTranslationSuccess(
        popup: GeminiTranslationFloatingPopup,
        selectionText: string,
        translation: string,
        context: TranslationContext,
    ) {
        if (!popup) return;
        popup.showResult(selectionText, translation, context);
    }

    private handleTranslationError(
        popup: GeminiTranslationFloatingPopup,
        selectionText: string,
        context: TranslationContext,
        error: unknown,
    ) {
        if (!popup) return;

        console.error('PDF Inline Translate: 翻訳エラー', error);

        // Provide more user-friendly error messages based on error type
        let userFriendlyMessage = '翻訳に失敗しました。詳細はコンソールをご確認ください。';

        if (error instanceof Error) {
            const errorMessage = error.message;

            // Handle specific error types with custom messages
            if (errorMessage.includes('APIキー')) {
                userFriendlyMessage =
                    'APIキーが設定されていないか、無効です。設定を確認してください。';
            } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
                userFriendlyMessage =
                    'APIのレート制限に達しました。しばらく時間を置いてから再度お試しください。';
            } else if (errorMessage.includes('quota')) {
                userFriendlyMessage = 'APIの使用制限に達しました。料金プランを確認してください。';
            } else if (errorMessage.includes('cancelled')) {
                userFriendlyMessage = '翻訳がキャンセルされました。';
            } else if (errorMessage.includes('empty')) {
                userFriendlyMessage = '翻訳するテキストが空です。';
            } else if (errorMessage.includes('Block') || errorMessage.includes('block')) {
                userFriendlyMessage =
                    'Geminiが安全上またはコンテンツポリシーの理由で出力をブロックしました。';
            } else {
                userFriendlyMessage = errorMessage;
            }
        } else if (typeof error === 'string') {
            userFriendlyMessage = error;
        }

        popup.showError(selectionText, context, userFriendlyMessage);
        new Notice(`Gemini翻訳エラー: ${userFriendlyMessage}`);
    }

    private cleanupAbortController(abortController: AbortController) {
        if (this.popupAbortController === abortController) {
            this.popupAbortController = null;
        }
    }

    async executeTranslationRequest(
        popup: GeminiTranslationFloatingPopup,
        selectionText: string,
        context: TranslationContext,
    ) {
        const result = await this.prepareTranslationRequest(popup, selectionText, context);
        if (!result || typeof result === 'boolean') return;

        const { safeContext, abortController } = result;

        // Determine source language
        let sourceLanguage: string | undefined;
        if (this.plugin.settings.enableLanguageDetection) {
            sourceLanguage = LanguageDetector.detectLanguage(selectionText);
        } else {
            sourceLanguage = this.plugin.settings.sourceLanguage;
        }

        try {
            const translationResult = await this.providerManager.translate(
                selectionText,
                this.plugin.settings.targetLanguage,
                sourceLanguage,
                safeContext,
                abortController.signal,
            );

            // Check if the request was aborted after the API call completed
            if (abortController.signal.aborted) {
                popup.showCancelled(selectionText, safeContext);
                return;
            }

            if (!translationResult.success || !translationResult.text) {
                throw new Error(translationResult.error || 'Translation failed');
            }

            const translation = translationResult.text;

            if (
                !translation ||
                typeof translation !== 'string' ||
                translation.trim().length === 0
            ) {
                throw new Error('翻訳結果が無効です。');
            }

            this.handleTranslationSuccess(popup, selectionText, translation, safeContext);
        } catch (error) {
            if (abortController.signal.aborted) {
                popup.showCancelled(selectionText, safeContext);
                return;
            }

            this.handleTranslationError(popup, selectionText, safeContext, error);
        } finally {
            this.cleanupAbortController(abortController);
        }
    }

    ensureFloatingPopupContainer() {
        this.getOrCreateFloatingPopup();
    }

    getOrCreateFloatingPopup(): GeminiTranslationFloatingPopup {
        if (this.floatingPopup) {
            return this.floatingPopup;
        }
        const popup = new GeminiTranslationFloatingPopup(this.plugin);
        popup.setCloseHandler(() => {
            this.destroyFloatingPopup();
        });
        this.floatingPopup = popup;
        return popup;
    }

    closeFloatingPopup() {
        this.destroyFloatingPopup();
    }

    destroyFloatingPopup() {
        if (!this.floatingPopup) {
            return;
        }

        this.plugin.selectionManager.setManuallyClosedSelectionKey(
            this.plugin.selectionManager.getLastAutoTranslateKey(),
        );
        if (this.popupAbortController) {
            try {
                this.popupAbortController.abort();
            } catch (error) {
                console.error(error);
            }
            this.popupAbortController = null;
        }

        if (this.floatingPopup) {
            this.floatingPopup.destroy();
            this.floatingPopup = null;
        }
    }
}
