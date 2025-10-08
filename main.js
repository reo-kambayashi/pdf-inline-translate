const {
	Plugin,
	Notice,
	Modal,
	Setting,
	MarkdownView,
	PluginSettingTab,
	ItemView,
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
	autoPasteToEditor: false,
	insertTemplate:
		"> [!note] PDF翻訳 (pdf++ page {{page}})\n> 原文: {{original}}\n\n{{translation}}\n",
	timeoutMs: 20000,
	autoTranslateOnSelection: false,
	displayMode: "modal",
};

const AUTO_TRANSLATE_DEBOUNCE_MS = 350;
const AUTO_TRANSLATE_REPEAT_THRESHOLD_MS = 1500;
const DISPLAY_MODE_MODAL = "modal";
const DISPLAY_MODE_PANEL = "panel";
const VIEW_TYPE_TRANSLATION_PANEL = "pdf-inline-translate-panel";

class GeminiTranslationModal extends Modal {
	/**
	 * @param {import("obsidian").App} app
	 * @param {PdfInlineTranslatePlugin} plugin
	 * @param {string} sourceText
	 * @param {{ pageNumber?: number, selection?: string } | undefined} context
	 */
	constructor(app, plugin, sourceText, context) {
		super(app);
		this.plugin = plugin;
		this.sourceText = sourceText;
		this.context = context;
		this.abortController = new AbortController();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Gemini翻訳" });
		const info = contentEl.createEl("div", { cls: "pdf-inline-translate__section" });
		info.createEl("p", {
			text: this.context?.pageNumber != null
				? `PDFページ: ${this.context.pageNumber}`
				: "ページ番号情報なし",
		});
		const originalDetails = contentEl.createEl("details", {
			cls: "pdf-inline-translate__original",
		});
		originalDetails.createEl("summary", { text: "原文を表示" });
		originalDetails.createEl("pre", {
			text: this.sourceText,
		});

		this.statusEl = contentEl.createEl("p", {
			text: "Geminiに問い合わせ中…",
			cls: "pdf-inline-translate__status",
		});

		this.translationEl = contentEl.createEl("div", {
			cls: "pdf-inline-translate__translation",
		});

		const buttonRow = contentEl.createEl("div", {
			cls: "pdf-inline-translate__buttons",
		});

		this.copyButton = buttonRow.createEl("button", {
			text: "コピー",
			cls: "mod-cta",
			attr: { disabled: "true" },
		});
		this.copyButton.addEventListener("click", () => {
			if (!this.translationText) return;
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

		this.cancelButton = buttonRow.createEl("button", {
			text: "キャンセル",
		});
		this.cancelButton.addEventListener("click", () => {
			this.abortController.abort();
			this.close();
		});

		this.translate();
	}

	async translate() {
		const schedule = window?.setTimeout ?? setTimeout;
		const cancelTimer = window?.clearTimeout ?? clearTimeout;
		let timeoutId;
		let timedOut = false;
		try {
			timeoutId = schedule(() => {
				timedOut = true;
				try {
					this.abortController.abort();
				} catch (error) {
					console.error(error);
				}
			}, this.plugin.settings.timeoutMs);

			const translation = await this.plugin.requestTranslation(
				this.sourceText,
				this.context,
				this.abortController.signal,
			);

			cancelTimer(timeoutId);
			if (this.abortController.signal.aborted) {
				return;
			}
			this.translationText = translation;
			this.translationEl.empty();
			this.translationEl.createEl("pre", {
				text: translation,
				cls: "pdf-inline-translate__translation-text",
			});
			this.copyButton.removeAttribute("disabled");
			this.statusEl.setText("翻訳完了");

			if (this.plugin.settings.autoPasteToEditor) {
				const inserted = await this.plugin.insertIntoActiveEditor(
					this.sourceText,
					translation,
					this.context,
				);
				if (inserted) {
					new Notice("翻訳結果をアクティブなノートへ挿入しました。");
				}
			}
		} catch (error) {
			if (typeof timeoutId !== "undefined") {
				cancelTimer(timeoutId);
			}
			console.error(error);
			if (this.abortController.signal.aborted) {
				this.statusEl.setText(
					timedOut
						? "タイムアウトにより翻訳を中断しました。"
						: "翻訳リクエストを中断しました。",
				);
				return;
			}
			this.statusEl.setText("翻訳に失敗しました。詳細はコンソールをご確認ください。");
			new Notice(
				error?.message
					? `Gemini翻訳エラー: ${error.message}`
					: "Gemini翻訳に失敗しました。",
			);
		}
	}

	onClose() {
		this.contentEl.empty();
		this.abortController.abort();
	}
}

class GeminiTranslationPanelView extends ItemView {
	/**
	 * @param {import("obsidian").WorkspaceLeaf} leaf
	 * @param {PdfInlineTranslatePlugin} plugin
	 */
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.translationText = "";
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
	}

	getViewType() {
		return VIEW_TYPE_TRANSLATION_PANEL;
	}

	getDisplayText() {
		return "PDF翻訳";
	}

	getIcon() {
		return "languages";
	}

	onOpen() {
		this.renderWelcome();
	}

	onClose() {
		this.clearRefs();
	}

	renderWelcome() {
		const container = this.containerEl;
		container.empty();
		container.removeClass("pdf-inline-translate__panel-view");
		const wrapper = container.createEl("div", {
			cls: "pdf-inline-translate__panel-empty",
		});
		wrapper.createEl("h2", { text: "Gemini翻訳" });
		wrapper.createEl("p", {
			text: "PDF++でテキストを選択すると翻訳結果がここに表示されます。",
		});
	}

	/**
	 * @param {string} original
	 * @param {{ pageNumber?: number }} context
	 */
	showLoading(original, context) {
		this.renderBase(original, context);
		if (this.statusEl) {
			this.statusEl.setText("Geminiに問い合わせ中…");
		}
		this.translationText = "";
		this.toggleCopyButton(false);
		if (this.translationEl) {
			this.translationEl.empty();
		}
	}

	/**
	 * @param {string} original
	 * @param {string} translation
	 * @param {{ pageNumber?: number }} context
	 */
	showResult(original, translation, context) {
		if (!this.statusEl) {
			this.renderBase(original, context);
		}
		this.translationText = translation;
		if (this.translationEl) {
			this.translationEl.empty();
			this.translationEl.createEl("pre", {
				text: translation,
				cls: "pdf-inline-translate__translation-text",
			});
		}
		if (this.statusEl) {
			this.statusEl.setText("翻訳完了");
		}
		this.toggleCopyButton(true);
	}

	/**
	 * @param {string} original
	 * @param {{ pageNumber?: number }} context
	 */
	showCancelled(original, context) {
		if (!this.statusEl) {
			this.renderBase(original, context);
		}
		if (this.statusEl) {
			this.statusEl.setText("翻訳を中断しました。");
		}
		this.toggleCopyButton(false);
	}

	/**
	 * @param {string} original
	 * @param {{ pageNumber?: number }} context
	 * @param {string} message
	 */
	showError(original, context, message) {
		if (!this.statusEl) {
			this.renderBase(original, context);
		}
		if (this.statusEl) {
			this.statusEl.setText(message);
		}
		this.toggleCopyButton(false);
	}

	/**
	 * @param {string} original
	 * @param {{ pageNumber?: number }} context
	 */
	renderBase(original, context) {
		const container = this.containerEl;
		container.empty();
		container.addClass("pdf-inline-translate__panel-view");

		const header = container.createEl("div", {
			cls: "pdf-inline-translate__panel-header",
		});
		header.createEl("h2", { text: "Gemini翻訳" });

		const info = container.createEl("div", {
			cls: "pdf-inline-translate__section",
		});
		info.createEl("p", {
			text:
				context?.pageNumber != null
					? `PDFページ: ${context.pageNumber}`
					: "ページ番号情報なし",
		});

		const originalDetails = container.createEl("details", {
			cls: "pdf-inline-translate__original",
		});
		originalDetails.createEl("summary", { text: "原文を表示" });
		originalDetails.createEl("pre", { text: original });

		this.statusEl = container.createEl("p", {
			cls: "pdf-inline-translate__status",
		});

		this.translationEl = container.createEl("div", {
			cls: "pdf-inline-translate__translation",
		});

		const buttonRow = container.createEl("div", {
			cls: "pdf-inline-translate__buttons",
		});

		this.copyButton = buttonRow.createEl("button", {
			text: "コピー",
			cls: "mod-cta",
			attr: { disabled: "true" },
		});
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
	}

	toggleCopyButton(isEnabled) {
		if (!this.copyButton) return;
		if (isEnabled) {
			this.copyButton.removeAttribute("disabled");
		} else {
			this.copyButton.setAttribute("disabled", "true");
		}
	}

	clearRefs() {
		this.translationText = "";
		this.statusEl = null;
		this.translationEl = null;
		this.copyButton = null;
	}
}

class PdfInlineTranslateSettingTab extends PluginSettingTab {
	/**
	 * @param {import("obsidian").App} app
	 * @param {PdfInlineTranslatePlugin} plugin
	 */
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
			.setName("翻訳結果を自動挿入")
			.setDesc("有効化すると、翻訳結果をアクティブなMarkdownファイルに挿入します。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoPasteToEditor)
					.onChange(async (value) => {
						this.plugin.settings.autoPasteToEditor = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("PDF選択時に自動翻訳")
			.setDesc("PDF++でテキストを選択すると自動的にGemini翻訳ビューを表示します。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoTranslateOnSelection)
					.onChange(async (value) => {
						this.plugin.settings.autoTranslateOnSelection = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("翻訳結果の表示方法")
			.setDesc("モーダル表示かサイドパネル表示かを切り替えます。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(DISPLAY_MODE_MODAL, "モーダル (操作を一時停止)")
					.addOption(DISPLAY_MODE_PANEL, "サイドパネル (操作を継続)")
					.setValue(
						[this.plugin.settings.displayMode].includes(DISPLAY_MODE_PANEL)
							? DISPLAY_MODE_PANEL
							: DISPLAY_MODE_MODAL,
					)
					.onChange(async (value) => {
						const nextValue =
							value === DISPLAY_MODE_PANEL
								? DISPLAY_MODE_PANEL
								: DISPLAY_MODE_MODAL;
						this.plugin.settings.displayMode = nextValue;
						await this.plugin.saveSettings();
						if (nextValue === DISPLAY_MODE_PANEL) {
							await this.plugin.ensureTranslationPanel();
						} else {
							this.plugin.closeTranslationPanel();
						}
					}),
			);

		new Setting(containerEl)
			.setName("挿入テンプレート")
			.setDesc("{{translation}}, {{original}}, {{targetLanguage}}, {{page}} を使って出力を整形します。")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.insertTemplate)
					.onChange(async (value) => {
						this.plugin.settings.insertTemplate =
							value || DEFAULT_SETTINGS.insertTemplate;
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
	}
}

class PdfInlineTranslatePlugin extends Plugin {
	async onload() {
		console.info("PDF Inline Translate (Gemini) ロード開始");
		await this.loadSettings();

		this.autoTranslateTimer = null;
		this.lastAutoTranslateKey = null;
		this.lastAutoTranslateTriggeredAt = 0;
		this.panelAbortController = null;

		this.registerView(
			VIEW_TYPE_TRANSLATION_PANEL,
			(leaf) => new GeminiTranslationPanelView(leaf, this),
		);

		this.addSettingTab(
			new PdfInlineTranslateSettingTab(this.app, this),
		);

		this.registerEvent(
			this.app.workspace.on("pdf-menu", (menu, data) => {
				const selection = data?.selection;
				if (!selection || !selection.trim?.()) {
					return;
				}

				menu.addItem((item) => {
					item.setTitle("Geminiで翻訳");
					item.setIcon("languages");
					item.onClick(() => {
						this.openTranslation(selection.trim(), data);
					});
				});
			}),
		);

		this.addCommand({
			id: "translate-last-pdf-selection-with-gemini",
			name: "直前に取得したPDF選択範囲を翻訳",
			checkCallback: (checking) => {
				if (!this.lastSelection) return false;
				if (!checking) {
					this.openTranslation(
						this.lastSelection.text,
						this.lastSelection.context,
					);
				}
				return true;
			},
		});

		this.registerDomEvent(document, "selectionchange", () => {
			if (!this.settings.autoTranslateOnSelection) {
				return;
			}
			if (!document.hasFocus()) {
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
			}, AUTO_TRANSLATE_DEBOUNCE_MS);
		});

		this.register(() => {
			const cancelTimer = window?.clearTimeout ?? clearTimeout;
			if (this.autoTranslateTimer) {
				cancelTimer(this.autoTranslateTimer);
				this.autoTranslateTimer = null;
			}
			if (this.panelAbortController) {
				try {
					this.panelAbortController.abort();
				} catch (error) {
					console.error(error);
				}
				this.panelAbortController = null;
			}
		});

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.displayMode === DISPLAY_MODE_PANEL) {
				this.ensureTranslationPanel().catch((error) =>
					console.error("PDF Inline Translate: パネル初期化に失敗しました。", error),
				);
			}
		});

		if (!window.pdfPlus) {
			new Notice(
				"PDF Inline Translate: PDF++プラグインが見つかりません。PDF++を有効化してください。",
			);
		}
	}

	onunload() {
		console.info("PDF Inline Translate (Gemini) アンロード");
		this.closeTranslationPanel();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	openTranslation(selectionText, context) {
		if (!this.settings.apiKey) {
			new Notice("Gemini APIキーを設定してください。");
			this.openSettingTab();
			return;
		}

		this.lastSelection = {
			text: selectionText,
			context,
		};
		if (this.settings.displayMode === DISPLAY_MODE_PANEL) {
			void this.openTranslationInPanel(selectionText, context);
			return;
		}
		new GeminiTranslationModal(this.app, this, selectionText, context).open();
	}

	async openTranslationInPanel(selectionText, context) {
		let view;
		try {
			const leaf = await this.getOrCreateTranslationPanelLeaf();
			view = leaf?.view;
		} catch (error) {
			console.error("PDF Inline Translate: パネルを開けませんでした。", error);
			new Notice("翻訳パネルを開くことができませんでした。詳細はコンソールを確認してください。");
			return;
		}

		if (!(view instanceof GeminiTranslationPanelView)) {
			new Notice("翻訳パネルが利用できません。");
			return;
		}

		view.showLoading(selectionText, context ?? {});

		if (this.panelAbortController) {
			try {
				this.panelAbortController.abort();
			} catch (error) {
				console.error(error);
			}
		}
		const abortController = new AbortController();
		this.panelAbortController = abortController;

		try {
			const translation = await this.requestTranslation(
				selectionText,
				context,
				abortController.signal,
			);
			if (abortController.signal.aborted) {
				view.showCancelled(selectionText, context ?? {});
				return;
			}
			view.showResult(selectionText, translation, context ?? {});
			if (this.settings.autoPasteToEditor) {
				const inserted = await this.insertIntoActiveEditor(
					selectionText,
					translation,
					context,
				);
				if (inserted) {
					new Notice("翻訳結果をアクティブなノートへ挿入しました。");
				}
			}
		} catch (error) {
			if (abortController.signal.aborted) {
				view.showCancelled(selectionText, context ?? {});
				return;
			}
			console.error(error);
			const message =
				error?.message ??
				"翻訳に失敗しました。詳細はコンソールをご確認ください。";
			view.showError(selectionText, context ?? {}, message);
			new Notice(
				error?.message
					? `Gemini翻訳エラー: ${error.message}`
					: "Gemini翻訳に失敗しました。",
			);
		} finally {
			if (this.panelAbortController === abortController) {
				this.panelAbortController = null;
			}
		}
	}

	async ensureTranslationPanel() {
		if (this.settings.displayMode !== DISPLAY_MODE_PANEL) {
			return;
		}
		try {
			const leaf = await this.getOrCreateTranslationPanelLeaf();
			const view = leaf?.view;
			if (view instanceof GeminiTranslationPanelView) {
				view.renderWelcome();
			}
		} catch (error) {
			console.error("PDF Inline Translate: 翻訳パネル初期化エラー", error);
		}
	}

	closeTranslationPanel() {
		const leaves =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_TRANSLATION_PANEL);
		for (const leaf of leaves) {
			leaf.detach();
		}
		if (this.panelAbortController) {
			try {
				this.panelAbortController.abort();
			} catch (error) {
				console.error(error);
			}
			this.panelAbortController = null;
		}
	}

	async getOrCreateTranslationPanelLeaf() {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_TRANSLATION_PANEL);
		if (existing.length > 0) {
			return existing[0];
		}
		let leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			leaf = this.app.workspace.getLeaf(true);
		}
		if (!leaf) {
			throw new Error("ワークスペースのリーフを取得できません。");
		}
		await leaf.setViewState({
			type: VIEW_TYPE_TRANSLATION_PANEL,
			active: false,
		});
		return leaf;
	}

