export type GeminiModelId =
    | 'gemini-2.5-flash-lite'
    | 'gemini-2.5-flash'
    | 'gemini-2.5-pro';

export interface PdfInlineTranslatePluginSettings {
    apiKey: string;
    model: GeminiModelId;
    targetLanguage: string;
    maxOutputTokens: number;
    popupBackgroundColorAlpha: number;
    // Add more configuration options
    enableAutoTranslate: boolean;
    temperature?: number;
    autoInsertToNote?: boolean;
    insertionTemplate?: string;
    timeoutMs?: number;
    // Translation history options
    enableTranslationHistory: boolean;
    maxHistoryItems: number;
    // UI customization options
    popupWidth: number;
    popupHeight: number;
    popupPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'custom';
    popupTheme: 'system' | 'default' | 'dark' | 'light' | 'blue' | 'green';
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
        content?: {
            parts?: Array<{ text?: string }>;
            role?: string;
        };
        finishReason?: string;
        index?: number;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    promptFeedback?: {
        blockReason?: string;
        blockReasonMessage?: string;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    };
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
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
