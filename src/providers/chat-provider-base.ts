import { BaseTranslationProvider } from '../base-translation-provider';
import { TranslationResult, TranslationProvider } from '../translation-provider';
import { TranslationContext } from '../types';

export abstract class ChatProviderBase
    extends BaseTranslationProvider
    implements TranslationProvider
{
    protected abstract readonly baseUrl: string;
    protected abstract readonly providerName: string;

    protected abstract buildHeaders(): Record<string, string>;

    protected abstract buildRequestBody(
        model: string,
        prompt: string,
        sourceLang: string | undefined,
        targetLang: string,
    ): object;

    protected abstract extractTranslatedText(data: unknown): string | null;

    async translate(
        text: string,
        targetLang: string,
        sourceLang?: string,
        _context?: TranslationContext,
        abortSignal?: AbortSignal,
    ): Promise<TranslationResult> {
        this.validateInputs(text, targetLang);
        this.handleAbortError(abortSignal);

        if (!this.isConfigured()) {
            return {
                text: '',
                success: false,
                error: `${this.providerName} API key is not configured`,
            };
        }

        try {
            const prompt = `Translate the following text to ${targetLang}. ${sourceLang ? `The source language is ${sourceLang}. ` : ''}Preserve the original formatting and structure as much as possible.\n\nText to translate:\n${text}`;

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.buildHeaders(),
                },
                body: JSON.stringify(this.buildRequestBody(this.model, prompt, sourceLang, targetLang)),
                signal: abortSignal,
            });

            this.handleAbortError(abortSignal);

            if (!response.ok) {
                return this.mapHttpErrorToResult(response.status, response.statusText, await response.json().catch(() => ({})));
            }

            const data = await response.json();
            const translatedText = this.extractTranslatedText(data)?.trim() || '';

            if (!translatedText) {
                return {
                    text: '',
                    success: false,
                    error: `No translation returned from ${this.providerName}`,
                };
            }

            return {
                text: translatedText,
                success: true,
                provider: this.providerName,
                model: this.model,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return { text: '', success: false, error: 'Translation request was cancelled' };
            }
            return {
                text: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred during translation',
            };
        }
    }

    private mapHttpErrorToResult(status: number, statusText: string, errorData: Record<string, unknown>): TranslationResult {
        const errorMessage = (errorData.error as { message?: string } | undefined)?.message
            ?? `${this.providerName} API error: ${status} ${statusText}`;

        if (status === 401) {
            return { text: '', success: false, error: `Invalid ${this.providerName} API key. Please check your settings.` };
        } else if (status === 429) {
            return { text: '', success: false, error: `${this.providerName} rate limit exceeded. Please try again later.` };
        }
        return { text: '', success: false, error: errorMessage };
    }
}
