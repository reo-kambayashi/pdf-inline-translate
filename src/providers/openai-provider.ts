import { ChatProviderBase } from './chat-provider-base';

export class OpenAITranslationProvider extends ChatProviderBase {
    protected readonly baseUrl = 'https://api.openai.com/v1/chat/completions';
    protected readonly providerName = 'OpenAI';

    protected buildHeaders(): Record<string, string> {
        return { Authorization: `Bearer ${this.apiKey}` };
    }

    protected buildRequestBody(model: string, prompt: string, _sourceLang: string | undefined, _targetLang: string): object {
        return {
            model,
            messages: [
                { role: 'system', content: "You are a professional translator. Translate the user's text accurately while preserving formatting." },
                { role: 'user', content: prompt },
            ],
            temperature: 0.3,
        };
    }

    protected extractTranslatedText(data: unknown): string | null {
        const d = data as { choices?: { message?: { content?: string } }[] };
        return d.choices?.[0]?.message?.content ?? null;
    }

    getName(): string {
        return 'OpenAI';
    }
}
