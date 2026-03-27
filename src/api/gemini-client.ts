import { PdfInlineTranslatePluginSettings, TranslationContext } from '../types';
import { ERROR_MESSAGES } from '../constants';
import { TranslationHistoryManager } from '../translation-history-manager';
import { GeminiHttpClient } from './gemini-http-client';
import { TranslationClassifier } from './translation-classifier';
import { buildTranslationPrompt } from './gemini-prompt-builder';

export class GeminiClient {
    private httpClient: GeminiHttpClient;
    private classifier: TranslationClassifier;

    constructor(
        private settings: PdfInlineTranslatePluginSettings,
        private historyManager?: TranslationHistoryManager,
    ) {
        this.httpClient = new GeminiHttpClient(settings);
        this.classifier = new TranslationClassifier();
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

        const normalizedKey = text.trim().toLowerCase();

        if (this.historyManager) {
            const cachedResult = this.historyManager.findCachedTranslation(
                text,
                this.settings.targetLanguage,
            );
            if (cachedResult) {
                const cachedClassification = cachedResult.isDictionary ? 'dictionary' : 'translation';
                this.classifier.seedFromHistory(normalizedKey, cachedClassification);
                return cachedResult.translation;
            }
        }

        const classification = this.classifier.getCached(normalizedKey)
            ?? await this.classifier.classify(text, context, abortSignal);

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

        this.classifier.seedFromHistory(normalizedKey, classification);

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
