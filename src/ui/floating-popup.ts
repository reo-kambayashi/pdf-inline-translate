import { Notice } from "obsidian";
import PdfInlineTranslatePlugin from "../main";

export class GeminiTranslationFloatingPopup {
	private plugin: PdfInlineTranslatePlugin;
	private container: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private translationEl: HTMLElement | null = null;
	private copyButton: HTMLButtonElement | null = null;
	private translationText: string = "";
	private onClose: (() => void) | null = null;
	private dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
	private lastPosition: { top: number; left: number } | null = null;
	private iconButton: HTMLButtonElement | null = null;
	private isExpanded: boolean = false;
	private currentState: any | null = null;
	private lastContext: any | null = null;
	private onExpandHandler: (() => void) | null = null;
	private boundOnKeydown: (event: KeyboardEvent) => void;
	private boundOnDrag: (event: PointerEvent) => void;
	private boundOnDragEnd: (event: PointerEvent) => void;
	private collapsedIconUrl: string | null;

	constructor(plugin: PdfInlineTranslatePlugin) {
		this.plugin = plugin;
		this.boundOnKeydown = this.handleKeydown.bind(this);
		this.boundOnDrag = this.onDrag.bind(this);
		this.boundOnDragEnd = this.onDragEnd.bind(this);
		this.collapsedIconUrl =
			typeof plugin?.getAssetUrl === "function"
				? plugin.getAssetUrl("fig/39358.png")
				: null;
	}

	setCloseHandler(handler: () => void) {
		this.onClose = handler;
	}

	setExpandHandler(handler: (() => void) | null) {
		this.onExpandHandler = typeof handler === "function" ? handler : null;
	}

	showLoading(
		original: string,
		context: any,
		forceExpand: boolean = false,
	) {
		this.currentState = {
			type: "loading",
			original,
			context,
		};
		this.translationText = "";
		if (this.isExpanded || forceExpand) {
			this.renderExpandedState();
		} else {
			this.renderCollapsed(context);
		}
	}

	showResult(original: string, translation: string, context: any) {
		this.currentState = {
			type: "result",
			original,
			context,
			translation,
		};
		this.translationText = translation;
		if (this.isExpanded) {
			this.renderExpandedState();
		} else {
			this.renderCollapsed(context);
		}
	}

	showCancelled(original: string, context: any) {
		this.currentState = {
			type: "cancelled",
			original,
			context,
		};
		if (this.isExpanded) {
			this.renderExpandedState();
		} else {
			this.renderCollapsed(context);
		}
	}

	showError(original: string, context: any, message: string) {
		this.currentState = {
			type: "error",
			original,
			context,
			message,
		};
		if (this.isExpanded) {
			this.renderExpandedState();
		} else {
			this.renderCollapsed(context);
		}
	}

	hide() {
		if (!this.container) return;
		this.removeGlobalListener();
		this.container.style.display = "none";
		this.container.setAttribute("aria-hidden", "true");
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
		this.iconButton = null;
		this.isExpanded = false;
		this.currentState = null;
		this.lastContext = null;
		this.onExpandHandler = null;
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
		this.iconButton = null;
		this.isExpanded = false;
		this.currentState = null;
		this.lastContext = null;
		this.onExpandHandler = null;
	}

	focus() {
		if (!this.container) return;
		if (typeof this.container.focus === "function") {
			this.container.focus({ preventScroll: true });
		}
	}

	renderBase(original: string, context: any) {
		this.ensureContainer();
		const container = this.container;
		if (!container) {
			return;
		}

		this.isExpanded = true;
		this.iconButton = null;
		container.classList.remove("pdf-inline-translate__popup--collapsed");
		container.classList.add("pdf-inline-translate__popup--expanded");
		container.style.display = "flex";
		container.setAttribute("aria-hidden", "false");
		container.setAttribute("role", "dialog");
		container.setAttribute("aria-label", "Gemini翻訳");
		container.innerHTML = "";
		if (context && typeof context === "object" && Object.keys(context).length > 0) {
			this.lastContext = context;
		}

		const header = this._createHeader();
		const body = this._createBody();

		container.appendChild(header);
		container.appendChild(body);

		this.addGlobalListener();
		this.focus();
	}

