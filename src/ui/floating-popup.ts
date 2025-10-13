import { Notice } from 'obsidian';
import PdfInlineTranslatePlugin from '../main';
import { MarkdownRenderer } from './markdown-renderer';
import { TranslationState, TranslationContext } from '../types';
import {
    UI_STATUS_MESSAGES,
    POPUP_DEFAULT_TOP,
    POPUP_DEFAULT_LEFT,
    POPUP_OFFSET,
} from './constants';
import { isValidRect as utilsIsValidRect, clamp as utilsClamp } from '../utils';

export type MarkdownBlock =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; lines: string[] }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'blockquote'; lines: string[] }
    | { type: 'code'; language: string; lines: string[] };

export class GeminiTranslationFloatingPopup {
    private plugin: PdfInlineTranslatePlugin;
    private container: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private translationEl: HTMLElement | null = null;
    private copyButton: HTMLButtonElement | null = null;
    private statusBadgeEl: HTMLElement | null = null;
    private collapseButton: HTMLButtonElement | null = null;
    private translationText: string = '';
    private onClose: (() => void) | null = null;
    private dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
    private lastPosition: { top: number; left: number } | null = null;
    private iconButton: HTMLButtonElement | null = null;
    private isExpanded: boolean = false;
    private currentState: TranslationState | null = null;
    private lastContext: TranslationContext | null = null;
    private onExpandHandler: (() => void) | null = null;
    private originalText: string = '';
    private originalToggleButton: HTMLButtonElement | null = null;
    private originalSection: HTMLElement | null = null;
    private originalEl: HTMLElement | null = null;
    private isOriginalVisible: boolean = false;
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
            typeof plugin?.getAssetUrl === 'function' ? plugin.getAssetUrl('fig/39358.png') : null;
    }

    setCloseHandler(handler: () => void) {
        this.onClose = handler;
    }

    setExpandHandler(handler: (() => void) | null) {
        this.onExpandHandler = typeof handler === 'function' ? handler : null;
    }

    get expanded(): boolean {
        return this.isExpanded;
    }

    showLoading(original: string, context: TranslationContext, forceExpand: boolean = false) {
        this.currentState = {
            type: 'loading',
            original,
            context,
        };
        this.originalText = original;
        this.translationText = '';
        if (this.isExpanded || forceExpand) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showResult(original: string, translation: string, context: TranslationContext) {
        this.currentState = {
            type: 'result',
            original,
            context,
            translation,
        };
        this.originalText = original;
        this.translationText = translation;
        if (this.isExpanded) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showCancelled(original: string, context: TranslationContext) {
        this.currentState = {
            type: 'cancelled',
            original,
            context,
        };
        this.originalText = original;
        if (this.isExpanded) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showError(original: string, context: TranslationContext, message: string) {
        this.currentState = {
            type: 'error',
            original,
            context,
            message,
        };
        this.originalText = original;
        if (this.isExpanded) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    hide() {
        if (!this.container) return;
        this.removeGlobalListener();
        this.container.style.display = 'none';
        this.container.setAttribute('aria-hidden', 'true');
        this.statusEl = null;
        this.translationEl = null;
        this.copyButton = null;
        this.statusBadgeEl = null;
        this.collapseButton = null;
        this.originalToggleButton = null;
        this.originalSection = null;
        this.originalEl = null;
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
        this.statusBadgeEl = null;
        this.collapseButton = null;
        this.originalToggleButton = null;
        this.originalSection = null;
        this.originalEl = null;
        this.iconButton = null;
        this.isExpanded = false;
        this.currentState = null;
        this.lastContext = null;
        this.onExpandHandler = null;
    }

    focus() {
        if (!this.container) return;
        if (typeof this.container.focus === 'function') {
            this.container.focus({ preventScroll: true });
        }
    }

    renderBase(original: string, context: TranslationContext) {
        this.ensureContainer();
        const container = this.container;
        if (!container) {
            return;
        }

        this.isExpanded = true;
        this.iconButton = null;
        this.statusBadgeEl = null;
        this.collapseButton = null;
        this.originalToggleButton = null;
        this.originalSection = null;
        this.originalEl = null;
        container.classList.remove('pdf-inline-translate__popup--collapsed');
        container.classList.add('pdf-inline-translate__popup--expanded');
        container.style.display = 'flex';
        container.setAttribute('aria-hidden', 'false');
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-label', 'Gemini翻訳');
        container.innerHTML = '';
        this.originalText = original ?? '';
        if (context && typeof context === 'object' && Object.keys(context).length > 0) {
            this.lastContext = context;
        }

        // Apply theme and size after render
        this.applyTheme();

        const header = this.createHeader();
        const body = this.createBody();

        container.appendChild(header);
        container.appendChild(body);

        this.addGlobalListener();
        this.focus();
    }

    private createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.className = 'pdf-inline-translate__popup-header';

        const headline = document.createElement('div');
        headline.className = 'pdf-inline-translate__popup-headline';
        const title = document.createElement('span');
        title.className = 'pdf-inline-translate__popup-title';
        title.textContent = 'Gemini翻訳';
        headline.appendChild(title);

        this.statusBadgeEl = document.createElement('span');
        this.statusBadgeEl.className = 'pdf-inline-translate__popup-badge';
        this.statusBadgeEl.textContent = '待機中';
        this.statusBadgeEl.setAttribute('aria-live', 'polite');
        this.statusBadgeEl.setAttribute('role', 'status');
        headline.appendChild(this.statusBadgeEl);

        header.appendChild(headline);

        const headerActions = document.createElement('div');
        headerActions.className = 'pdf-inline-translate__popup-actions';
        header.appendChild(headerActions);

        this.collapseButton = document.createElement('button');
        this.collapseButton.type = 'button';
        this.collapseButton.className = 'pdf-inline-translate__popup-collapse';
        this.collapseButton.setAttribute('aria-label', 'ポップアップを折りたたむ');
        this.collapseButton.textContent = '−';
        this.collapseButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.renderCollapsed(this.lastContext ?? this.currentState?.context ?? {});
        });
        headerActions.appendChild(this.collapseButton);

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'pdf-inline-translate__popup-close';
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', () => this.handleClose());
        headerActions.appendChild(closeButton);

        header.addEventListener('pointerdown', (event) => this.startDrag(event));
        return header;
    }

    private createBody(): HTMLElement {
        const body = document.createElement('div');
        body.className = 'pdf-inline-translate__popup-body';

        this.statusEl = document.createElement('p');
        this.statusEl.className = 'pdf-inline-translate__status';
        this.statusEl.setAttribute('role', 'status');
        this.statusEl.setAttribute('aria-live', 'polite');
        body.appendChild(this.statusEl);

        this.originalSection = document.createElement('div');
        this.originalSection.className = 'pdf-inline-translate__original-section';

        // Initialize original visibility based on settings
        this.isOriginalVisible = this.plugin.settings.showOriginalText;

        this.originalToggleButton = document.createElement('button');
        this.originalToggleButton.type = 'button';
        this.originalToggleButton.className = 'pdf-inline-translate__original-toggle';
        this.originalToggleButton.addEventListener('click', () => this.toggleOriginalVisibility());
        this.originalSection.appendChild(this.originalToggleButton);

        this.originalEl = document.createElement('pre');
        this.originalEl.className = 'pdf-inline-translate__original';
        this.originalEl.setAttribute('aria-live', 'polite');
        this.originalEl.tabIndex = 0;
        this.originalSection.appendChild(this.originalEl);
        body.appendChild(this.originalSection);
        this.syncOriginalSection();

        this.translationEl = document.createElement('div');
        this.translationEl.className = 'pdf-inline-translate__translation';
        this.translationEl.setAttribute('aria-live', 'polite');
        body.appendChild(this.translationEl);

        const buttonRow = this.createButtonRow();
        body.appendChild(buttonRow);

        return body;
    }

    private createButtonRow(): HTMLElement {
        const buttonRow = document.createElement('div');
        buttonRow.className = 'pdf-inline-translate__buttons';

        this.copyButton = document.createElement('button');
        this.copyButton.type = 'button';
        this.copyButton.className = 'mod-cta';
        this.copyButton.textContent = 'コピー';
        this.copyButton.setAttribute('disabled', 'true');
        this.copyButton.addEventListener('click', () => this.handleCopy());
        buttonRow.appendChild(this.copyButton);

        return buttonRow;
    }

    private handleCopy() {
        if (!this.translationText) {
            return;
        }
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(this.translationText).then(
                () => new Notice('翻訳結果をクリップボードにコピーしました。'),
                (err) => {
                    console.error(err);
                    new Notice('クリップボードへのコピーに失敗しました。');
                },
            );
        } else {
            new Notice('クリップボードAPIが使用できません。手動でコピーしてください。');
        }
    }

    renderCollapsed(context: TranslationContext) {
        this.ensureContainer();
        const container = this.container;
        if (!container) {
            return;
        }
        this.statusBadgeEl = null;
        this.collapseButton = null;
        this.originalToggleButton = null;
        this.originalSection = null;
        this.originalEl = null;

        this.stopDragging();
        this.removeGlobalListener();
        this.isExpanded = false;
        this.lastContext = context && typeof context === 'object' ? context : this.lastContext;

        container.style.display = 'flex';
        container.setAttribute('aria-hidden', 'false');
        container.setAttribute('role', 'button');
        container.setAttribute('aria-label', 'Gemini翻訳を開く');
        container.classList.add('pdf-inline-translate__popup--collapsed');
        container.classList.remove('pdf-inline-translate__popup--expanded');
        container.innerHTML = '';

        // Apply theme to collapsed state
        this.applyTheme();

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pdf-inline-translate__collapsed-button';
        button.setAttribute('aria-label', 'Gemini翻訳を開く');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.expandToFull();
        });

        const icon = document.createElement('span');
        icon.className = 'pdf-inline-translate__collapsed-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (
            this.collapsedIconUrl &&
            typeof this.collapsedIconUrl === 'string' &&
            this.collapsedIconUrl.length > 0
        ) {
            icon.style.backgroundImage = `url("${this.collapsedIconUrl}")`;
        } else {
            icon.classList.add('pdf-inline-translate__collapsed-icon--fallback');
            icon.textContent = '訳';
        }
        button.appendChild(icon);

        container.appendChild(button);
        this.iconButton = button;
        this.updateCollapsedVisuals();
        this.originalText = this.currentState?.original ?? this.originalText;
        this.setPositionFromContext(context);
        this.addGlobalListener();
    }

    prepareCollapsedState(original: string, context: TranslationContext) {
        this.currentState = {
            type: 'pending',
            original,
            context,
        };
        this.translationText = '';
        this.originalText = original;
        this.renderCollapsed(context);
    }

    private updateCollapsedVisuals() {
        if (!this.container || !this.iconButton) {
            return;
        }
        const state = this.currentState?.type ?? 'idle';
        this.container.dataset.popupState = state;
        this.iconButton.dataset.state = state;
        const tooltip = this.getCollapsedTooltip();
        this.iconButton.title = tooltip;
        this.iconButton.setAttribute('aria-label', tooltip);
    }

    private getCollapsedTooltip(): string {
        const state = this.currentState;
        if (!state) {
            return 'Gemini翻訳';
        }
        switch (state.type) {
            case 'loading':
                return '翻訳を準備しています…クリックで詳細を表示';
            case 'result':
                return '翻訳が完了しました。クリックで結果を表示';
            case 'error':
                return '翻訳に失敗しました。クリックで詳細を表示';
            case 'cancelled':
                return '翻訳を中断しました。クリックで詳細を表示';
            case 'pending':
                return '翻訳を開始するにはクリックしてください';
            default:
                return 'Gemini翻訳';
        }
    }

    hasPersistentState(): boolean {
        return Boolean(this.currentState);
    }

    expandToFull() {
        if (this.isExpanded) {
            return;
        }
        if (typeof this.onExpandHandler === 'function') {
            try {
                this.onExpandHandler();
            } catch (error) {
                console.error('PDF Inline Translate: 展開時に例外が発生しました。', error);
            }
        }
        this.renderExpandedState();
    }

    applyTheme() {
        if (!this.container) return;

        // Apply theme classes based on settings
        const theme = this.plugin.settings.popupTheme;
        const fontSize = this.plugin.settings.fontSize;

        // Remove existing theme classes
        this.container.classList.remove(
            'pdf-inline-translate__theme-default',
            'pdf-inline-translate__theme-dark',
            'pdf-inline-translate__theme-light',
            'pdf-inline-translate__theme-blue',
            'pdf-inline-translate__theme-green',
            'pdf-inline-translate__font-small',
            'pdf-inline-translate__font-medium',
            'pdf-inline-translate__font-large',
        );

        // Add theme class
        this.container.classList.add(`pdf-inline-translate__theme-${theme}`);
        this.container.classList.add(`pdf-inline-translate__font-${fontSize}`);

        // Apply size if container exists
        if (this.container && this.isExpanded) {
            this.container.style.width = `${this.plugin.settings.popupWidth}px`;
            this.container.style.height = `${this.plugin.settings.popupHeight}px`;
        }
    }

    renderExpandedState() {
        const state = this.currentState;
        const context = state?.context ?? this.lastContext ?? {};
        const original = state?.original ?? '';
        this.renderBase(original, context);

        if (this.container) {
            this.container.dataset.popupState = state?.type ?? 'idle';
        }

        if (!state) {
            if (this.statusEl) {
                this.statusEl.textContent = '';
            }
            this.toggleCopyButton(false);
            this.setPositionFromContext(context);
            return;
        }

        switch (state.type) {
            case 'loading':
                this.updateStatusBadge('loading');
                if (this.statusEl) {
                    this.statusEl.textContent = UI_STATUS_MESSAGES.LOADING;
                }
                this.translationText = '';
                this.toggleCopyButton(false);
                this.renderLoadingSkeleton();
                break;
            case 'pending':
                this.updateStatusBadge('pending');
                if (this.statusEl) {
                    this.statusEl.textContent = UI_STATUS_MESSAGES.PENDING;
                }
                this.translationText = '';
                this.toggleCopyButton(false);
                this.clearTranslationContent('pending');
                break;
            case 'result':
                this.updateStatusBadge('result');
                this.translationText = state.translation ?? '';
                this.renderCustomMarkdown(this.translationText);
                if (this.statusEl) {
                    this.statusEl.textContent = '';
                }
                this.clearSkeleton();
                this.toggleCopyButton(Boolean(this.translationText));
                break;
            case 'cancelled':
                this.updateStatusBadge('cancelled');
                if (this.statusEl) {
                    this.statusEl.textContent = UI_STATUS_MESSAGES.CANCELLED;
                }
                this.translationText = '';
                this.toggleCopyButton(false);
                this.clearTranslationContent('cancelled');
                break;
            case 'error':
                this.updateStatusBadge('error');
                if (this.statusEl) {
                    this.statusEl.textContent = state.message ?? UI_STATUS_MESSAGES.ERROR_DEFAULT;
                }
                this.translationText = '';
                this.toggleCopyButton(false);
                this.clearTranslationContent('error');
                break;
            default:
                this.updateStatusBadge('idle');
                this.clearTranslationContent('idle');
                break;
        }
        this.syncOriginalSection();
        this.setPositionFromContext(context);
    }

    ensureContainer() {
        if (this.container) return;
        if (!document || !document.body) return;
        const container = document.createElement('div');
        container.className = 'pdf-inline-translate__popup';
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-label', 'Gemini翻訳');
        container.setAttribute('aria-hidden', 'true');
        container.tabIndex = -1;
        container.style.display = 'none';
        document.body.appendChild(container);
        this.container = container;
    }

    handleClose() {
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }

    handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.handleClose();
        }
    }

    startDrag(event: PointerEvent) {
        if (event.button !== 0) {
            return;
        }
        if (
            (event.target as HTMLElement).closest('.pdf-inline-translate__popup-close') ||
            (event.target as HTMLElement).closest('.pdf-inline-translate__popup-collapse')
        ) {
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
        this.container.classList.add('is-dragging');
        try {
            this.container.setPointerCapture?.(event.pointerId);
        } catch (error) {
            console.debug('PDF Inline Translate: pointer capture失敗', error);
        }
        document.addEventListener('pointermove', this.boundOnDrag);
        document.addEventListener('pointerup', this.boundOnDragEnd);
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
                console.debug('PDF Inline Translate: pointer release失敗', error);
            }
        }
        this.stopDragging();
    }

    stopDragging() {
        if (this.container) {
            this.container.classList.remove('is-dragging');
        }
        this.dragState = null;
        document.removeEventListener('pointermove', this.boundOnDrag);
        document.removeEventListener('pointerup', this.boundOnDragEnd);
    }

    setPositionFromContext(context: TranslationContext) {
        if (!this.container) return;

        if (context && typeof context === 'object' && Object.keys(context).length > 0) {
            this.lastContext = context;
        }

        let rect = null;
        if (context?.rect && utilsIsValidRect(context.rect)) {
            const rectData = context.rect;
            // Validate rectangle values are numbers and not NaN
            if (
                typeof rectData.top === 'number' &&
                typeof rectData.left === 'number' &&
                typeof rectData.height === 'number' &&
                typeof rectData.width === 'number' &&
                !isNaN(rectData.top) &&
                !isNaN(rectData.left) &&
                !isNaN(rectData.height) &&
                !isNaN(rectData.width)
            ) {
                rect = {
                    top: Number(rectData.top),
                    left: Number(rectData.left),
                    height: Number(rectData.height),
                    width: Number(rectData.width),
                };
            }
        }

        const schedule = window?.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16));
        schedule(() => {
            if (!this.container) {
                return;
            }

            if (rect) {
                // Calculate position with additional safety checks
                const top = Number(rect.top) + Number(rect.height) + POPUP_OFFSET;
                const left = Number(rect.left);

                // Make sure values are valid numbers before applying
                if (!isNaN(top) && !isNaN(left) && isFinite(top) && isFinite(left)) {
                    this.applyPosition(top, left);
                } else {
                    // Fallback to last position or default if calculated position is invalid
                    if (this.lastPosition) {
                        this.applyPosition(this.lastPosition.top, this.lastPosition.left);
                    } else {
                        const defaultTop = POPUP_DEFAULT_TOP;
                        const defaultLeft =
                            window.innerWidth - (this.container?.offsetWidth || 300) - POPUP_OFFSET;
                        this.applyPosition(defaultTop, defaultLeft);
                    }
                }
            } else if (this.lastPosition) {
                this.applyPosition(this.lastPosition.top, this.lastPosition.left);
            } else {
                const defaultTop = POPUP_DEFAULT_TOP;
                const defaultLeft =
                    window.innerWidth - (this.container?.offsetWidth || 300) - POPUP_OFFSET;
                this.applyPosition(defaultTop, defaultLeft);
            }
        });
    }

    applyPosition(top: number, left: number) {
        if (!this.container) return;

        // Validate inputs
        if (
            typeof top !== 'number' ||
            typeof left !== 'number' ||
            isNaN(top) ||
            isNaN(left) ||
            !isFinite(top) ||
            !isFinite(left)
        ) {
            console.warn('PDF Inline Translate: 無効なポジション値が検出されました', { top, left });
            return;
        }

        const containerRect = this.container.getBoundingClientRect();
        const containerWidth = containerRect.width || this.container.offsetWidth || 300;
        const containerHeight = containerRect.height || this.container.offsetHeight || 200;

        const maxTop = window.innerHeight - containerHeight - POPUP_OFFSET;
        const maxLeft = window.innerWidth - containerWidth - POPUP_OFFSET;
        const clampedTop = utilsClamp(top, POPUP_OFFSET, Math.max(POPUP_OFFSET, maxTop));
        const clampedLeft = utilsClamp(left, POPUP_OFFSET, Math.max(POPUP_OFFSET, maxLeft));

        // Only apply position if values are valid
        if (isFinite(clampedTop) && isFinite(clampedLeft)) {
            this.container.style.top = `${clampedTop}px`;
            this.container.style.left = `${clampedLeft}px`;
            this.lastPosition = { top: clampedTop, left: clampedLeft };
        }
    }

    toggleCopyButton(isEnabled: boolean) {
        if (!this.copyButton) return;
        if (isEnabled) {
            this.copyButton.removeAttribute('disabled');
        } else {
            this.copyButton.setAttribute('disabled', 'true');
        }
    }

    // isValidRect has been replaced with the utility function
    // isValidRect(rect: any): boolean {
    // 	return (
    // 		rect &&
    // 		typeof rect.top === "number" &&
    // 		typeof rect.left === "number" &&
    // 		typeof rect.height === "number" &&
    // 		typeof rect.width === "number"
    // 	);
    // }

    // clamp has been replaced with the utility function
    // clamp(value: number, min: number, max: number): number {
    // 	if (!Number.isFinite(value)) {
    // 		return min;
    // 	}
    // 	return Math.min(Math.max(value, min), max);
    // }

    addGlobalListener() {
        this.removeGlobalListener();
        document.addEventListener('keydown', this.boundOnKeydown);
    }

    removeGlobalListener() {
        document.removeEventListener('keydown', this.boundOnKeydown);
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

    private updateStatusBadge(state: string) {
        if (!this.statusBadgeEl) {
            return;
        }
        const badge = this.statusBadgeEl;
        badge.dataset.state = state;
        switch (state) {
            case 'loading':
                badge.textContent = '翻訳中…';
                break;
            case 'result':
                badge.textContent = '翻訳完了';
                break;
            case 'error':
                badge.textContent = 'エラー';
                break;
            case 'cancelled':
                badge.textContent = '中断';
                break;
            case 'pending':
                badge.textContent = '待機中';
                break;
            default:
                badge.textContent = '準備完了';
                break;
        }
    }

    private syncOriginalSection() {
        if (!this.originalSection || !this.originalToggleButton || !this.originalEl) {
            return;
        }

        // Check if original text display is enabled in settings
        const showOriginal = this.plugin.settings.showOriginalText;
        const hasOriginal = Boolean(this.originalText?.trim());

        // Hide the entire original section if setting is disabled
        if (!showOriginal) {
            this.originalSection.setAttribute('hidden', 'true');
            this.isOriginalVisible = false;
            return;
        }

        this.originalSection.toggleAttribute('hidden', !hasOriginal);
        this.originalToggleButton.textContent = this.isOriginalVisible
            ? '原文を隠す'
            : '原文を表示';
        if (this.originalEl) {
            this.originalEl.textContent = this.originalText ?? '';
            this.originalEl.toggleAttribute('hidden', !this.isOriginalVisible);
        }
        this.originalSection.classList.toggle('is-expanded', this.isOriginalVisible && hasOriginal);
        this.originalToggleButton.setAttribute(
            'aria-expanded',
            this.isOriginalVisible ? 'true' : 'false',
        );
        this.originalToggleButton.toggleAttribute('disabled', !hasOriginal);
        if (!hasOriginal) {
            this.isOriginalVisible = false;
        }
    }

    private toggleOriginalVisibility() {
        this.isOriginalVisible = !this.isOriginalVisible;
        this.syncOriginalSection();
    }

    private renderCustomMarkdown(markdown: string) {
        if (!this.translationEl) {
            return;
        }
        MarkdownRenderer.render(markdown, this.translationEl);
    }

    private renderLoadingSkeleton() {
        if (!this.translationEl) {
            return;
        }
        this.translationEl.classList.remove('pdf-inline-translate__translation--custom');
        this.translationEl.innerHTML = '';
        this.translationEl.dataset.state = 'loading';
        const skeleton = document.createElement('div');
        skeleton.className = 'pdf-inline-translate__skeleton';
        for (let i = 0; i < 4; i++) {
            const line = document.createElement('div');
            line.className = 'pdf-inline-translate__skeleton-line';
            line.style.setProperty('--skeleton-width', `${80 - i * 12}%`);
            skeleton.appendChild(line);
        }
        this.translationEl.appendChild(skeleton);
    }

    private clearSkeleton() {
        if (!this.translationEl) {
            return;
        }
        if (this.translationEl.dataset.state === 'loading') {
            this.translationEl.dataset.state = '';
        }
    }

    private clearTranslationContent(state: string = '') {
        if (!this.translationEl) {
            return;
        }
        this.translationEl.dataset.state = state;
        this.translationEl.classList.remove('pdf-inline-translate__translation--custom');
        this.translationEl.innerHTML = '';
    }
}
