import { Notice } from 'obsidian';
import PdfInlineTranslatePlugin from './main';

export function registerCommands(plugin: PdfInlineTranslatePlugin) {
    // Add command to open the history view
    plugin.addCommand({
        id: 'open-translation-history',
        name: 'Open Translation History',
        callback: () => {
            plugin.openTranslationHistoryView();
        },
    });

    // Add command to toggle auto-translation
    plugin.addCommand({
        id: 'toggle-auto-translate',
        name: 'Toggle Auto-Translation',
        callback: () => {
            plugin.settings.enableAutoTranslate = !plugin.settings.enableAutoTranslate;
            void plugin.saveSettings();
            new Notice(
                `Auto-translation ${plugin.settings.enableAutoTranslate ? 'enabled' : 'disabled'}`,
            );
        },
    });

    // Add command to copy last translation result
    plugin.addCommand({
        id: 'copy-last-translation',
        name: 'Copy Last Translation',
        callback: () => {
            if (plugin.translationHistory.items.length > 0) {
                const lastItem = plugin.translationHistory.items[0]; // Most recent
                navigator.clipboard
                    .writeText(lastItem.translation)
                    .then(() => {
                        new Notice('Last translation copied to clipboard');
                    })
                    .catch(() => {
                        new Notice('Failed to copy translation');
                    });
            } else {
                new Notice('No translation history available');
            }
        },
    });

    // Add command to clear the floating popup
    plugin.addCommand({
        id: 'close-translation-popup',
        name: 'Close Translation Popup',
        callback: () => {
            plugin.closeFloatingPopup();
        },
    });

    // Add command to initiate batch translation
    plugin.addCommand({
        id: 'initiate-batch-translation',
        name: 'Initiate Batch Translation',
        callback: () => {
            plugin.initiateBatchTranslation();
        },
    });
}
