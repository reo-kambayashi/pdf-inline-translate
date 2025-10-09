const {
	Plugin,
	Notice,
	Setting,
	PluginSettingTab,
} = require("obsidian");

const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_SETTINGS = {
	apiKey: "",
	model: "gemini-2.5-flash-lite",
	targetLanguage: "日本語",
	temperature: 0.1,
	maxOutputTokens: 1024,
	systemInstruction:
		"あなたは学術論文翻訳の専門家です。原文の論旨と語気を保ちつつ、自然で読みやすい日本語へ翻訳してください。用語の補足説明や注釈は追加しないでください。",
	promptTemplate:
		"以下の原文は学術論文からの抜粋です。構造と意味を忠実に保ちつつ{{targetLanguage}}へ翻訳してください。語調は論文調を意識し、補足説明や注釈、要約は一切追加しないでください。翻訳結果のみを出力してください。\n\n--- 原文 ---\n{{text}}\n",
	timeoutMs: 20000,
	popupBackgroundColorAlpha: 0.8,
};

const AUTO_TRANSLATE_DEBOUNCE_MS = 350;
const AUTO_TRANSLATE_REPEAT_THRESHOLD_MS = 1500;

class GeminiTranslationFloatingPopup {
	constructor(plugin) {
		this.plugin = plugin;
		this.container = null;
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
		this.translationText = "";
		this.onClose = null;
		this.dragState = null;
		this.lastPosition = null;
		this.boundOnKeydown = this.handleKeydown.bind(this);
		this.boundOnDrag = this.onDrag.bind(this);
		this.boundOnDragEnd = this.onDragEnd.bind(this);
	}

	setCloseHandler(handler) {
		this.onClose = handler;
	}

	showLoading(original, context) {
		this.renderBase(original, context);
		if (this.statusEl) {
			this.statusEl.textContent = "Geminiに問い合わせ中…";
		}
		this.translationText = "";
		this.toggleCopyButton(false);
		if (this.translationEl) {
			this.translationEl.innerHTML = "";
		}
	}

	showResult(original, translation, context) {
		this.renderBase(original, context);
		this.translationText = translation;
		if (this.translationEl) {
			this.translationEl.innerHTML = "";
			const pre = document.createElement("pre");
			pre.className = "pdf-inline-translate__translation-text";
			pre.textContent = translation;
			this.translationEl.appendChild(pre);
		}
		this.toggleCopyButton(true);
		this.setPositionFromContext(context);
	}

	showCancelled(original, context) {
		this.renderBase(original, context);
		if (this.statusEl) {
			this.statusEl.textContent = "翻訳を中断しました。";
		}
		this.toggleCopyButton(false);
	}

	showError(original, context, message) {
		this.renderBase(original, context);
		if (this.statusEl) {
			this.statusEl.textContent = message;
		}
		this.toggleCopyButton(false);
	}

	hide() {
		if (!this.container) return;
		this.container.style.display = "none";
		this.container.setAttribute("aria-hidden", "true");
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
	}

	destroy() {
		if (!this.container) return;
		this.stopDragging();
		this.removeGlobalListener();
		this.container.remove();
		this.container = null;
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
	}

	focus() {
		if (!this.container) return;
		if (typeof this.container.focus === "function") {
			this.container.focus({ preventScroll: true });
		}
	}

	renderBase(original, context) {
		this.ensureContainer();
		const container = this.container;
		if (!container) {
			return;
		}

		container.style.display = "flex";
		container.setAttribute("aria-hidden", "false");
		container.innerHTML = "";

		const header = document.createElement("div");
		header.className = "pdf-inline-translate__popup-header";
		container.appendChild(header);

		const headerActions = document.createElement("div");
		headerActions.className = "pdf-inline-translate__popup-actions";
		header.appendChild(headerActions);

		const closeButton = document.createElement("button");
		closeButton.type = "button";
		closeButton.className = "pdf-inline-translate__popup-close";
		closeButton.innerHTML = "&times;";
		closeButton.addEventListener("click", () => this.handleClose());
		headerActions.appendChild(closeButton);

		header.addEventListener("pointerdown", (event) => this.startDrag(event));

		const body = document.createElement("div");
		body.className = "pdf-inline-translate__popup-body";
		container.appendChild(body);



		this.statusEl = document.createElement("p");
		this.statusEl.className = "pdf-inline-translate__status";
		body.appendChild(this.statusEl);

		this.translationEl = document.createElement("div");
		this.translationEl.className = "pdf-inline-translate__translation";
		body.appendChild(this.translationEl);

		const buttonRow = document.createElement("div");
		buttonRow.className = "pdf-inline-translate__buttons";
		body.appendChild(buttonRow);

		this.copyButton = document.createElement("button");
		this.copyButton.type = "button";
		this.copyButton.className = "mod-cta";
		this.copyButton.textContent = "コピー";
		this.copyButton.setAttribute("disabled", "true");
		this.copyButton.addEventListener("click", () => {
			if (!this.translationText) {
				return;
			}
			if (navigator?.clipboard?.writeText) {
				navigator.clipboard.writeText(this.translationText).then(
					() => new Notice("翻訳結果をクリップボードにコピーしました。"),
					(err) => {
						console.error(err);
						new Notice("クリップボードへのコピーに失敗しました。");
					},
				);
			} else {
				new Notice("クリップボードAPIが使用できません。手動でコピーしてください。");
			}
		});
		buttonRow.appendChild(this.copyButton);

		this.addGlobalListener();
		this.focus();
		this.setPositionFromContext(context);
	}

