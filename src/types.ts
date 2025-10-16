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
    // Translation history options
    enableTranslationHistory: boolean;
    maxHistoryItems: number;
    // Multi-provider options
    translationProvider: 'gemini' | 'openai' | 'anthropic';
    openAIApiKey?: string;
    openAIModel?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
    // UI customization options
    popupWidth: number;
    popupHeight: number;
    popupPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'custom';
    popupTheme: 'default' | 'dark' | 'light' | 'blue' | 'green';
    fontSize: 'small' | 'medium' | 'large';
    showOriginalText: boolean;
    autoExpandPopup: boolean;
    // Language detection options
    enableLanguageDetection: boolean;
    sourceLanguage: string; // Default source language when detection is disabled
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

// Translation history interface
export interface TranslationHistoryItem {
    id: string;
    original: string;
    translation: string;
    sourceLanguage?: string;
    targetLanguage: string;
    timestamp: number;
    modelUsed: string;
    isDictionary: boolean;
}

export interface TranslationHistory {
    items: TranslationHistoryItem[];
}
