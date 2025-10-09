export interface PdfInlineTranslatePluginSettings {
  apiKey: string;
  model: string;
  targetLanguage: string;
  temperature: number;
  maxOutputTokens: number;
  systemInstruction: string;
  promptTemplate: string;
  timeoutMs: number;
  popupBackgroundColorAlpha: number;
}
