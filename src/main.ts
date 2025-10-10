import { Plugin, Notice } from 'obsidian';
import { PdfInlineTranslatePluginSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { PdfInlineTranslateSettingTab } from './settings-tab';
import { GeminiTranslationFloatingPopup } from './ui/floating-popup';
import { GeminiClient } from './api/gemini-client';
import { SelectionManager } from './selection-manager';
import { UIManager } from './ui/ui-manager';

declare global {
    interface Window {
        pdfPlus?: {
            getActiveViewer: () => any;
        };
    }
}

export default class PdfInlineTranslatePlugin extends Plugin {
	settings: PdfInlineTranslatePluginSettings;
	geminiClient: GeminiClient;
	selectionManager: SelectionManager;
	uiManager: UIManager;
    lastSelection: { text: string; context: any; } | null = null;

	async onload() {
		console.info("PDF Inline Translate (Gemini) ロード開始");
		await this.loadSettings();
		this.updatePopupBackgroundColorAlpha();

		this.selectionManager = new SelectionManager(this);
		this.uiManager = new UIManager(this);

		this.selectionManager.onload();
		this.uiManager.onload();

		this.addSettingTab(new PdfInlineTranslateSettingTab(this.app, this));

		if (!window.pdfPlus) {
			new Notice(
				"PDF Inline Translate: PDF++プラグインが見つかりません。PDF++を有効化してください。",
			);
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

	async loadSettings() {
		this.settings = Object.assign({},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		this.geminiClient = new GeminiClient(this.settings);
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

		const preparedContext = this.selectionManager.prepareContext(context);

		this.lastSelection = {
			text: selectionText,
			context: preparedContext,
		};
		void this.uiManager.openTranslationInPopup(selectionText, preparedContext);
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
}