	ensureContainer() {
		if (this.container) return;
		if (!document || !document.body) return;
		const container = document.createElement("div");
		container.className = "pdf-inline-translate__popup";
		container.setAttribute("role", "dialog");
		container.setAttribute("aria-label", "Gemini翻訳");
		container.setAttribute("aria-hidden", "true");
		container.tabIndex = -1;
		container.style.display = "none";
		document.body.appendChild(container);
		this.container = container;
	}

	handleClose() {
		this.hide();
		if (typeof this.onClose === "function") {
			this.onClose();
		}
		this.removeGlobalListener();
	}

	handleKeydown(event) {
		if (event.key === "Escape") {
			event.preventDefault();
			this.handleClose();
		}
	}

	startDrag(event) {
		if (event.button !== 0) {
			return;
		}
		if (event.target.closest(".pdf-inline-translate__popup-close")) {
			return;
		}
		if (!this.container) {
			return;
		}
		event.preventDefault();
		const rect = this.container.getBoundingClientRect();
		this.dragState = {
			pointerId: event.pointerId,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
		};
		this.container.classList.add("is-dragging");
		try {
			this.container.setPointerCapture?.(event.pointerId);
		} catch (error) {
			console.debug("PDF Inline Translate: pointer capture失敗", error);
		}
		document.addEventListener("pointermove", this.boundOnDrag);
		document.addEventListener("pointerup", this.boundOnDragEnd);
	}

	onDrag(event) {
		if (!this.dragState || !this.container) {
			return;
		}
		const top = event.clientY - this.dragState.offsetY;
		const left = event.clientX - this.dragState.offsetX;
		this.applyPosition(top, left);
	}

	onDragEnd(event) {
		if (!this.dragState || !this.container) {
			this.stopDragging();
			return;
		}
		if (this.dragState.pointerId != null) {
			try {
				this.container.releasePointerCapture?.(this.dragState.pointerId);
			} catch (error) {
				console.debug("PDF Inline Translate: pointer release失敗", error);
			}
		}
		this.stopDragging();
	}

	stopDragging() {
		if (this.container) {
			this.container.classList.remove("is-dragging");
		}
		this.dragState = null;
		document.removeEventListener("pointermove", this.boundOnDrag);
		document.removeEventListener("pointerup", this.boundOnDragEnd);
	}

