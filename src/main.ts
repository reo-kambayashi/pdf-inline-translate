import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { PdfInlineTranslatePluginSettings } from './types';
import { DEFAULT_SETTINGS, GEMINI_API_BASE, AUTO_TRANSLATE_DEBOUNCE_MS, AUTO_TRANSLATE_REPEAT_THRESHOLD_MS } from './constants';
import { PdfInlineTranslateSettingTab } from './settings-tab';
import { GeminiTranslationFloatingPopup } from './ui/floating-popup';

declare global {
    interface Window {
        pdfPlus?: {
            getActiveViewer: () => any;
        };
    }
}

export default class PdfInlineTranslatePlugin extends Plugin {
	settings: PdfInlineTranslatePluginSettings;
	autoTranslateTimer: number | null = null;
	lastAutoTranslateKey: string | null = null;
	lastAutoTranslateTriggeredAt: number = 0;
	popupAbortController: AbortController | null = null;
	floatingPopup: GeminiTranslationFloatingPopup | null = null;
	isPointerSelecting: boolean = false;
	manuallyClosedSelectionKey: string | null = null;
    lastSelection: { text: string; context: any; } | null = null;

	async onload() {
		console.info("PDF Inline Translate (Gemini) ロード開始");
		await this.loadSettings();
		this.updatePopupBackgroundColorAlpha();

		this.addSettingTab(new PdfInlineTranslateSettingTab(this.app, this));

		this.registerDomEvent(document, "selectionchange", () => {
			this.scheduleAutoTranslateCheck();
		});

		this.registerDomEvent(document, "pointerdown", () => {
			this.isPointerSelecting = true;
			const cancelTimer = window?.clearTimeout ?? clearTimeout;
			if (this.autoTranslateTimer) {
				cancelTimer(this.autoTranslateTimer);
				this.autoTranslateTimer = null;
			}
		});

		this.registerDomEvent(document, "pointerup", () => {
			this.isPointerSelecting = false;
			this.scheduleAutoTranslateCheck();
		});

		this.registerDomEvent(document, "pointercancel", () => {
			this.isPointerSelecting = false;
		});

		this.registerDomEvent(window, "blur", () => {
			this.isPointerSelecting = false;
		});

		this.register(() => {
			const cancelTimer = window?.clearTimeout ?? clearTimeout;
			if (this.autoTranslateTimer) {
				cancelTimer(this.autoTranslateTimer);
				this.autoTranslateTimer = null;
			}
			if (this.popupAbortController) {
				try {
					this.popupAbortController.abort();
				} catch (error) {
					console.error(error);
				}
				this.popupAbortController = null;
			}
			this.destroyFloatingPopup();
			this.isPointerSelecting = false;
		});

		this.app.workspace.onLayoutReady(() => {
			this.ensureFloatingPopupContainer();
		});

		if (!window.pdfPlus) {
			new Notice(
				"PDF Inline Translate: PDF++プラグインが見つかりません。PDF++を有効化してください。",
			);
		}
	}

	onunload() {
		console.info("PDF Inline Translate (Gemini) アンロード");
		this.destroyFloatingPopup();
	}

