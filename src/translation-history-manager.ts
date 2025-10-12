import { TranslationHistory, TranslationHistoryItem } from './types';
import PdfInlineTranslatePlugin from './main';

export class TranslationHistoryManager {
	private plugin: PdfInlineTranslatePlugin;
	private history: TranslationHistory;

	constructor(plugin: PdfInlineTranslatePlugin) {
		this.plugin = plugin;
		this.history = plugin.translationHistory;
	}

	/**
	 * Add a new translation to the history
	 * @param original The original text
	 * @param translation The translated text
	 * @param targetLanguage The target language
	 * @param sourceLanguage The source language (optional)
	 * @param modelUsed The model used for translation
	 * @param isDictionary Whether this was a dictionary lookup
	 */
	addToHistory(
		original: string, 
		translation: string, 
		targetLanguage: string,
		sourceLanguage?: string,
		modelUsed?: string,
		isDictionary: boolean = false
	): void {
		if (!this.plugin.settings.enableTranslationHistory) {
			return;
		}

		const newItem: TranslationHistoryItem = {
			id: this.generateId(),
			original,
			translation,
			targetLanguage,
			sourceLanguage,
			timestamp: Date.now(),
			modelUsed: modelUsed || this.plugin.settings.model,
			isDictionary
		};

		// Add to the beginning of the array (most recent first)
		this.history.items.unshift(newItem);

		// Limit the history to the maximum number of items
		if (this.history.items.length > this.plugin.settings.maxHistoryItems) {
			this.history.items = this.history.items.slice(0, this.plugin.settings.maxHistoryItems);
		}

		// Save the updated history
		this.plugin.translationHistory = this.history;
		void this.plugin.saveSettings();
	}

	/**
	 * Get all translation history items
	 */
	getHistory(): TranslationHistoryItem[] {
		return [...this.history.items]; // Return a copy to prevent external modifications
	}

	/**
	 * Get a specific number of most recent translations
	 * @param count The number of items to return
	 */
	getRecent(count: number): TranslationHistoryItem[] {
		return this.history.items.slice(0, count);
	}

	/**
	 * Search the history for items containing a specific text
	 * @param searchTerm The text to search for
	 * @param searchIn Which field to search in (original, translation, or both)
	 */
	searchHistory(searchTerm: string, searchIn: 'original' | 'translation' | 'both' = 'both'): TranslationHistoryItem[] {
		if (!searchTerm) return [];

		const term = searchTerm.toLowerCase();
		return this.history.items.filter(item => {
			switch (searchIn) {
				case 'original':
					return item.original.toLowerCase().includes(term);
				case 'translation':
					return item.translation.toLowerCase().includes(term);
				case 'both':
				default:
					return item.original.toLowerCase().includes(term) || 
					       item.translation.toLowerCase().includes(term);
			}
		});
	}

	/**
	 * Clear the entire translation history
	 */
	clearHistory(): void {
		this.history.items = [];
		this.plugin.translationHistory = this.history;
		void this.plugin.saveSettings();
	}

	/**
	 * Remove a specific item from history
	 * @param id The ID of the item to remove
	 */
	removeItem(id: string): boolean {
		const initialLength = this.history.items.length;
		this.history.items = this.history.items.filter(item => item.id !== id);
		
		if (this.history.items.length !== initialLength) {
			this.plugin.translationHistory = this.history;
			void this.plugin.saveSettings();
			return true;
		}
		return false;
	}

	/**
	 * Find a cached translation for the given text
	 * @param text The text to search for
	 * @param targetLanguage The target language to match
	 * @returns The cached translation if found, otherwise null
	 */
	findCachedTranslation(text: string, targetLanguage: string): TranslationHistoryItem | null {
		if (!this.plugin.settings.enableTranslationHistory) {
			return null;
		}

		// Find the most recent match
		const foundItem = this.history.items.find(item => 
			item.original === text && 
			item.targetLanguage === targetLanguage
		);

		return foundItem || null;
	}

	/**
	 * Generate a unique ID for a history item
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
	}

	/**
	 * Export the history as a JSON string
	 */
	exportHistory(): string {
		return JSON.stringify(this.history, null, 2);
	}

	/**
	 * Import history from a JSON string
	 * @param jsonString The JSON string to import
	 */
	importHistory(jsonString: string): boolean {
		try {
			const parsed = JSON.parse(jsonString);
			if (parsed && Array.isArray(parsed.items)) {
				this.history = parsed;
				this.plugin.translationHistory = this.history;
				void this.plugin.saveSettings();
				return true;
			}
			return false;
		} catch (error) {
			console.error('Failed to import translation history:', error);
			return false;
		}
	}
}