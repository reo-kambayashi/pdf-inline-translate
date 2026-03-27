import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import PdfInlineTranslatePlugin from '../main';
import { TranslationHistoryItem } from '../types';

export const TRANSLATION_HISTORY_VIEW_TYPE = 'pdf-inline-translate-history';

export class TranslationHistoryView extends ItemView {
    private plugin: PdfInlineTranslatePlugin;
    private historyContainer: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: PdfInlineTranslatePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return TRANSLATION_HISTORY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Translation History';
    }

    getIcon(): string {
        return 'translate';
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();

        // Create header
        const header = container.createEl('div', { cls: 'pdf-inline-translate-history-header' });

        const title = header.createEl('h3', { text: 'Translation History' });
        title.setAttribute('aria-level', '1');
        title.setAttribute('role', 'heading');

        const controls = header.createEl('div', { cls: 'pdf-inline-translate-history-controls' });

        const searchInput = controls.createEl('input', {
            type: 'text',
            placeholder: 'Search translations...',
            cls: 'pdf-inline-translate-history-search',
        });
        searchInput.setAttribute('aria-label', 'Search translation history');
        searchInput.setAttribute('role', 'searchbox');

        const clearButton = controls.createEl('button', {
            text: 'Clear History',
            cls: 'pdf-inline-translate-history-clear-btn',
        });
        clearButton.setAttribute('aria-label', 'Clear all translation history');

        clearButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all translation history?')) {
                this.plugin.historyManager.clearHistory();
                this.renderHistory();
                new Notice('Translation history cleared');
            }
        });

        // Create history container
        this.historyContainer = container.createEl('div', {
            cls: 'pdf-inline-translate-history-container',
        });
        this.historyContainer.setAttribute('role', 'list');
        this.historyContainer.setAttribute('aria-label', 'Translation history list');

        // Render initial history
        this.renderHistory();

        // Add search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = (e.target as HTMLInputElement).value;
            this.renderHistory(searchTerm);
        });

        // Add keyboard navigation support
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.blur();
            }
        });
    }

    private renderHistory(searchTerm?: string) {
        this.historyContainer.empty();

        let items = this.plugin.historyManager.getHistory();
        if (searchTerm && searchTerm.trim()) {
            items = this.plugin.historyManager.searchHistory(searchTerm);
        }

        if (items.length === 0) {
            this.historyContainer.createEl('p', {
                text: 'No translation history found.',
                cls: 'pdf-inline-translate-history-empty',
            });
            return;
        }

        for (const item of items) {
            this.createHistoryItemElement(item);
        }
    }

    private createHistoryItemElement(item: TranslationHistoryItem) {
        const itemEl = this.historyContainer.createEl('div', {
            cls: 'pdf-inline-translate-history-item',
        });
        itemEl.setAttribute('role', 'listitem');

        // Header with original text and timestamp
        const headerEl = itemEl.createEl('div', {
            cls: 'pdf-inline-translate-history-item-header',
        });
        const originalEl = headerEl.createEl('div', {
            text:
                item.original.length > 100
                    ? item.original.substring(0, 100) + '...'
                    : item.original,
            cls: 'pdf-inline-translate-history-original',
        });
        originalEl.setAttribute('aria-label', `Original text: ${item.original}`);

        const metaEl = headerEl.createEl('div', { cls: 'pdf-inline-translate-history-meta' });
        metaEl.createEl('span', {
            text: new Date(item.timestamp).toLocaleString(),
            cls: 'pdf-inline-translate-history-timestamp',
        });
        metaEl.createEl('span', {
            text: ` | ${item.isDictionary ? 'Dictionary' : 'Translation'}`,
            cls: 'pdf-inline-translate-history-type',
        });

        // Translation content
        const translationEl = itemEl.createEl('div', {
            cls: 'pdf-inline-translate-history-translation',
        });
        translationEl.createEl('div', {
            text: item.translation,
            cls: 'pdf-inline-translate-history-content',
        });
        translationEl.setAttribute('aria-label', `Translation: ${item.translation}`);

        // Action buttons
        const actionsEl = itemEl.createEl('div', { cls: 'pdf-inline-translate-history-actions' });

        const copyButton = actionsEl.createEl('button', {
            text: 'Copy Translation',
            cls: 'pdf-inline-translate-history-copy-btn',
        });
        copyButton.setAttribute('aria-label', 'Copy translation to clipboard');
        copyButton.addEventListener('click', () => {
            navigator.clipboard
                .writeText(item.translation)
                .then(() => {
                    new Notice('Translation copied to clipboard');
                })
                .catch(() => {
                    new Notice('Failed to copy translation');
                });
        });

        const copyOriginalButton = actionsEl.createEl('button', {
            text: 'Copy Original',
            cls: 'pdf-inline-translate-history-copy-btn',
        });
        copyOriginalButton.setAttribute('aria-label', 'Copy original text to clipboard');
        copyOriginalButton.addEventListener('click', () => {
            navigator.clipboard
                .writeText(item.original)
                .then(() => {
                    new Notice('Original text copied to clipboard');
                })
                .catch(() => {
                    new Notice('Failed to copy original text');
                });
        });

        const removeButton = actionsEl.createEl('button', {
            text: 'Remove',
            cls: 'pdf-inline-translate-history-remove-btn',
        });
        removeButton.setAttribute('aria-label', 'Remove translation from history');
        removeButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to remove this item from history?')) {
                this.plugin.historyManager.removeItem(item.id);
                this.renderHistory();
                new Notice('Translation removed from history');
            }
        });
    }
}
