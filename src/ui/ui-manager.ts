import { Notice } from "obsidian";
import PdfInlineTranslatePlugin from "../main";
import { GeminiTranslationFloatingPopup } from "./floating-popup";

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

	openTranslationInPopup(selectionText: string, context: any) {
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

	async executeTranslationRequest(
		popup: GeminiTranslationFloatingPopup,
		selectionText: string,
		context: any,
	) {
		if (!popup) {
			console.error("PDF Inline Translate: ポップアップが無効です。");
			return;
		}
		
		if (!selectionText || typeof selectionText !== 'string' || selectionText.trim().length === 0) {
			popup.showError(selectionText || "", context || {}, "選択テキストが無効です。");
			new Notice("選択テキストが無効です。");
			return;
		}

		const safeContext = context && typeof context === 'object' ? context : {};
		popup.setExpandHandler(null);
		popup.showLoading(selectionText, safeContext, true);
		popup.focus();

		if (this.popupAbortController) {
			try {
				this.popupAbortController.abort();
			} catch (error) {
				console.error("PDF Inline Translate: AbortControllerの処理中にエラーが発生しました", error);
			}
		}

		const abortController = new AbortController();
		this.popupAbortController = abortController;

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
			
			popup.showResult(selectionText, translation, safeContext);
		} catch (error) {
			if (abortController.signal.aborted) {
				popup.showCancelled(selectionText, safeContext);
				return;
			}
			
			console.error("PDF Inline Translate: 翻訳エラー", error);
			
			const errorMessage = error instanceof Error 
				? error.message 
				: typeof error === 'string' 
					? error 
					: "翻訳に失敗しました。詳細はコンソールをご確認ください。";
			
			popup.showError(selectionText, safeContext, errorMessage);
			new Notice(
				errorMessage.includes("Gemini翻訳エラー") 
					? errorMessage 
					: `Gemini翻訳エラー: ${errorMessage}`,
			);
		} finally {
			if (this.popupAbortController === abortController) {
				this.popupAbortController = null;
			}
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