	setPositionFromContext(context) {
		if (!this.container) return;
		const rect =
			context?.rect && this.isValidRect(context.rect)
				? context.rect
				: null;
		const schedule = window?.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16));
		schedule(() => {
			if (!this.container) {
				return;
			}
			if (rect) {
				const top = rect.top + rect.height + 12;
				const left = rect.left;
				this.applyPosition(top, left);
			} else if (this.lastPosition) {
				this.applyPosition(this.lastPosition.top, this.lastPosition.left);
			} else {
				const defaultTop = 24;
				const defaultLeft = window.innerWidth - this.container.offsetWidth - 24;
				this.applyPosition(defaultTop, defaultLeft);
			}
		});
	}

	applyPosition(top, left) {
		if (!this.container) return;
		const containerRect = this.container.getBoundingClientRect();
		const maxTop = window.innerHeight - containerRect.height - 12;
		const maxLeft = window.innerWidth - containerRect.width - 12;
		const clampedTop = this.clamp(top, 12, Math.max(12, maxTop));
		const clampedLeft = this.clamp(left, 12, Math.max(12, maxLeft));
		this.container.style.top = `${clampedTop}px`;
		this.container.style.left = `${clampedLeft}px`;
		this.lastPosition = { top: clampedTop, left: clampedLeft };
	}

	toggleCopyButton(isEnabled) {
		if (!this.copyButton) return;
		if (isEnabled) {
			this.copyButton.removeAttribute("disabled");
		} else {
			this.copyButton.setAttribute("disabled", "true");
		}
	}

	isValidRect(rect) {
		return (
			rect &&
			typeof rect.top === "number" &&
			typeof rect.left === "number" &&
			typeof rect.height === "number" &&
			typeof rect.width === "number"
		);
	}

	clamp(value, min, max) {
		if (!Number.isFinite(value)) {
			return min;
		}
		return Math.min(Math.max(value, min), max);
	}

	addGlobalListener() {
		this.removeGlobalListener();
		document.addEventListener("keydown", this.boundOnKeydown);
	}

	removeGlobalListener() {
		document.removeEventListener("keydown", this.boundOnKeydown);
	}
}

class PdfInlineTranslateSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
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
			.setName("システム指示")
			.setDesc("モデルへ与える前提指示。翻訳の方針を細かく制御したい場合に調整してください。")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.systemInstruction)
					.setPlaceholder("翻訳スタイルなどを指示します。")
					.onChange(async (value) => {
						this.plugin.settings.systemInstruction = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("プロンプトテンプレート")
			.setDesc("{{text}}, {{targetLanguage}}, {{page}} を使って翻訳プロンプトをカスタマイズできます。")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.promptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.promptTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("温度")
			.setDesc("0に近いほど直訳寄り、値を上げると意訳が増えます。")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.05)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.temperature)
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
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
			.setName("タイムアウト (ms)")
			.setDesc("Gemini APIの応答待ち時間をミリ秒で指定します。")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.timeoutMs))
					.onChange(async (value) => {
						const parsed = Number(value);
						this.plugin.settings.timeoutMs = Number.isFinite(parsed)
							? parsed
							: DEFAULT_SETTINGS.timeoutMs;
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

class PdfInlineTranslatePlugin extends Plugin {
	async onload() {
		console.info("PDF Inline Translate (Gemini) ロード開始");
		await this.loadSettings();
		this.updatePopupBackgroundColorAlpha();

		this.autoTranslateTimer = null;
		this.lastAutoTranslateKey = null;
		this.lastAutoTranslateTriggeredAt = 0;
		this.popupAbortController = null;
		this.floatingPopup = null;
		this.isPointerSelecting = false;
		this.manuallyClosedSelectionKey = null;

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
			this.settings.popupBackgroundColorAlpha,
		);
	}

	openTranslation(selectionText, context) {
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

	async openTranslationInPopup(selectionText, context) {
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

		const safeContext = context ?? {};
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

	getOrCreateFloatingPopup() {
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

	scheduleAutoTranslateCheck(delay = AUTO_TRANSLATE_DEBOUNCE_MS) {
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

	prepareContext(context) {
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

	getActiveSelectionRect() {
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

	extractRectFromRange(range) {
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

		const makePlainRect = (domRect) => ({
			top: Number(domRect.top),
			left: Number(domRect.left),
			width: Number(domRect.width),
			height: Number(domRect.height),
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
		};
	}

	resolvePdfSelectionContext(selection, text) {
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
		const context = {
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

	findPdfSelectionElement(node) {
		let element = node instanceof Element ? node : node?.parentElement;
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
		const settingTabManager = this.app.setting;
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

	async requestTranslation(text, context, abortSignal) {
		const prompt = this.buildPrompt(text, context);
		const body = {
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
			let detail = `HTTP ${response.status}`;
			try {
				const errorPayload = await response.json();
				detail = errorPayload?.error?.message || detail;
			} catch (parseError) {
				console.error("エラーレスポンス解析失敗", parseError);
			}
			throw new Error(detail);
		}

		const responseData = await response.json();

		const candidate =
			responseData?.candidates?.[0]?.content?.parts ?? [];
		const textFragments = candidate
			.map((part) => part.text)
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

	buildPrompt(text, context) {
		return this.settings.promptTemplate
			.replaceAll("{{text}}", text)
			.replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
			.replaceAll(
				"{{page}}",
				context?.pageNumber != null ? String(context.pageNumber) : "N/A",
			);
	}
}

module.exports = PdfInlineTranslatePlugin;