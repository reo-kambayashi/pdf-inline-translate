import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { GeminiClient } from "./lib/geminiClient";
import { ConsoleLogger } from "./lib/logger";
import { DEFAULT_SETTINGS, PluginSettings } from "./settings";
import { TranslatableSettingsTab, SettingsHost } from "./ui/settingsTab";
import { TranslatableResultModal } from "./ui/translationModal";
import { translate, LocaleId, DEFAULT_LOCALE } from "./locales";

export default class PdfInlineTranslatePlugin extends Plugin implements SettingsHost {
  settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
  private geminiClient: GeminiClient | null = null;
  private readonly logger = new ConsoleLogger("PdfInlineTranslate");
  private locale: LocaleId = DEFAULT_LOCALE;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.locale = this.resolveLocale();
    this.addSettingTab(new TranslatableSettingsTab(this.app, this));
    this.registerCommands();
    this.registerContextMenu();
    this.logger.info(translate("logger.loaded", this.locale));
  }

  onunload(): void {
    this.logger.info(translate("logger.unloaded", this.locale));
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData();
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), stored);
    this.invalidateClient();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.invalidateClient();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "translate-selected-pdf-text",
      name: translate("command.translateSelection", this.locale),
      checkCallback: (checking) => {
        const hasPdfSelection = this.hasValidPdfSelection();
        if (!checking && hasPdfSelection) {
          void this.translateSelection();
        }
        return hasPdfSelection;
      }
    });
  }

  private registerContextMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu) => {
        const leaf = this.getActivePdfLeaf();
        if (!leaf || !this.hasValidPdfSelection()) {
          return;
        }
        menu.addItem((item) => {
          item
            .setTitle(translate("context.translateSelection", this.locale))
            .setIcon("languages")
            .onClick(() => {
              void this.translateSelection();
            });
        });
      })
    );
  }

  private async translateSelection(): Promise<void> {
    if (!this.settings.apiKey) {
      new Notice(translate("notice.missingApiKey", this.locale));
      return;
    }
    const selectedText = this.getSelectedText();
    if (!selectedText) {
      new Notice(translate("notice.noSelection", this.locale));
      return;
    }

    const notice = new Notice(translate("notice.translating", this.locale), 0);
    try {
      const client = this.ensureClient();
      const result = await client.translate({
        text: selectedText,
        targetLanguage: this.settings.targetLanguage,
        sourceLanguage: this.settings.sourceLanguage ?? undefined
      });
      notice.hide();
      new TranslatableResultModal(this.app, {
        originalText: selectedText,
        translatedText: result.translatedText,
        targetLanguage: this.settings.targetLanguage,
        locale: this.locale
      }).open();
    } catch (error) {
      notice.hide();
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("翻訳に失敗しました", { message });
      new Notice(translate("notice.translationFailed", this.locale, { message }));
    }
  }

  private ensureClient(): GeminiClient {
    if (!this.geminiClient) {
      this.geminiClient = new GeminiClient({
        apiKey: this.settings.apiKey,
        timeoutMs: this.settings.timeoutMs,
        maxRetries: this.settings.maxRetries,
        logger: this.logger
      });
    }
    return this.geminiClient;
  }

  private invalidateClient(): void {
    this.geminiClient = null;
  }

  private getActivePdfLeaf(): WorkspaceLeaf | null {
    const active = this.app.workspace.getActiveLeaf();
    if (active?.view?.getViewType() === "pdf") {
      return active;
    }
    return null;
  }

  private getSelectedText(): string | null {
    const leaf = this.getActivePdfLeaf();
    if (!leaf) {
      return null;
    }
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    return text.trim() || null;
  }

  private hasValidPdfSelection(): boolean {
    return Boolean(this.getSelectedText());
  }

  getLocale(): LocaleId {
    return this.locale;
  }

  private resolveLocale(): LocaleId {
    const configuredLocale =
      (this.app.vault as unknown as { getConfig?: (key: string) => unknown })?.getConfig?.("locale") ??
      DEFAULT_LOCALE;
    if (typeof configuredLocale === "string") {
      if (configuredLocale.startsWith("ja")) {
        return "ja";
      }
      return "en";
    }
    return DEFAULT_LOCALE;
  }
}
