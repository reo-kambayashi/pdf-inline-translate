import { PdfInlineTranslatePluginSettings } from "./types";

export const DEFAULT_SETTINGS: PdfInlineTranslatePluginSettings = {
	apiKey: "",
	model: "gemini-2.5-flash-lite",
	targetLanguage: "日本語",
	temperature: 0.1,
	maxOutputTokens: 1024,
	popupBackgroundColorAlpha: 0.9,
};

export const AUTO_TRANSLATE_DEBOUNCE_MS = 350;
export const AUTO_TRANSLATE_REPEAT_THRESHOLD_MS = 1500;