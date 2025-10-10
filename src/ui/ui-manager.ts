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
				console.error(error);
			}
			this.popupAbortController = null;
		}

		const safeContext = context ?? {};
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
		const safeContext = context ?? {};
		popup.setExpandHandler(null);
		popup.showLoading(selectionText, safeContext, true);
		popup.focus();

		if (this.popupAbortController) {
			try {
				this.popupAbortController.abort();
			} catch (error) {
				console.error(error);
			}
		}

		const abortController = new AbortController();
		this.popupAbortController = abortController;

		try {
			const translation =
				await this.plugin.geminiClient.requestTranslation(
					selectionText,
					context,
					abortController.signal,
				);
			if (abortController.signal.aborted) {
				popup.showCancelled(selectionText, safeContext);
				return;
			}
			popup.showResult(selectionText, translation, safeContext);
		} catch (error) {
			if (abortController.signal.aborted) {
				popup.showCancelled(selectionText, safeContext);
				return;
			}
			console.error(error);
			const message =
				error?.message ??
				"翻訳に失敗しました。詳細はコンソールをご確認ください。";
			popup.showError(selectionText, safeContext, message);
			new Notice(
				error?.message
					? `Gemini翻訳エラー: ${error.message}`
					: "Gemini翻訳に失敗しました。",
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
