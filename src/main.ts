import { Plugin, Notice } from 'obsidian';
import { PdfInlineTranslatePluginSettings, TranslationContext } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { PdfInlineTranslateSettingTab } from './settings-tab';
import { GeminiTranslationFloatingPopup } from './ui/floating-popup';
import { GeminiClient } from './api/gemini-client';
import { SelectionManager } from './selection-manager';
import { UIManager } from './ui/ui-manager';
import { TranslationHistoryManager } from './translation-history-manager';
import { TRANSLATION_HISTORY_VIEW_TYPE, TranslationHistoryView } from './ui/translation-history-view';
import { TranslationProviderManager } from './translation-provider-manager';
import { BatchTranslationService } from './batch-translation-service';

declare global {
    interface Window {
        pdfPlus?: {
            getActiveViewer: () => any;
        };
    }
}

import { TranslationHistory } from './types';

export default class PdfInlineTranslatePlugin extends Plugin {
	settings: PdfInlineTranslatePluginSettings;
	geminiClient: GeminiClient;
	selectionManager: SelectionManager;
	uiManager: UIManager;
    lastSelection: { text: string; context: TranslationContext; } | null = null;
    translationHistory: TranslationHistory;

	async onload() {
		console.info("PDF Inline Translate (Gemini) ロード開始");
		await this.loadSettings();
		this.updatePopupBackgroundColorAlpha();

		this.selectionManager = new SelectionManager(this);
		this.uiManager = new UIManager(this);

		this.selectionManager.onload();
		this.uiManager.onload();

		// Register the translation history view
		this.registerView(
			TRANSLATION_HISTORY_VIEW_TYPE,
			(leaf) => new TranslationHistoryView(leaf, this)
		);

		// Add command to open the history view
		this.addCommand({
			id: 'open-translation-history',
			name: 'Open Translation History',
			callback: () => {
				this.openTranslationHistoryView();
			}
		});

		// Add command to toggle auto-translation
		this.addCommand({
			id: 'toggle-auto-translate',
			name: 'Toggle Auto-Translation',
			callback: () => {
				this.settings.enableAutoTranslate = !this.settings.enableAutoTranslate;
				void this.saveSettings();
				new Notice(`Auto-translation ${this.settings.enableAutoTranslate ? 'enabled' : 'disabled'}`);
			}
		});

		// Add command to copy last translation result
		this.addCommand({
			id: 'copy-last-translation',
			name: 'Copy Last Translation',
			callback: () => {
				if (this.translationHistory.items.length > 0) {
					const lastItem = this.translationHistory.items[0]; // Most recent
					navigator.clipboard.writeText(lastItem.translation).then(() => {
						new Notice('Last translation copied to clipboard');
					}).catch(() => {
						new Notice('Failed to copy translation');
					});
				} else {
					new Notice('No translation history available');
				}
			}
		});

		// Add command to clear the floating popup
		this.addCommand({
			id: 'close-translation-popup',
			name: 'Close Translation Popup',
			callback: () => {
				this.closeFloatingPopup();
			}
		});

		// Add command to initiate batch translation
		this.addCommand({
			id: 'initiate-batch-translation',
			name: 'Initiate Batch Translation',
			callback: () => {
				this.initiateBatchTranslation();
			}
		});

		this.addSettingTab(new PdfInlineTranslateSettingTab(this.app, this));

		if (!window.pdfPlus) {
			new Notice(
				"PDF Inline Translate: PDF++プラグインが見つかりません。PDF++を有効化してください。",
			);
		}
	}

	private initiateBatchTranslation() {
		// Get selected text from the active editor if available
		const activeView = this.app.workspace.getActiveViewOfType( 
			this.app.workspace.getLeaf().view.constructor
		);
		
		if (activeView && 'editor' in activeView) {
			const editor = (activeView as any).editor;
			if (editor) {
				const selectedText = editor.getSelection();
				if (selectedText) {
					// Split text into sentences or paragraphs for batch processing
					const segments = this.splitTextForBatch(selectedText);
					
					if (segments.length === 0) {
						new Notice('No text segments to translate');
						return;
					}
					
					if (segments.length === 1) {
						// If only one segment, just use regular translation
						this.uiManager.openTranslationInPopup(segments[0], {});
						return;
					}
					
					// Create a batch translation job
					const job = this.batchService.createJob(segments, this.settings.targetLanguage);
					
					// Execute the batch translation in the background
					new Notice(`Starting batch translation of ${segments.length} segments...`);
					
					// Process in background
					void this.batchService.executeJob(job.id, 2) // Process 2 at a time to avoid rate limits
						.then(result => {
							new Notice(`Batch translation completed: ${result.results.length} translations`);
						})
						.catch(error => {
							console.error('Batch translation failed:', error);
							new Notice('Batch translation failed. See console for details.');
						});
				} else {
					new Notice('Please select text to translate in batch');
				}
			} else {
				new Notice('No editor available for batch translation');
			}
		} else {
			new Notice('Please open a note with text to translate in batch');
		}
	}

