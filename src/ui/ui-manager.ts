import { Notice } from "obsidian";
import PdfInlineTranslatePlugin from "../main";
import { GeminiTranslationFloatingPopup } from "./floating-popup";
import { TranslationContext } from "../types";

export class UIManager {
	private plugin: PdfInlineTranslatePlugin;
	floatingPopup: GeminiTranslationFloatingPopup | null = null;
	private popupAbortController: AbortController | null = null;

	constructor(plugin: PdfInlineTranslatePlugin) {
		this.plugin = plugin;
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
		if (!selectionText || typeof selectionText !== 'string') {
			new Notice("選択テキストが無効です。");
			return;
		}
		
		if (selectionText.trim().length === 0) {
			new Notice("選択テキストが空です。");
			return;
		}
		
		if (selectionText.length > 10000) { // Set a reasonable limit
			new Notice("選択テキストが長すぎます。");
			return;
		}

		let popup;
		try {
			popup = this.getOrCreateFloatingPopup();
		} catch (error) {
			console.error(
				"PDF Inline Translate: ポップアップを初期化できませんでした。",
				error,
			);
			new Notice(
				"翻訳ポップアップを開くことができませんでした。詳細はコンソールを確認してください。",
			);
			return;
		}

		if (!popup) {
			new Notice("翻訳ポップアップが利用できません。");
			return;
		}

		if (this.popupAbortController) {
			try {
				this.popupAbortController.abort();
			} catch (error) {
				console.error("PDF Inline Translate: AbortControllerの処理中にエラーが発生しました", error);
			}
			this.popupAbortController = null;
		}

		const safeContext = context && typeof context === 'object' ? context : {};
		popup.setExpandHandler(() => {
			if (this.popupAbortController) {
				return;
			}
			void this.executeTranslationRequest(popup, selectionText, safeContext);
		});
		popup.prepareCollapsedState(selectionText, safeContext);
		popup.focus();
	}

	private async prepareTranslationRequest(
		popup: GeminiTranslationFloatingPopup,
		selectionText: string,
		context: TranslationContext,
	) {
		if (!popup) {
			console.error("PDF Inline Translate: ポップアップが無効です。");
			return false;
		}
		
		if (!selectionText || typeof selectionText !== 'string' || selectionText.trim().length === 0) {
			popup.showError(selectionText || "", context || {}, "選択テキストが無効です。");
			new Notice("選択テキストが無効です。");
			return false;
		}

		const safeContext = context && typeof context === 'object' ? context : {};
		
		// Cancel any existing request
		if (this.popupAbortController) {
			try {
				this.popupAbortController.abort();
			} catch (error) {
				console.error("PDF Inline Translate: AbortControllerの処理中にエラーが発生しました", error);
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
		error: any,
	) {
		if (!popup) return;
		
		console.error("PDF Inline Translate: 翻訳エラー", error);
		
		const errorMessage = error instanceof Error 
			? error.message 
			: typeof error === 'string' 
				? error 
				: "翻訳に失敗しました。詳細はコンソールをご確認ください。";
		
		popup.showError(selectionText, context, errorMessage);
		new Notice(
			errorMessage.includes("Gemini翻訳エラー") 
				? errorMessage 
				: `Gemini翻訳エラー: ${errorMessage}`,
		);
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

		try {
			const translation = await this.plugin.geminiClient.requestTranslation(
				selectionText,
				safeContext,
				abortController.signal,
			);
			
			// Check if the request was aborted after the API call completed
			if (abortController.signal.aborted) {
				popup.showCancelled(selectionText, safeContext);
				return;
			}
			
			if (!translation || typeof translation !== 'string' || translation.trim().length === 0) {
				throw new Error("翻訳結果が無効です。");
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
