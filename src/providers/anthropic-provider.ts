import { ChatProviderBase } from './chat-provider-base';

export class AnthropicTranslationProvider extends ChatProviderBase {
    protected readonly baseUrl = 'https://api.anthropic.com/v1/messages';
    protected readonly providerName = 'Anthropic';

    protected buildHeaders(): Record<string, string> {
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
        };
    }

    protected buildRequestBody(model: string, prompt: string, _sourceLang: string | undefined, _targetLang: string): object {
        return {
            model,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        };
    }

    protected extractTranslatedText(data: unknown): string | null {
        const d = data as { content?: { text?: string }[] };
        return d.content?.[0]?.text ?? null;
    }

    getName(): string {
        return 'Anthropic';
    }
}
