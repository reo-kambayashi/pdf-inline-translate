import { PdfInlineTranslatePluginSettings, TranslationContext } from '../types';
import { ERROR_MESSAGES } from '../constants';
import { TranslationHistoryManager } from '../translation-history-manager';
import { GeminiHttpClient } from './gemini-http-client';
import { buildTranslationPrompt } from './gemini-prompt-builder';
import { isDictionaryCandidate } from '../utils/dictionary-utils';

export class GeminiClient {
    private httpClient: GeminiHttpClient;

    constructor(
        private settings: PdfInlineTranslatePluginSettings,
        private historyManager?: TranslationHistoryManager,
    ) {
        this.httpClient = new GeminiHttpClient(settings);
    }

    async requestTranslation(
        text: string,
        context: TranslationContext,
        abortSignal: AbortSignal,
        onChunk?: (text: string) => void,
    ): Promise<string> {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.EMPTY_TEXT);
        }
        if (abortSignal.aborted) throw new Error(ERROR_MESSAGES.CANCELLED);
        if (!this.settings.apiKey) throw new Error(ERROR_MESSAGES.NO_API_KEY);
        if (!this.settings.model) throw new Error(ERROR_MESSAGES.NO_MODEL);

        if (this.historyManager) {
            const cachedResult = this.historyManager.findCachedTranslation(
                text,
                this.settings.targetLanguage,
            );
            if (cachedResult) {
                return cachedResult.translation;
            }
        }

        const classification: 'dictionary' | 'translation' = isDictionaryCandidate(text) ? 'dictionary' : 'translation';

        const timeoutMs = this.settings.timeoutMs || 30000;
        let finalTranslation: string | null = null;

        try {
            const prompt = buildTranslationPrompt(text, context, classification, this.settings);
            if (!prompt || typeof prompt !== 'string') {
                throw new Error(ERROR_MESSAGES.PROMPT_FAILED);
            }

            let translation: string;
            if (onChunk) {
                translation = await this.httpClient.streamRequest(prompt, abortSignal, onChunk, { timeoutMs });
            } else {
                const responseData = await this.httpClient.sendRequest(prompt, abortSignal, { timeoutMs });
                translation = this.httpClient.extractText(responseData);
            }

            if (!translation || translation.length === 0) {
                throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
            }

            finalTranslation = translation;
        } catch (error) {
            if (this.httpClient.isAbortError(error)) {
                console.debug('Translation request was cancelled');
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }
            if (error instanceof Error) throw error;
            throw new Error(String(error));
        }

        if (!finalTranslation || finalTranslation.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
        }

        if (this.historyManager) {
            this.historyManager.addToHistory(
                text,
                finalTranslation,
                this.settings.targetLanguage,
                undefined,
                this.settings.model,
                classification === 'dictionary',
            );
        }

        return finalTranslation;
    }
}