	handleSelectionForAutoTranslate() {
		if (!this.settings.autoTranslateOnSelection) {
			return;
		}

		const selection = window.getSelection?.();
		if (!selection || selection.rangeCount === 0) {
			return;
		}
		const text = selection.toString().trim();
		if (!text) {
			return;
		}

		const context = this.resolvePdfSelectionContext(selection, text);
		if (!context) {
			return;
		}

		const key = `${context.pageNumber ?? "N/A"}|${text}`;
		const now = Date.now();
		if (
			this.lastAutoTranslateKey === key &&
			now - this.lastAutoTranslateTriggeredAt < AUTO_TRANSLATE_REPEAT_THRESHOLD_MS
		) {
			return;
		}

		this.lastAutoTranslateKey = key;
		this.lastAutoTranslateTriggeredAt = now;
		this.openTranslation(text, context);
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

	async insertIntoActiveEditor(original, translation, context) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return false;

		const pageLabel =
			context?.pageNumber != null ? String(context.pageNumber) : "N/A";
		const formatted = this.settings.insertTemplate
			.replaceAll("{{original}}", original)
			.replaceAll("{{translation}}", translation)
			.replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
			.replaceAll("{{page}}", pageLabel);

		view.editor.replaceSelection(`${formatted}\n`);
		return true;
	}
}

module.exports = PdfInlineTranslatePlugin;