	private splitTextForBatch(text: string): string[] {
		// Split text by paragraphs or sentences, but preserve sentence structure
		// Limit each segment to avoid API limits
		const maxSegmentLength = 1000; // Adjust based on API limits
		
		// First, split by paragraphs
		const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
		
		const segments: string[] = [];
		
		for (const paragraph of paragraphs) {
			if (paragraph.length <= maxSegmentLength) {
				segments.push(paragraph.trim());
			} else {
				// If paragraph is too long, split by sentences
				const sentences = paragraph.split(/(?<=[.!?])\s+/);
				let currentSegment = '';
				
				for (const sentence of sentences) {
					if ((currentSegment + ' ' + sentence).length > maxSegmentLength) {
						if (currentSegment) {
							segments.push(currentSegment.trim());
						}
						currentSegment = sentence;
					} else {
						currentSegment = currentSegment ? currentSegment + ' ' + sentence : sentence;
					}
				}
				
				if (currentSegment) {
					segments.push(currentSegment.trim());
				}
			}
		}
		
		// Filter out any empty segments
		return segments.filter(s => s.length > 0);
	}

	async openTranslationHistoryView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: TRANSLATION_HISTORY_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		console.info("PDF Inline Translate (Gemini) アンロード");
		if (this.selectionManager) {
			this.selectionManager.onunload();
		}
		if (this.uiManager) {
			this.uiManager.onunload();
		}
	}

	private translationHistoryManager: TranslationHistoryManager;
	private batchTranslationService: BatchTranslationService;

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Initialize or load translation history
		const historyData = loadedData?.translationHistory;
		this.translationHistory = {
			items: Array.isArray(historyData?.items) ? historyData.items : []
		};
		
		// Initialize the translation history manager
		this.translationHistoryManager = new TranslationHistoryManager(this);
		
		// Initialize the provider manager and gemini client
		const providerManager = new TranslationProviderManager(
			this.settings,
			this.translationHistoryManager
		);
		this.geminiClient = new GeminiClient(this.settings, this.translationHistoryManager);
		
		// Initialize the batch translation service
		this.batchTranslationService = new BatchTranslationService(
			providerManager,
			this.translationHistoryManager
		);
	}

	async saveSettings() {
		// Merge translation history into settings before saving
		await this.saveData({ 
			...this.settings,
			translationHistory: this.translationHistory
		});
	}

	updatePopupBackgroundColorAlpha() {
        document.body.style.setProperty(
            "--popup-background-alpha",
            this.settings.popupBackgroundColorAlpha.toString()
        );
	}

	openTranslation(selectionText: string, context: any) {
		// Check if the current provider is properly configured
		if (this.settings.translationProvider === 'gemini' && 
			(!this.settings.apiKey || typeof this.settings.apiKey !== 'string' || this.settings.apiKey.trim().length === 0)) {
			new Notice("Gemini APIキーを設定してください。");
			this.openSettingTab();
			return;
		} else if (this.settings.translationProvider === 'openai' && 
			(!this.settings.openAIApiKey || typeof this.settings.openAIApiKey !== 'string' || this.settings.openAIApiKey.trim().length === 0)) {
			new Notice("OpenAI APIキーを設定してください。");
			this.openSettingTab();
			return;
		} else if (this.settings.translationProvider === 'anthropic' && 
			(!this.settings.anthropicApiKey || typeof this.settings.anthropicApiKey !== 'string' || this.settings.anthropicApiKey.trim().length === 0)) {
			new Notice("Anthropic APIキーを設定してください。");
			this.openSettingTab();
			return;
		}

		if (!selectionText || typeof selectionText !== 'string' || selectionText.trim().length === 0) {
			new Notice("選択テキストが無効です。");
			return;
		}

		// Check if text is too long
		if (selectionText.length > 10000) { // Adjust as needed based on API limits
			new Notice("選択テキストが長すぎます（最大10,000文字）。");
			return;
		}

		try {
			const preparedContext = this.selectionManager.prepareContext(context);

			this.lastSelection = {
				text: selectionText,
				context: preparedContext,
			};
			void this.uiManager.openTranslationInPopup(selectionText, preparedContext);
		} catch (error) {
			console.error("PDF Inline Translate: Failed to open translation", error);
			new Notice("翻訳を開く際にエラーが発生しました。詳細はコンソールをご確認ください。");
		}
	}

	getAssetUrl(relativePath: string): string | null {
		if (!relativePath || typeof relativePath !== 'string' || relativePath.trim().length === 0) {
			return null;
		}
		
		const adapter = this.app?.vault?.adapter;
		if (!adapter) {
			return null;
		}
		
		const configDir = (this.app?.vault?.configDir && typeof this.app.vault.configDir === 'string') 
			? this.app.vault.configDir 
			: ".obsidian";
		const pluginId = (this.manifest?.id && typeof this.manifest.id === 'string') 
			? this.manifest.id 
			: "pdf-inline-translate";
		const normalizedPath = `${configDir}/plugins/${pluginId}/${relativePath}`;

		if (typeof adapter.getResourcePath === 'function') {
			try {
				const resourcePath = adapter.getResourcePath(normalizedPath);
				return (typeof resourcePath === 'string' && resourcePath.length > 0) 
					? resourcePath 
					: null;
			} catch (error) {
				console.error(
					"PDF Inline Translate: アセットURLの取得に失敗しました。",
					error,
				);
			}
		}
		return null;
	}

	closeFloatingPopup() {
		this.uiManager.closeFloatingPopup();
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

	get floatingPopup(): GeminiTranslationFloatingPopup | null {
		return this.uiManager?.floatingPopup ?? null;
	}

	get historyManager(): TranslationHistoryManager {
		return this.translationHistoryManager;
	}

	get batchService(): BatchTranslationService {
		return this.batchTranslationService;
	}
}