	async loadSettings() {
		this.settings = Object.assign({},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updatePopupBackgroundColorAlpha() {
        document.body.style.setProperty(
            "--popup-background-alpha",
            this.settings.popupBackgroundColorAlpha.toString()
        );
	}

	openTranslation(selectionText: string, context: any) {
		if (!this.settings.apiKey) {
			new Notice("Gemini APIキーを設定してください。");
			this.openSettingTab();
			return;
		}

		const preparedContext = this.prepareContext(context);

		this.lastSelection = {
			text: selectionText,
			context: preparedContext,
		};
		void this.openTranslationInPopup(selectionText, preparedContext);
	}

	openTranslationInPopup(selectionText: string, context: any) {
		let popup;
		try {
			popup = this.getOrCreateFloatingPopup();
		} catch (error) {
			console.error("PDF Inline Translate: ポップアップを初期化できませんでした。", error);
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

	async executeTranslationRequest(popup: GeminiTranslationFloatingPopup, selectionText: string, context: any) {
		const safeContext = context ?? {};
		popup.setExpandHandler(null);
		popup.showLoading(selectionText, safeContext);
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
			const translation = await this.requestTranslation(
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
		const popup = new GeminiTranslationFloatingPopup(this);
		popup.setCloseHandler(() => {
			this.handleFloatingPopupClosed();
		});
		this.floatingPopup = popup;
		return popup;
	}

	getAssetUrl(relativePath: string): string | null {
		if (!relativePath) {
			return null;
		}
		const adapter = this.app?.vault?.adapter;
		const configDir = this.app?.vault?.configDir ?? ".obsidian";
		const pluginId = this.manifest?.id ?? "pdf-inline-translate";
		const normalizedPath = `${configDir}/plugins/${pluginId}/${relativePath}`;

		if (adapter?.getResourcePath) {
			try {
				return adapter.getResourcePath(normalizedPath);
			} catch (error) {
				console.error(
					"PDF Inline Translate: アセットURLの取得に失敗しました。",
					error,
				);
			}
		}
		return null;
	}

	handleFloatingPopupClosed() {
		this.manuallyClosedSelectionKey = this.lastAutoTranslateKey;
		if (this.popupAbortController) {
			try {
				this.popupAbortController.abort();
			} catch (error) {
				console.error(error);
			}
			this.popupAbortController = null;
		}
		if (this.floatingPopup) {
			this.floatingPopup.hide();
		}
	}

	closeFloatingPopup() {
		this.handleFloatingPopupClosed();
	}

	destroyFloatingPopup() {
		this.handleFloatingPopupClosed();
		if (this.floatingPopup) {
			this.floatingPopup.destroy();
			this.floatingPopup = null;
		}
	}

	scheduleAutoTranslateCheck(delay: number = AUTO_TRANSLATE_DEBOUNCE_MS) {
		if (
			typeof document !== "undefined" &&
			typeof document.hasFocus === "function" &&
			!document.hasFocus()
		) {
			return;
		}
		const cancelTimer = window?.clearTimeout ?? clearTimeout;
		if (this.autoTranslateTimer) {
			cancelTimer(this.autoTranslateTimer);
		}
		const schedule = window?.setTimeout ?? setTimeout;
		this.autoTranslateTimer = schedule(() => {
			this.autoTranslateTimer = null;
			this.handleSelectionForAutoTranslate();
		}, Math.max(0, delay));
	}

	handleSelectionForAutoTranslate() {
		if (this.isPointerSelecting) {
			this.scheduleAutoTranslateCheck();
			return;
		}

		const selection = window.getSelection?.();
		const text = selection?.toString().trim();
		const context = text ? this.resolvePdfSelectionContext(selection, text) : null;

		if (!text || !context) {
			if (this.floatingPopup?.hasPersistentState()) {
				return;
			}
			this.closeFloatingPopup();
			if (this.manuallyClosedSelectionKey) {
				this.manuallyClosedSelectionKey = null;
			}
			return;
		}

		const key = `${context.pageNumber ?? "N/A"}|${text}`;

		if (this.manuallyClosedSelectionKey === key) {
			return;
		}

		const now = Date.now();
		if (
			this.lastAutoTranslateKey === key &&
			now - this.lastAutoTranslateTriggeredAt < AUTO_TRANSLATE_REPEAT_THRESHOLD_MS
		) {
			return;
		}

		this.manuallyClosedSelectionKey = null;
		this.lastAutoTranslateKey = key;
		this.lastAutoTranslateTriggeredAt = now;
		this.openTranslation(text, context);
	}

	prepareContext(context: any): any {
		const base =
			context && typeof context === "object"
				? { ...context }
				: {};
		if (!base.rect) {
			const rect = this.getActiveSelectionRect();
			if (rect) {
				base.rect = rect;
			}
		}
		return base;
	}

	getActiveSelectionRect(): DOMRect | null {
		const selection = window.getSelection?.();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}
		try {
			const range = selection.getRangeAt(0);
			return this.extractRectFromRange(range);
		} catch (error) {
			console.debug("PDF Inline Translate: selection rect取得失敗", error);
			return null;
		}
	}

	extractRectFromRange(range: Range): DOMRect | null {
		if (!range || typeof range.getBoundingClientRect !== "function") {
			return null;
		}
		let rect;
		try {
			rect = range.getBoundingClientRect();
		} catch (error) {
			console.debug("PDF Inline Translate: bounding rect取得失敗", error);
			return null;
		}
		if (!rect) {
			return null;
		}

		const makePlainRect = (domRect: DOMRect) => ({
			top: Number(domRect.top),
			left: Number(domRect.left),
			width: Number(domRect.width),
			height: Number(domRect.height),
            bottom: Number(domRect.bottom),
            right: Number(domRect.right),
            x: Number(domRect.x),
            y: Number(domRect.y),
            toJSON: () => {}
		});

		if (rect.width > 0 || rect.height > 0) {
			return makePlainRect(rect);
		}

		if (typeof range.getClientRects !== "function") {
			return null;
		}
		const rects = Array.from(range.getClientRects?.() ?? []);
		if (rects.length === 0) {
			return null;
		}
		let top = rects[0].top;
		let left = rects[0].left;
		let right = rects[0].right;
		let bottom = rects[0].bottom;
		for (const item of rects) {
			top = Math.min(top, item.top);
			left = Math.min(left, item.left);
			right = Math.max(right, item.right);
			bottom = Math.max(bottom, item.bottom);
		}
		return {
			top: Number(top),
			left: Number(left),
			width: Number(right - left),
			height: Number(bottom - top),
            bottom: Number(bottom),
            right: Number(right),
            x: Number(left),
            y: Number(top),
            toJSON: () => {}
		};
	}

	resolvePdfSelectionContext(selection: Selection, text: string): any | null {
		let range;
		try {
			range = selection.getRangeAt(0);
		} catch (error) {
			console.debug("PDF Inline Translate: selection range取得失敗", error);
			return null;
		}

		const candidateElement = this.findPdfSelectionElement(
			range.commonAncestorContainer,
		);
		if (!candidateElement) {
			return null;
		}

		const pageElement = candidateElement.closest?.("[data-page-number]");
		if (!pageElement) {
			return null;
		}

		const pageAttr = pageElement.getAttribute("data-page-number");
		const pageNumber = Number(pageAttr);
		const context: any = {
			selection: text,
		};
		if (Number.isFinite(pageNumber)) {
			context.pageNumber = pageNumber;
		}
		const rect = this.extractRectFromRange(range);
		if (rect) {
			context.rect = rect;
		}
		return context;
	}

	findPdfSelectionElement(node: Node): HTMLElement | null {
		let element = node instanceof Element ? node as HTMLElement : node?.parentElement;
		while (element) {
			if (element.matches?.(".page, [data-page-number]")) {
				const viewer =
					element.closest?.(
						".pdf-viewer, .pdfViewer, .pdf-plus-viewer, .pdf-plus-root, .obsidian-pdf-view",
					) ?? element.closest?.('[data-type="pdf"], [data-type="pdf-plus"]');
				if (viewer) {
					return element;
				}
			}
			element = element.parentElement;
		}
		return null;
	}

	openSettingTab() {
		const settingTabManager = (this.app as any).setting;
		if (!settingTabManager) {
			return;
		}
		if (typeof settingTabManager.open === "function") {
			settingTabManager.open();
		}
		if (typeof settingTabManager.openTabById === "function") {
			settingTabManager.openTabById(this.manifest.id);
		}
	}

	async requestTranslation(text: string, context: any, abortSignal: AbortSignal): Promise<string> {
		const prompt = this.buildPrompt(text, context);
		const body: any = {
			contents: [
				{
					role: "user",
					parts: [{ text: prompt }],
				},
			],
			generationConfig: {
				temperature: this.settings.temperature,
				maxOutputTokens: this.settings.maxOutputTokens,
			},
		};

		if (this.settings.systemInstruction?.trim()) {
			body.systemInstruction = {
				role: "system",
				parts: [{ text: this.settings.systemInstruction }],
			};
		}

		const url = `${GEMINI_API_BASE}/${encodeURIComponent(
			this.settings.model,
		)}:generateContent`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.settings.apiKey,
			},
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok) {
			const errorDetail = await this._getApiErrorDetail(response);
			throw new Error(errorDetail);
		}

		const responseData = await response.json();

		const candidate =
			responseData?.candidates?.[0]?.content?.parts ?? [];
		const textFragments = candidate
			.map((part: any) => part.text)
			.filter(Boolean);
		const translation =
			textFragments.join("\n\n").trim() ??
			responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!translation) {
			throw new Error("Geminiから翻訳結果を取得できませんでした。");
		}

		if (responseData?.promptFeedback?.blockReason) {
			new Notice(
				`Geminiが出力をブロックしました: ${responseData.promptFeedback.blockReason}`,
			);
		}

		return translation;
	}

	async _getApiErrorDetail(response: Response): Promise<string> {
		let detail = `HTTP ${response.status}`;
		try {
			const errorPayload = await response.json();
			detail = errorPayload?.error?.message || detail;
		} catch (parseError) {
			console.error("エラーレスポンス解析失敗", parseError);
		}
		return detail;
	}

	buildPrompt(text: string, context: any): string {
		return this.settings.promptTemplate
			.replaceAll("{{text}}", text)
			.replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
			.replaceAll(
				"{{page}}",
				context?.pageNumber != null ? String(context.pageNumber) : "N/A",
			);
	}
}
