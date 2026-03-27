import { Notice } from 'obsidian';
import PdfInlineTranslatePlugin from '../main';
import { TranslationState, TranslationContext } from '../types';
import { PopupDragHandler } from './popup-drag-handler';
import { PopupPositioner } from './popup-positioner';
import { PopupDomBuilder, HeaderRefs, BodyRefs } from './popup-dom-builder';
import { PopupStateRenderer, PopupDomRefs } from './popup-state-renderer';

// Re-export MarkdownBlock from types for backward compatibility
export type { MarkdownBlock } from '../types';

export class GeminiTranslationFloatingPopup {
    private plugin: PdfInlineTranslatePlugin;
    private container: HTMLElement | null = null;

    // DOM refs — set by renderBase(), nulled by hide()/destroy()
    private statusEl: HTMLElement | null = null;
    private translationEl: HTMLElement | null = null;
    private copyButton: HTMLButtonElement | null = null;
    private statusBadgeEl: HTMLElement | null = null;
    private collapseButton: HTMLButtonElement | null = null;
    private originalToggleButton: HTMLButtonElement | null = null;
    private originalSection: HTMLElement | null = null;
    private originalEl: HTMLElement | null = null;
    private iconButton: HTMLButtonElement | null = null;

    // State
    private translationText: string = '';
    private onClose: (() => void) | null = null;
    private isExpanded: boolean = false;
    private currentState: TranslationState | null = null;
    private lastContext: TranslationContext | null = null;
    private onExpandHandler: (() => void) | null = null;
    private originalText: string = '';
    private isOriginalVisible: boolean = false;
    private readonly boundOnKeydown: (event: KeyboardEvent) => void;

    // Sub-modules
    private readonly positioner: PopupPositioner;
    private readonly dragHandler: PopupDragHandler;
    private readonly stateRenderer: PopupStateRenderer;

    constructor(plugin: PdfInlineTranslatePlugin) {
        this.plugin = plugin;
        this.boundOnKeydown = this.handleKeydown.bind(this);

        this.positioner = new PopupPositioner(() => this.container);
        this.dragHandler = new PopupDragHandler(
            () => this.container,
            (top, left) => this.positioner.applyPosition(top, left),
        );
        this.stateRenderer = new PopupStateRenderer(
            () => this.getDomRefs(),
            () => this.originalText,
            () => this.isOriginalVisible,
            () => this.plugin.settings.showOriginalText,
        );
    }

