export interface PluginSettings {
  apiKey: string;
  targetLanguage: string;
  sourceLanguage: string | null;
  timeoutMs: number;
  maxRetries: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: "",
  targetLanguage: "ja",
  sourceLanguage: null,
  timeoutMs: 15000,
  maxRetries: 2
};
