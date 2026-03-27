import { BaseTranslationProvider } from '../base-translation-provider';
import { TranslationResult, TranslationProvider } from '../translation-provider';
import { TranslationContext } from '../types';

export class OpenAITranslationProvider
    extends BaseTranslationProvider
    implements TranslationProvider
{
    private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';

    async translate(
        text: string,
        targetLang: string,
        sourceLang?: string,
        context?: TranslationContext,
        abortSignal?: AbortSignal,
    ): Promise<TranslationResult> {
        this.validateInputs(text, targetLang);
        this.handleAbortError(abortSignal);

        if (!this.isConfigured()) {
            return {
                text: '',
                success: false,
                error: 'OpenAI API key is not configured',
            };
        }

        try {
            // Construct the prompt for translation
            const prompt = `Translate the following text to ${targetLang}. ${sourceLang ? `The source language is ${sourceLang}. ` : ''}Preserve the original formatting and structure as much as possible.\n\nText to translate:\n${text}`;

            const requestBody = {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content:
                            "You are a professional translator. Translate the user's text accurately while preserving formatting.",
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.3, // Lower temperature for more consistent translations
            };

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: abortSignal,
            });

            this.handleAbortError(abortSignal);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage =
                    errorData.error?.message ||
                    `OpenAI API error: ${response.status} ${response.statusText}`;

                // Handle specific error cases
                if (response.status === 401) {
                    return {
                        text: '',
                        success: false,
                        error: 'Invalid OpenAI API key. Please check your settings.',
                    };
                } else if (response.status === 429) {
                    return {
                        text: '',
                        success: false,
                        error: 'OpenAI rate limit exceeded. Please try again later.',
                    };
                } else {
                    return {
                        text: '',
                        success: false,
                        error: errorMessage,
                    };
                }
            }

            const data = await response.json();

            if (!data.choices || data.choices.length === 0) {
                return {
                    text: '',
                    success: false,
                    error: 'No translation returned from OpenAI',
                };
            }

            const translatedText = data.choices[0].message?.content?.trim() || '';

            if (!translatedText) {
                return {
                    text: '',
                    success: false,
                    error: 'Empty translation returned from OpenAI',
                };
            }

            return {
                text: translatedText,
                success: true,
                provider: 'OpenAI',
                model: this.model,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return {
                    text: '',
                    success: false,
                    error: 'Translation request was cancelled',
                };
            }

            const message =
                error instanceof Error
                    ? error.message
                    : 'Unknown error occurred during translation';

            return {
                text: '',
                success: false,
                error: message,
            };
        }
    }

    getName(): string {
        return 'OpenAI';
    }
}