    private getDomRefs(): PopupDomRefs {
        return {
            statusEl: this.statusEl,
            statusBadgeEl: this.statusBadgeEl,
            translationEl: this.translationEl,
            copyButton: this.copyButton,
            originalSection: this.originalSection,
            originalToggleButton: this.originalToggleButton,
            originalEl: this.originalEl,
        };
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
        this.currentState = { type: 'loading', original, context };
        this.originalText = original;
        this.translationText = '';
        if (this.isExpanded || forceExpand) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showResult(original: string, translation: string, context: TranslationContext) {
        this.currentState = { type: 'result', original, context, translation };
        this.originalText = original;
        this.translationText = translation;
        if (this.isExpanded) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showCancelled(original: string, context: TranslationContext) {
        this.currentState = { type: 'cancelled', original, context };
        this.originalText = original;
        if (this.isExpanded) {
            this.renderExpandedState();
        } else {
            this.renderCollapsed(context);
        }
    }

    showError(original: string, context: TranslationContext, message: string) {
        this.currentState = { type: 'error', original, context, message };
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
        this.clearDomRefs();
        this.isExpanded = false;
        this.currentState = null;
        this.lastContext = null;
        this.onExpandHandler = null;
    }

    destroy() {
        if (!this.container) return;
        this.dragHandler.destroy();
        this.removeGlobalListener();
        this.container.remove();
        this.container = null;
        this.clearDomRefs();
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
        if (!container) return;

        this.isExpanded = true;
        this.clearDomRefs();
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

        this.applyTheme();

        const headerRefs: HeaderRefs = PopupDomBuilder.buildHeader(
            () => this.renderCollapsed(this.lastContext ?? this.currentState?.context ?? {}),
            () => this.handleClose(),
            (event) => this.dragHandler.startDrag(event),
        );
        const bodyRefs: BodyRefs = PopupDomBuilder.buildBody(
            this.isOriginalVisible,
            () => this.toggleOriginalVisibility(),
            () => this.handleCopy(),
        );

        // Store refs from builders
        this.statusBadgeEl = headerRefs.statusBadgeEl;
        this.collapseButton = headerRefs.collapseButton;
        this.statusEl = bodyRefs.statusEl;
        this.originalSection = bodyRefs.originalSection;
        this.originalToggleButton = bodyRefs.originalToggleButton;
        this.originalEl = bodyRefs.originalEl;
        this.translationEl = bodyRefs.translationEl;
        this.copyButton = bodyRefs.copyButton;

        // Initialize original visibility from settings
        this.isOriginalVisible = this.plugin.settings.showOriginalText;

        container.appendChild(headerRefs.element);
        container.appendChild(bodyRefs.element);

        this.addGlobalListener();
        this.focus();
    }

    private handleCopy() {
        if (!this.translationText) return;
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
        if (!container) return;

        this.clearDomRefs();
        this.dragHandler.stopDragging();
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
        icon.textContent = '訳';
        button.appendChild(icon);

        container.appendChild(button);
        this.iconButton = button;
        this.updateCollapsedVisuals();
        this.originalText = this.currentState?.original ?? this.originalText;
        this.positioner.setPositionFromContext(context);
        this.addGlobalListener();
    }

    prepareCollapsedState(original: string, context: TranslationContext) {
        this.currentState = { type: 'pending', original, context };
        this.translationText = '';
        this.originalText = original;
        this.renderCollapsed(context);
    }

    private updateCollapsedVisuals() {
        if (!this.container || !this.iconButton) return;
        const state = this.currentState?.type ?? 'idle';
        this.container.dataset.popupState = state;
        this.iconButton.dataset.state = state;
        const tooltip = this.getCollapsedTooltip();
        this.iconButton.title = tooltip;
        this.iconButton.setAttribute('aria-label', tooltip);
    }

    private getCollapsedTooltip(): string {
        const state = this.currentState;
        if (!state) return 'Gemini翻訳';
        switch (state.type) {
            case 'loading':   return '翻訳を準備しています…クリックで詳細を表示';
            case 'result':    return '翻訳が完了しました。クリックで結果を表示';
            case 'error':     return '翻訳に失敗しました。クリックで詳細を表示';
            case 'cancelled': return '翻訳を中断しました。クリックで詳細を表示';
            case 'pending':   return '翻訳を開始するにはクリックしてください';
            default:          return 'Gemini翻訳';
        }
    }

    hasPersistentState(): boolean {
        return Boolean(this.currentState);
    }

    expandToFull() {
        if (this.isExpanded) return;
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
        const fontSize = this.plugin.settings.fontSize;
        this.container.classList.remove(
            'pdf-inline-translate__theme-system',
            'pdf-inline-translate__theme-default',
            'pdf-inline-translate__theme-dark',
            'pdf-inline-translate__theme-light',
            'pdf-inline-translate__theme-blue',
            'pdf-inline-translate__theme-green',
            'pdf-inline-translate__font-small',
            'pdf-inline-translate__font-medium',
            'pdf-inline-translate__font-large',
        );
        const theme = this.plugin.settings.popupTheme;
        this.container.classList.add(`pdf-inline-translate__theme-${theme}`);
        this.container.classList.add(`pdf-inline-translate__font-${fontSize}`);
        if (this.isExpanded) {
            this.container.classList.add('pdf-inline-translate__popup--autosize');
        } else {
            this.container.classList.remove('pdf-inline-translate__popup--autosize');
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

        this.stateRenderer.renderState(state);
        this.positioner.setPositionFromContext(context);
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

    addGlobalListener() {
        this.removeGlobalListener();
        document.addEventListener('keydown', this.boundOnKeydown);
    }

    removeGlobalListener() {
        document.removeEventListener('keydown', this.boundOnKeydown);
    }

    containsElement(target: EventTarget | null): boolean {
        if (!this.container || !target) return false;
        if (!(target instanceof Node)) return false;
        return this.container.contains(target);
    }

    private toggleOriginalVisibility() {
        this.isOriginalVisible = !this.isOriginalVisible;
        this.stateRenderer.syncOriginalSection();
    }

    private clearDomRefs() {
        this.statusEl = null;
        this.translationEl = null;
        this.copyButton = null;
        this.statusBadgeEl = null;
        this.collapseButton = null;
        this.originalToggleButton = null;
        this.originalSection = null;
        this.originalEl = null;
        this.iconButton = null;
    }
}
