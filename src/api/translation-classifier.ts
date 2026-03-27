import { TranslationContext } from '../types';
import { ERROR_MESSAGES } from '../constants';
import { isDictionaryCandidate } from '../utils/dictionary-utils';
import { GeminiHttpClient } from './gemini-http-client';
import { buildClassificationPrompt, parseClassificationResponse } from './gemini-prompt-builder';

export class TranslationClassifier {
    private cache = new Map<string, 'dictionary' | 'translation'>();

    constructor(
        private httpClient: GeminiHttpClient,
        private getTimeoutMs: () => number,
    ) {}

    async classify(
        text: string,
        context: TranslationContext,
        abortSignal: AbortSignal,
    ): Promise<'dictionary' | 'translation'> {
        const normalizedKey = text.trim().toLowerCase();

        if (this.cache.has(normalizedKey)) {
            return this.cache.get(normalizedKey)!;
        }

        if (abortSignal.aborted) {
            throw new Error(ERROR_MESSAGES.CANCELLED);
        }

        const heuristicFallback = isDictionaryCandidate(text) ? 'dictionary' : 'translation';

        try {
            const prompt = buildClassificationPrompt(text, context);
            const responseData = await this.httpClient.sendRequest(prompt, abortSignal, {
                temperature: 0,
                maxOutputTokens: 8,
                systemInstruction:
                    'You are a classification module. Respond with only "dictionary" or "translation" to indicate the best output style for the given input.',
                timeoutMs: Math.min(this.getTimeoutMs(), 10000),
            });

            const rawResult = this.httpClient.extractText(responseData);
            const classification = parseClassificationResponse(rawResult) ?? heuristicFallback;
            this.cache.set(normalizedKey, classification);
            return classification;
        } catch (error) {
            if (this.httpClient.isAbortError(error)) {
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }
            console.debug('Gemini classification failed; falling back to heuristic.', error);
            this.cache.set(normalizedKey, heuristicFallback);
            return heuristicFallback;
        }
    }

    seedFromHistory(normalizedKey: string, classification: 'dictionary' | 'translation'): void {
        this.cache.set(normalizedKey, classification);
    }

    getCached(normalizedKey: string): 'dictionary' | 'translation' | undefined {
        return this.cache.get(normalizedKey);
    }
}
