"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PdfInlineTranslatePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/lib/logger.ts
var maskSecret = (value, visibleCount = 4) => {
  if (!value) {
    return "";
  }
  if (value.length <= visibleCount) {
    return "*".repeat(value.length);
  }
  const visibleSegment = value.slice(0, visibleCount);
  const maskedSegment = "*".repeat(value.length - visibleCount);
  return `${visibleSegment}${maskedSegment}`;
};
var ConsoleLogger = class {
  constructor(prefix = "PDFInlineTranslate") {
    this.prefix = prefix;
  }
  info(message, meta) {
    console.info(this.formatMessage("INFO", message), meta ?? {});
  }
  warn(message, meta) {
    console.warn(this.formatMessage("WARN", message), meta ?? {});
  }
  error(message, meta) {
    console.error(this.formatMessage("ERROR", message), meta ?? {});
  }
  formatMessage(level, message) {
    return `[${this.prefix}] [${level}] ${message}`;
  }
};

// src/lib/geminiClient.ts
var DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
var DEFAULT_TIMEOUT_MS = 15e3;
var DEFAULT_MAX_RETRIES = 2;
var RETRY_STATUS = /* @__PURE__ */ new Set([408, 409, 429, 500, 502, 503, 504]);
var GeminiClient = class {
  constructor(options) {
    if (!options.apiKey) {
      throw new Error("GeminiClient \u3092\u521D\u671F\u5316\u3059\u308B\u306B\u306F API \u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002");
    }
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.logger = options.logger ?? new ConsoleLogger("GeminiClient");
    this.logger.info("GeminiClient \u3092\u521D\u671F\u5316\u3057\u307E\u3057\u305F", {
      endpoint: this.endpoint,
      apiKey: maskSecret(this.apiKey)
    });
  }
  async translate(params) {
    const { text, targetLanguage, sourceLanguage } = params;
    if (!text.trim()) {
      throw new Error("\u7FFB\u8A33\u3059\u308B\u30C6\u30AD\u30B9\u30C8\u304C\u7A7A\u3067\u3059\u3002");
    }
    const prompt = this.buildPrompt(text, targetLanguage, sourceLanguage);
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    };
    let attempt = 0;
    let lastError;
    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
          if (RETRY_STATUS.has(response.status) && attempt < this.maxRetries) {
            const retryDelay = this.retryDelay(attempt);
            this.logger.warn("Gemini API \u304C\u30A8\u30E9\u30FC\u3092\u8FD4\u3057\u307E\u3057\u305F\u3002\u30EA\u30C8\u30E9\u30A4\u3057\u307E\u3059\u3002", {
              status: response.status,
              statusText: response.statusText,
              attempt,
              retryDelay
            });
            await this.delay(retryDelay);
            attempt += 1;
            continue;
          }
          const errorBody = await response.text();
          throw new Error(`Gemini API \u30A8\u30E9\u30FC: ${response.status} ${errorBody}`);
        }
        const data = await response.json();
        const translatedText = this.extractText(data);
        if (!translatedText) {
          throw new Error("Gemini API \u306E\u30EC\u30B9\u30DD\u30F3\u30B9\u304B\u3089\u7FFB\u8A33\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        }
        return {
          translatedText,
          promptTokens: data.usageMetadata?.promptTokenCount,
          candidatesCount: data.candidates?.length
        };
      } catch (error) {
        lastError = error;
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        const isRetryable = isAbort || this.isRetryableNetworkError(error);
        if (isRetryable && attempt < this.maxRetries) {
          const retryDelay = this.retryDelay(attempt);
          this.logger.warn("Gemini API \u3078\u306E\u30EA\u30AF\u30A8\u30B9\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u30EA\u30C8\u30E9\u30A4\u3057\u307E\u3059\u3002", {
            attempt,
            retryDelay,
            message: error instanceof Error ? error.message : String(error)
          });
          await this.delay(retryDelay);
          attempt += 1;
          continue;
        }
        break;
      }
    }
    throw new Error(
      `Gemini API \u3078\u306E\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u5931\u6557\u3057\u307E\u3057\u305F: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
  buildPrompt(text, targetLanguage, sourceLanguage) {
    const base = [
      `You are a professional translator with PDF context awareness.`,
      `Translate the following text into ${targetLanguage}.`,
      `Preserve technical terms, punctuation, and footnote markers.`,
      `Respond with the translated text only without extra commentary.`
    ];
    if (sourceLanguage) {
      base.splice(2, 0, `Source language is ${sourceLanguage}.`);
    } else {
      base.splice(2, 0, "Detect the source language automatically.");
    }
    return `${base.join(" ")}

"""${text}"""`;
  }
  extractText(response) {
    const firstCandidate = response.candidates?.[0];
    const parts = firstCandidate?.content?.parts ?? [];
    const firstTextPart = parts.find((part) => "text" in part);
    if (firstTextPart && "text" in firstTextPart && firstTextPart.text) {
      return firstTextPart.text.trim();
    }
    return void 0;
  }
  retryDelay(attempt) {
    const baseDelay = 500;
    return baseDelay * Math.pow(2, attempt);
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  isRetryableNetworkError(error) {
    if (error instanceof Error) {
      return ["ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(error.code ?? "");
    }
    return false;
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  apiKey: "",
  targetLanguage: "ja",
  sourceLanguage: null,
  timeoutMs: 15e3,
  maxRetries: 2
};

// src/ui/settingsTab.ts
var import_obsidian = require("obsidian");

// src/locales/ja.json
var ja_default = {
  "notice.missingApiKey": "Gemini API \u30AD\u30FC\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "notice.noSelection": "PDF \u5185\u3067\u30C6\u30AD\u30B9\u30C8\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "notice.translating": "Gemini \u3067\u7FFB\u8A33\u4E2D...",
  "notice.translationFailed": "\u7FFB\u8A33\u306B\u5931\u6557\u3057\u307E\u3057\u305F: {{message}}",
  "command.translateSelection": "\u9078\u629E\u3057\u305F PDF \u30C6\u30AD\u30B9\u30C8\u3092\u7FFB\u8A33",
  "context.translateSelection": "\u9078\u629E\u7BC4\u56F2\u3092\u7FFB\u8A33 (Gemini)",
  "modal.originalTitle": "\u539F\u6587",
  "modal.translatedTitle": "\u7FFB\u8A33",
  "modal.copyButton": "\u7FFB\u8A33\u6587\u3092\u30B3\u30D4\u30FC",
  "modal.copyDone": "\u7FFB\u8A33\u6587\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002",
  "modal.title": "\u7FFB\u8A33\u7D50\u679C",
  "modal.closeTooltip": "\u9589\u3058\u308B",
  "settings.title": "PDF Inline Translate \u8A2D\u5B9A",
  "settings.apiKey.name": "Gemini API \u30AD\u30FC",
  "settings.apiKey.desc": "Google AI Studio \u3067\u767A\u884C\u3057\u305F Gemini API \u30AD\u30FC\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "settings.targetLang.name": "\u7FFB\u8A33\u5148\u8A00\u8A9E",
  "settings.targetLang.desc": "\u7FFB\u8A33\u7D50\u679C\u3092\u8868\u793A\u3059\u308B\u8A00\u8A9E\u30B3\u30FC\u30C9\uFF08\u4F8B: ja, en, fr\uFF09\u3002",
  "settings.sourceLang.name": "\u7FFB\u8A33\u5143\u8A00\u8A9E\uFF08\u4EFB\u610F\uFF09",
  "settings.sourceLang.desc": "\u56FA\u5B9A\u3057\u305F\u3044\u5834\u5408\u306F\u8A00\u8A9E\u30B3\u30FC\u30C9\u3092\u5165\u529B\u3057\u3001\u7A7A\u6B04\u306E\u5834\u5408\u306F\u81EA\u52D5\u691C\u51FA\u3057\u307E\u3059\u3002",
  "settings.timeout.name": "API \u30BF\u30A4\u30E0\u30A2\u30A6\u30C8",
  "settings.timeout.desc": "Gemini API \u547C\u3073\u51FA\u3057\u306E\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u5024\uFF08\u30DF\u30EA\u79D2\uFF09\u3002",
  "settings.retries.name": "\u6700\u5927\u30EA\u30C8\u30E9\u30A4\u56DE\u6570",
  "settings.retries.desc": "429 \u3084 500 \u7CFB\u30A8\u30E9\u30FC\u767A\u751F\u6642\u306E\u518D\u8A66\u884C\u56DE\u6570\u3002",
  "logger.loaded": "PDF Inline Translate \u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u3002",
  "logger.unloaded": "PDF Inline Translate \u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u30A2\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F\u3002"
};

// src/locales/en.json
var en_default = {
  "notice.missingApiKey": "Please configure your Gemini API key.",
  "notice.noSelection": "Select text inside the PDF viewer before translating.",
  "notice.translating": "Translating with Gemini...",
  "notice.translationFailed": "Translation failed: {{message}}",
  "command.translateSelection": "Translate selected PDF text",
  "context.translateSelection": "Translate selection (Gemini)",
  "modal.originalTitle": "Original",
  "modal.translatedTitle": "Translation",
  "modal.copyButton": "Copy translation",
  "modal.copyDone": "Copied translation to clipboard.",
  "modal.title": "Translation result",
  "modal.closeTooltip": "Close",
  "settings.title": "PDF Inline Translate Settings",
  "settings.apiKey.name": "Gemini API key",
  "settings.apiKey.desc": "Enter the Gemini API key issued from Google AI Studio.",
  "settings.targetLang.name": "Target language",
  "settings.targetLang.desc": "Language code for translation output (e.g. ja, en, fr).",
  "settings.sourceLang.name": "Source language (optional)",
  "settings.sourceLang.desc": "Specify a fixed source language, or leave empty to auto detect.",
  "settings.timeout.name": "API timeout",
  "settings.timeout.desc": "Timeout in milliseconds for Gemini API requests.",
  "settings.retries.name": "Max retries",
  "settings.retries.desc": "Number of retries when receiving 429/500 responses.",
  "logger.loaded": "Loaded PDF Inline Translate plugin.",
  "logger.unloaded": "Unloaded PDF Inline Translate plugin."
};

// src/locales/index.ts
var dictionaries = {
  ja: ja_default,
  en: en_default
};
var DEFAULT_LOCALE = "ja";
var translate = (key, locale = DEFAULT_LOCALE, replacements) => {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallbackDictionary = dictionaries[DEFAULT_LOCALE];
  const template = dictionary[key] ?? fallbackDictionary[key];
  if (!template) {
    return key;
  }
  if (!replacements) {
    return template;
  }
  return Object.entries(replacements).reduce(
    (acc, [replacementKey, value]) => acc.replaceAll(`{{${replacementKey}}}`, value ?? ""),
    template
  );
};

// src/ui/settingsTab.ts
var TranslatableSettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.host = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const locale = this.host.getLocale();
    containerEl.createEl("h2", { text: translate("settings.title", locale) });
    new import_obsidian.Setting(containerEl).setName(translate("settings.apiKey.name", locale)).setDesc(translate("settings.apiKey.desc", locale)).addText(
      (text) => text.setPlaceholder("AIza...").setValue(this.host.settings.apiKey).onChange(async (value) => {
        this.host.settings.apiKey = value.trim();
        await this.host.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(translate("settings.targetLang.name", locale)).setDesc(translate("settings.targetLang.desc", locale)).addText(
      (text) => text.setPlaceholder("ja").setValue(this.host.settings.targetLanguage).onChange(async (value) => {
        this.host.settings.targetLanguage = value.trim() || "ja";
        await this.host.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(translate("settings.sourceLang.name", locale)).setDesc(translate("settings.sourceLang.desc", locale)).addText(
      (text) => text.setPlaceholder("auto detect").setValue(this.host.settings.sourceLanguage ?? "").onChange(async (value) => {
        this.host.settings.sourceLanguage = value.trim() || null;
        await this.host.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(translate("settings.timeout.name", locale)).setDesc(translate("settings.timeout.desc", locale)).addSlider(
      (slider) => slider.setLimits(5e3, 6e4, 1e3).setValue(this.host.settings.timeoutMs).setDynamicTooltip().onChange(async (value) => {
        this.host.settings.timeoutMs = value;
        await this.host.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName(translate("settings.retries.name", locale)).setDesc(translate("settings.retries.desc", locale)).addSlider(
      (slider) => slider.setLimits(0, 5, 1).setValue(this.host.settings.maxRetries).setDynamicTooltip().onChange(async (value) => {
        this.host.settings.maxRetries = value;
        await this.host.saveSettings();
      })
    );
  }
};

// src/ui/translationModal.ts
var import_obsidian2 = require("obsidian");
var TranslatableResultModal = class extends import_obsidian2.Modal {
  constructor(app, props) {
    super(app);
    this.props = props;
  }
  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.textContent = `${translate("modal.title", this.props.locale)} (${this.props.targetLanguage})`;
    const originalSection = contentEl.createDiv({ cls: "pdf-inline-translate-section" });
    originalSection.createEl("h3", { text: translate("modal.originalTitle", this.props.locale) });
    originalSection.createEl("p", { text: this.props.originalText });
    const translatedSection = contentEl.createDiv({ cls: "pdf-inline-translate-section" });
    translatedSection.createEl("h3", { text: translate("modal.translatedTitle", this.props.locale) });
    translatedSection.createEl("p", { text: this.props.translatedText });
    new import_obsidian2.Setting(contentEl).addButton(
      (button) => button.setButtonText(translate("modal.copyButton", this.props.locale)).onClick(async () => {
        await navigator.clipboard.writeText(this.props.translatedText);
        new import_obsidian2.Notice(translate("modal.copyDone", this.props.locale));
      })
    ).addExtraButton(
      (button) => button.setIcon("checkmark").setTooltip(translate("modal.closeTooltip", this.props.locale)).onClick(() => this.close())
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var PdfInlineTranslatePlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.geminiClient = null;
    this.logger = new ConsoleLogger("PdfInlineTranslate");
    this.locale = DEFAULT_LOCALE;
  }
  async onload() {
    await this.loadSettings();
    this.locale = this.resolveLocale();
    this.addSettingTab(new TranslatableSettingsTab(this.app, this));
    this.registerCommands();
    this.registerContextMenu();
    this.logger.info(translate("logger.loaded", this.locale));
  }
  onunload() {
    this.logger.info(translate("logger.unloaded", this.locale));
  }
  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), stored);
    this.invalidateClient();
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.invalidateClient();
  }
  registerCommands() {
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
  registerContextMenu() {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu) => {
        const leaf = this.getActivePdfLeaf();
        if (!leaf || !this.hasValidPdfSelection()) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(translate("context.translateSelection", this.locale)).setIcon("languages").onClick(() => {
            void this.translateSelection();
          });
        });
      })
    );
  }
  async translateSelection() {
    if (!this.settings.apiKey) {
      new import_obsidian3.Notice(translate("notice.missingApiKey", this.locale));
      return;
    }
    const selectedText = this.getSelectedText();
    if (!selectedText) {
      new import_obsidian3.Notice(translate("notice.noSelection", this.locale));
      return;
    }
    const notice = new import_obsidian3.Notice(translate("notice.translating", this.locale), 0);
    try {
      const client = this.ensureClient();
      const result = await client.translate({
        text: selectedText,
        targetLanguage: this.settings.targetLanguage,
        sourceLanguage: this.settings.sourceLanguage ?? void 0
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
      this.logger.error("\u7FFB\u8A33\u306B\u5931\u6557\u3057\u307E\u3057\u305F", { message });
      new import_obsidian3.Notice(translate("notice.translationFailed", this.locale, { message }));
    }
  }
  ensureClient() {
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
  invalidateClient() {
    this.geminiClient = null;
  }
  getActivePdfLeaf() {
    const active = this.app.workspace.getActiveLeaf();
    if (active?.view?.getViewType() === "pdf") {
      return active;
    }
    return null;
  }
  getSelectedText() {
    const leaf = this.getActivePdfLeaf();
    if (!leaf) {
      return null;
    }
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    return text.trim() || null;
  }
  hasValidPdfSelection() {
    return Boolean(this.getSelectedText());
  }
  getLocale() {
    return this.locale;
  }
  resolveLocale() {
    const configuredLocale = this.app.vault?.getConfig?.("locale") ?? DEFAULT_LOCALE;
    if (typeof configuredLocale === "string") {
      if (configuredLocale.startsWith("ja")) {
        return "ja";
      }
      return "en";
    }
    return DEFAULT_LOCALE;
  }
};
//# sourceMappingURL=main.js.map
