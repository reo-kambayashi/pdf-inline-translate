export interface PdfInlineTranslatePluginSettings {
  apiKey: string;
  model: string;
  targetLanguage: string;
  maxOutputTokens: number;
  popupBackgroundColorAlpha: number;
}

export interface TranslationContext {
  pageNumber?: number;
  rect?: DOMRect | PlainRect;
  selection?: string;
  [key: string]: any;
}

export interface PlainRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
  x: number;
  y: number;
  toJSON?: () => void;
}

export interface TranslationState {
  type: 'loading' | 'result' | 'error' | 'cancelled' | 'pending';
  original: string;
  context: TranslationContext;
  translation?: string;
  message?: string;
}

export interface GeminiTranslationResult {
  text: string;
  status: 'success' | 'error' | 'cancelled';
  error?: string;
}
