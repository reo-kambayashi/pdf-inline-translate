import { TranslationState } from '../types';
import { MarkdownRenderer } from './markdown-renderer';
import { UI_STATUS_MESSAGES } from './constants';

export interface PopupDomRefs {
    statusEl: HTMLElement | null;
    statusBadgeEl: HTMLElement | null;
    translationEl: HTMLElement | null;
    copyButton: HTMLButtonElement | null;
    originalSection: HTMLElement | null;
    originalToggleButton: HTMLButtonElement | null;
    originalEl: HTMLElement | null;
}

export class PopupStateRenderer {
    constructor(
        private getRefs: () => PopupDomRefs,
        private getOriginalText: () => string,
        private getIsOriginalVisible: () => boolean,
        private getShowOriginalTextSetting: () => boolean,
    ) {}

    renderState(state: TranslationState | null): void {
        const refs = this.getRefs();

        if (!state) {
            if (refs.statusEl) refs.statusEl.textContent = '';
            this.toggleCopyButton(false);
            return;
        }

        switch (state.type) {
            case 'loading':
                this.updateStatusBadge('loading');
                if (refs.statusEl) refs.statusEl.textContent = UI_STATUS_MESSAGES.LOADING;
                this.toggleCopyButton(false);
                this.renderLoadingSkeleton();
                break;
            case 'pending':
                this.updateStatusBadge('pending');
                if (refs.statusEl) refs.statusEl.textContent = UI_STATUS_MESSAGES.PENDING;
                this.toggleCopyButton(false);
                this.clearTranslationContent('pending');
                break;
            case 'result':
                this.updateStatusBadge('result');
                this.renderCustomMarkdown(state.translation ?? '');
                if (refs.statusEl) refs.statusEl.textContent = '';
                this.clearSkeleton();
                this.toggleCopyButton(Boolean(state.translation));
                break;
            case 'cancelled':
                this.updateStatusBadge('cancelled');
                if (refs.statusEl) refs.statusEl.textContent = UI_STATUS_MESSAGES.CANCELLED;
                this.toggleCopyButton(false);
                this.clearTranslationContent('cancelled');
                break;
            case 'error':
                this.updateStatusBadge('error');
                if (refs.statusEl) refs.statusEl.textContent = state.message ?? UI_STATUS_MESSAGES.ERROR_DEFAULT;
                this.toggleCopyButton(false);
                this.clearTranslationContent('error');
                break;
            default:
                this.updateStatusBadge('idle');
                this.clearTranslationContent('idle');
                break;
        }

        this.syncOriginalSection();
    }

    updateStatusBadge(state: string): void {
        const badge = this.getRefs().statusBadgeEl;
        if (!badge) return;
        badge.dataset.state = state;
        switch (state) {
            case 'loading':   badge.textContent = '翻訳中…'; break;
            case 'result':    badge.textContent = '翻訳完了'; break;
            case 'error':     badge.textContent = 'エラー'; break;
            case 'cancelled': badge.textContent = '中断'; break;
            case 'pending':   badge.textContent = '待機中'; break;
            default:          badge.textContent = '準備完了'; break;
        }
    }

    syncOriginalSection(): void {
        const refs = this.getRefs();
        if (!refs.originalSection || !refs.originalToggleButton || !refs.originalEl) return;

        const showOriginal = this.getShowOriginalTextSetting();
        const originalText = this.getOriginalText();
        const hasOriginal = Boolean(originalText?.trim());

        if (!showOriginal) {
            refs.originalSection.setAttribute('hidden', 'true');
            return;
        }

        const isOriginalVisible = this.getIsOriginalVisible();
        refs.originalSection.toggleAttribute('hidden', !hasOriginal);
        refs.originalToggleButton.textContent = isOriginalVisible ? '原文を隠す' : '原文を表示';
        refs.originalEl.textContent = originalText ?? '';
        refs.originalEl.toggleAttribute('hidden', !isOriginalVisible);
        refs.originalSection.classList.toggle('is-expanded', isOriginalVisible && hasOriginal);
        refs.originalToggleButton.setAttribute('aria-expanded', isOriginalVisible ? 'true' : 'false');
        refs.originalToggleButton.toggleAttribute('disabled', !hasOriginal);
    }

    toggleCopyButton(isEnabled: boolean): void {
        const btn = this.getRefs().copyButton;
        if (!btn) return;
        if (isEnabled) {
            btn.removeAttribute('disabled');
        } else {
            btn.setAttribute('disabled', 'true');
        }
    }

    private renderCustomMarkdown(markdown: string): void {
        const el = this.getRefs().translationEl;
        if (!el) return;
        MarkdownRenderer.render(markdown, el);
    }

    private renderLoadingSkeleton(): void {
        const el = this.getRefs().translationEl;
        if (!el) return;
        el.classList.remove('pdf-inline-translate__translation--custom');
        el.innerHTML = '';
        el.dataset.state = 'loading';
        const skeleton = document.createElement('div');
        skeleton.className = 'pdf-inline-translate__skeleton';
        for (let i = 0; i < 4; i++) {
            const line = document.createElement('div');
            line.className = 'pdf-inline-translate__skeleton-line';
            line.style.setProperty('--skeleton-width', `${80 - i * 12}%`);
            skeleton.appendChild(line);
        }
        el.appendChild(skeleton);
    }

    private clearSkeleton(): void {
        const el = this.getRefs().translationEl;
        if (!el) return;
        if (el.dataset.state === 'loading') el.dataset.state = '';
    }

    private clearTranslationContent(state: string = ''): void {
        const el = this.getRefs().translationEl;
        if (!el) return;
        el.dataset.state = state;
        el.classList.remove('pdf-inline-translate__translation--custom');
        el.innerHTML = '';
    }
}
