export interface PdfInlineTranslatePluginSettings {
  apiKey: string;
  model: string;
  targetLanguage: string;
  maxOutputTokens: number;
  popupBackgroundColorAlpha: number;
  // Add more configuration options
  enableAutoTranslate: boolean;
  systemInstruction?: string;
  translationPromptTemplate?: string;
  dictionaryPromptTemplate?: string;
  temperature?: number;
  autoInsertToNote?: boolean;
  insertionTemplate?: string;
  timeoutMs?: number;
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

export type TranslationStateType = 'loading' | 'result' | 'error' | 'cancelled' | 'pending';

export interface TranslationState {
  type: TranslationStateType;
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

// New types for better API response handling
export interface GeminiApiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    blockReason: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  };
}

export interface DictionaryApiResponse {
  word: string;
  phonetic?: string;
  phonetics?: Array<{
    text?: string;
    audio?: string;
    sourceUrl?: string;
    license?: {
      name: string;
      url: string;
    };
  }>;
  meanings?: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
      synonyms: string[];
      antonyms: string[];
    }>;
    synonyms: string[];
    antonyms: string[];
  }>;
  license?: {
    name: string;
    url: string;
  };
  sourceUrls: string[];
}

// Popup positioning interface
export interface PopupPosition {
  top: number;
  left: number;
}

// UI State interface
export interface PopupState {
  expanded: boolean;
  lastPosition: PopupPosition | null;
  originalText: string;
  translationText: string;
  isOriginalVisible: boolean;
}