	_createHeader(): HTMLElement {
		const header = document.createElement("div");
		header.className = "pdf-inline-translate__popup-header";

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
		return header;
	}

	_createBody(): HTMLElement {
		const body = document.createElement("div");
		body.className = "pdf-inline-translate__popup-body";

		this.statusEl = document.createElement("p");
		this.statusEl.className = "pdf-inline-translate__status";
		body.appendChild(this.statusEl);

		this.translationEl = document.createElement("div");
		this.translationEl.className = "pdf-inline-translate__translation";
		body.appendChild(this.translationEl);

		const buttonRow = this._createButtonRow();
		body.appendChild(buttonRow);

		return body;
	}

	_createButtonRow(): HTMLElement {
		const buttonRow = document.createElement("div");
		buttonRow.className = "pdf-inline-translate__buttons";

		this.copyButton = document.createElement("button");
		this.copyButton.type = "button";
		this.copyButton.className = "mod-cta";
		this.copyButton.textContent = "コピー";
		this.copyButton.setAttribute("disabled", "true");
		this.copyButton.addEventListener("click", () => this._handleCopy());
		buttonRow.appendChild(this.copyButton);

		return buttonRow;
	}

	_handleCopy() {
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
	}

	renderCollapsed(context: any) {
		this.ensureContainer();
		const container = this.container;
		if (!container) {
			return;
		}

		this.stopDragging();
		this.removeGlobalListener();
		this.isExpanded = false;
		this.lastContext = context ?? this.lastContext;

		container.style.display = "flex";
		container.setAttribute("aria-hidden", "false");
		container.setAttribute("role", "button");
		container.setAttribute("aria-label", "Gemini翻訳を開く");
		container.classList.add("pdf-inline-translate__popup--collapsed");
		container.classList.remove("pdf-inline-translate__popup--expanded");
		container.innerHTML = "";

		const button = document.createElement("button");
		button.type = "button";
		button.className = "pdf-inline-translate__collapsed-button";
		button.setAttribute("aria-label", "Gemini翻訳を開く");
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.expandToFull();
		});

		const icon = document.createElement("span");
		icon.className = "pdf-inline-translate__collapsed-icon";
		icon.setAttribute("aria-hidden", "true");
		if (this.collapsedIconUrl) {
			icon.style.backgroundImage = `url("${this.collapsedIconUrl}")`;
		} else {
			icon.classList.add("pdf-inline-translate__collapsed-icon--fallback");
			icon.textContent = "訳";
		}
		button.appendChild(icon);

		container.appendChild(button);
		this.iconButton = button;
		this.updateCollapsedVisuals();
		this.setPositionFromContext(context);
		this.addGlobalListener();
	}

	prepareCollapsedState(original: string, context: any) {
		this.currentState = {
			type: "pending",
			original,
			context,
		};
		this.translationText = "";
		this.renderCollapsed(context);
	}

	updateCollapsedVisuals() {
		if (!this.container || !this.iconButton) {
			return;
		}
		const state = this.currentState?.type ?? "idle";
		this.container.dataset.popupState = state;
		this.iconButton.dataset.state = state;
		const tooltip = this.getCollapsedTooltip();
		this.iconButton.title = tooltip;
		this.iconButton.setAttribute("aria-label", tooltip);
	}

	getCollapsedTooltip(): string {
		const state = this.currentState;
		if (!state) {
			return "Gemini翻訳";
		}
		switch (state.type) {
			case "loading":
				return "翻訳を準備しています…クリックで詳細を表示";
			case "result":
				return "翻訳が完了しました。クリックで結果を表示";
			case "error":
				return "翻訳に失敗しました。クリックで詳細を表示";
			case "cancelled":
				return "翻訳を中断しました。クリックで詳細を表示";
			case "pending":
				return "翻訳を開始するにはクリックしてください";
			default:
				return "Gemini翻訳";
		}
	}

	hasPersistentState(): boolean {
		return Boolean(this.currentState);
	}

	expandToFull() {
		if (this.isExpanded) {
			return;
		}
		if (typeof this.onExpandHandler === "function") {
			try {
				this.onExpandHandler();
			} catch (error) {
				console.error("PDF Inline Translate: 展開時に例外が発生しました。", error);
			}
		}
		this.renderExpandedState();
	}

	renderExpandedState() {
		const state = this.currentState;
		const context = state?.context ?? this.lastContext ?? {};
		const original = state?.original ?? "";
		this.renderBase(original, context);

		if (this.container) {
			this.container.dataset.popupState = state?.type ?? "idle";
		}

		if (!state) {
			if (this.statusEl) {
				this.statusEl.textContent = "";
			}
			this.toggleCopyButton(false);
			this.setPositionFromContext(context);
			return;
		}

		switch (state.type) {
			case "loading":
				if (this.statusEl) {
					this.statusEl.textContent = "Geminiに問い合わせ中…";
				}
				this.translationText = "";
				this.toggleCopyButton(false);
				if (this.translationEl) {
					this.translationEl.innerHTML = "";
				}
				break;
			case "pending":
				if (this.statusEl) {
					this.statusEl.textContent = "翻訳を開始するには「A あ」アイコンをクリックしてください。";
				}
				this.translationText = "";
				this.toggleCopyButton(false);
				if (this.translationEl) {
					this.translationEl.innerHTML = "";
				}
				break;
			case "result":
				this.translationText = state.translation ?? "";
				if (this.translationEl) {
					this.translationEl.innerHTML = "";
					if (this.translationText) {
						const pre = document.createElement("pre");
						pre.className = "pdf-inline-translate__translation-text";
						pre.textContent = this.translationText;
						this.translationEl.appendChild(pre);
					}
				}
				if (this.statusEl) {
					this.statusEl.textContent = "";
				}
				this.toggleCopyButton(Boolean(this.translationText));
				break;
			case "cancelled":
				if (this.statusEl) {
					this.statusEl.textContent = "翻訳を中断しました。";
				}
				this.translationText = "";
				this.toggleCopyButton(false);
				if (this.translationEl) {
					this.translationEl.innerHTML = "";
				}
				break;
			case "error":
				if (this.statusEl) {
					this.statusEl.textContent =
						state.message ?? "翻訳に失敗しました。詳細はコンソールをご確認ください。";
				}
				this.translationText = "";
				this.toggleCopyButton(false);
				if (this.translationEl) {
					this.translationEl.innerHTML = "";
				}
				break;
			default:
				break;
		}
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
		if (typeof this.onClose === "function") {
			this.onClose();
		}
	}

	handleKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			this.handleClose();
		}
	}

	startDrag(event: PointerEvent) {
		if (event.button !== 0) {
			return;
		}
		if ((event.target as HTMLElement).closest(".pdf-inline-translate__popup-close")) {
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

	onDrag(event: PointerEvent) {
		if (!this.dragState || !this.container) {
			return;
		}
		const top = event.clientY - this.dragState.offsetY;
		const left = event.clientX - this.dragState.offsetX;
		this.applyPosition(top, left);
	}

	onDragEnd(event: PointerEvent) {
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

	setPositionFromContext(context: any) {
		if (!this.container) return;
		if (context && typeof context === "object" && Object.keys(context).length > 0) {
			this.lastContext = context;
		}
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

	applyPosition(top: number, left: number) {
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

	toggleCopyButton(isEnabled: boolean) {
		if (!this.copyButton) return;
		if (isEnabled) {
			this.copyButton.removeAttribute("disabled");
		} else {
			this.copyButton.setAttribute("disabled", "true");
		}
	}

	isValidRect(rect: any): boolean {
		return (
			rect &&
			typeof rect.top === "number" &&
			typeof rect.left === "number" &&
			typeof rect.height === "number" &&
			typeof rect.width === "number"
		);
	}

	clamp(value: number, min: number, max: number): number {
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

	containsElement(target: EventTarget | null): boolean {
		if (!this.container || !target) {
			return false;
		}
		if (!(target instanceof Node)) {
			return false;
		}
		return this.container.contains(target);
	}
}
