import { TranslationProvider, TranslationResult } from './translation-provider';
import { TranslationContext } from './types';

export abstract class BaseTranslationProvider implements TranslationProvider {
    constructor(
        protected apiKey: string,
        protected model: string,
    ) {}

    abstract translate(
        text: string,
        targetLang: string,
        sourceLang?: string,
        context?: TranslationContext,
        abortSignal?: AbortSignal,
    ): Promise<TranslationResult>;

    isConfigured(): boolean {
        return Boolean(this.apiKey.length > 0 && this.model.length > 0);
    }

    getName(): string {
        return this.constructor.name;
    }

    getModel(): string {
        return this.model;
    }

    protected validateInputs(text: string, targetLang: string): void {
        if (!text || text.trim().length === 0) {
            throw new Error('Text to translate is empty');
        }

        if (!targetLang || targetLang.trim().length === 0) {
            throw new Error('Target language is not specified');
        }
    }

    protected handleAbortError(abortSignal?: AbortSignal): void {
        if (abortSignal?.aborted) {
            throw new Error('Translation request was cancelled');
        }
    }
}
