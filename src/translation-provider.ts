import { TranslationContext } from './types';

export interface TranslationResult {
    text: string;
    success: boolean;
    error?: string;
    provider?: string;
    model?: string;
}

export interface TranslationProvider {
    /**
     * Translate text using this provider
     * @param text The text to translate
     * @param targetLang The target language
     * @param sourceLang The source language (optional, will be auto-detected if not provided)
     * @param context Additional context information
     * @param abortSignal Signal to abort the request
     */
    translate(
        text: string,
        targetLang: string,
        sourceLang?: string,
        context?: TranslationContext,
        abortSignal?: AbortSignal,
    ): Promise<TranslationResult>;

    /**
     * Check if the provider is properly configured
     */
    isConfigured(): boolean;

    /**
     * Get the name of the provider
     */
    getName(): string;

    /**
     * Get the current model being used
     */
    getModel(): string;
}
