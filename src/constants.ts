import { PdfInlineTranslatePluginSettings } from "./types";

export const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_SETTINGS: PdfInlineTranslatePluginSettings = {
	apiKey: "",
	model: "gemini-2.5-flash-lite",
	targetLanguage: "日本語",
	temperature: 0.1,
	maxOutputTokens: 1024,
	systemInstruction:
		"あなたは学術論文翻訳の専門家です。原文の論旨と語気を保ちつつ、自然で読みやすい日本語へ翻訳してください。用語の補足説明や注釈は追加しないでください。",
	promptTemplate:
		"以下の原文は学術論文からの抜粋です。構造と意味を忠実に保ちつつ{{targetLanguage}}へ翻訳してください。語調は論文調を意識し、補足説明や注釈、要約は一切追加しないでください。翻訳結果のみを出力してください。\n\n--- 原文 ---\n{{text}}\n",
	popupBackgroundColorAlpha: 0.8,
};

export const AUTO_TRANSLATE_DEBOUNCE_MS = 350;
export const AUTO_TRANSLATE_REPEAT_THRESHOLD_MS = 1500;
