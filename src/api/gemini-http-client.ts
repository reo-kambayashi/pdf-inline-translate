import { GeminiApiResponse, PdfInlineTranslatePluginSettings } from '../types';
import { ERROR_MESSAGES, GEMINI_API_BASE } from '../constants';

export interface GeminiRequestOptions {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
    timeoutMs?: number;
}

export class GeminiHttpClient {
    constructor(private settings: PdfInlineTranslatePluginSettings) {}

    async sendRequest(
        prompt: string,
        abortSignal: AbortSignal,
        options?: GeminiRequestOptions,
    ): Promise<GeminiApiResponse> {
        const timeoutMs = options?.timeoutMs ?? this.settings.timeoutMs ?? 30000;
        const timeoutAbortController = new AbortController();
        const timeoutId = setTimeout(() => timeoutAbortController.abort(), timeoutMs);

        try {
            const requestBody = this.createRequestPayload(prompt, options);
            const encodedModel = encodeURIComponent(this.settings.model);
            const url = `${GEMINI_API_BASE}/${encodedModel}:generateContent`;
            const combinedSignal = this.combineAbortSignals(abortSignal, timeoutAbortController.signal);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': String(this.settings.apiKey),
                },
                body: JSON.stringify(requestBody),
                signal: combinedSignal,
            });

            if (abortSignal.aborted || timeoutAbortController.signal.aborted) {
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }

            if (!response.ok) {
                const errorDetail = await this.getApiErrorDetail(response);
                const errorMessage = `Gemini API error: ${errorDetail}`;
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    throw new Error(`${errorMessage} - Please check your API key and quota.`);
                } else if (response.status === 429) {
                    throw new Error(`${errorMessage} - Rate limit exceeded. Please try again later.`);
                }
                throw new Error(errorMessage);
            }

            return await this.parseResponse(response);
        } finally {
            clearTimeout(timeoutId);
            if (!timeoutAbortController.signal.aborted) {
                timeoutAbortController.abort();
            }
        }
    }

    async streamRequest(
        prompt: string,
        abortSignal: AbortSignal,
        onChunk: (text: string) => void,
        options?: GeminiRequestOptions,
    ): Promise<string> {
        const timeoutMs = options?.timeoutMs ?? this.settings.timeoutMs ?? 30000;
        const timeoutAbortController = new AbortController();
        const timeoutId = setTimeout(() => timeoutAbortController.abort(), timeoutMs);

        try {
            const requestBody = this.createRequestPayload(prompt, options);
            const encodedModel = encodeURIComponent(this.settings.model);
            const url = `${GEMINI_API_BASE}/${encodedModel}:streamGenerateContent?alt=sse`;
            const combinedSignal = this.combineAbortSignals(abortSignal, timeoutAbortController.signal);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': String(this.settings.apiKey),
                },
                body: JSON.stringify(requestBody),
                signal: combinedSignal,
            });

            if (!response.ok) {
                const errorDetail = await this.getApiErrorDetail(response);
                const errorMessage = `Gemini API error: ${errorDetail}`;
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    throw new Error(`${errorMessage} - Please check your API key and quota.`);
                } else if (response.status === 429) {
                    throw new Error(`${errorMessage} - Rate limit exceeded. Please try again later.`);
                }
                throw new Error(errorMessage);
            }

            if (!response.body) {
                throw new Error(ERROR_MESSAGES.RESPONSE_PARSE_FAILED);
            }

            if (abortSignal.aborted || timeoutAbortController.signal.aborted) {
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulated = '';

            try {
                while (true) {
                    if (abortSignal.aborted || timeoutAbortController.signal.aborted) {
                        reader.cancel();
                        throw new Error(ERROR_MESSAGES.CANCELLED);
                    }

                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        let data: GeminiApiResponse;
                        try {
                            data = JSON.parse(jsonStr) as GeminiApiResponse;
                        } catch {
                            // malformed SSE chunk — skip
                            continue;
                        }
                        const parts = data?.candidates?.[0]?.content?.parts;
                        if (!Array.isArray(parts)) continue;
                        for (const part of parts) {
                            if (typeof part?.text === 'string' && part.text) {
                                accumulated += part.text;
                                onChunk(part.text);
                            }
                        }
                    }
                }
            } finally {
                reader.cancel();
            }

            return accumulated;
        } finally {
            clearTimeout(timeoutId);
            if (!timeoutAbortController.signal.aborted) {
                timeoutAbortController.abort();
            }
        }
    }

    extractText(responseData: GeminiApiResponse): string {
        const candidates = responseData?.candidates;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
        }

        const firstCandidate = candidates[0];
        if (!firstCandidate || typeof firstCandidate !== 'object') {
            throw new Error('Geminiの応答形式が不正です。');
        }

        const content = firstCandidate?.content;
        if (!content || typeof content !== 'object') {
            throw new Error('Geminiの翻訳コンテンツがありません。');
        }

        const parts: Array<{ text?: string }> = Array.isArray(content?.parts) ? content.parts : [];
        const safeParts = parts.filter(
            (part) => part && typeof part === 'object' && typeof part.text === 'string',
        );
        const assembledText = safeParts
            .map((part) => part?.text?.trim())
            .filter((value): value is string => Boolean(value))
            .join('\n\n')
            .trim();
        const fallbackText = safeParts.length > 0 && safeParts[0]?.text ? safeParts[0].text.trim() : '';
        return assembledText && assembledText.length > 0 ? assembledText : fallbackText;
    }

    isAbortError(error: unknown): boolean {
        if (!error) return false;
        if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
            return error.name === 'AbortError';
        }
        if (error instanceof Error) {
            return (
                error.name === 'AbortError' ||
                error.message.toLowerCase().includes('cancelled') ||
                error.message === ERROR_MESSAGES.CANCELLED
            );
        }
        return false;
    }

    private createRequestPayload(prompt: string, options?: GeminiRequestOptions) {
        const temperature = options?.temperature ?? (this.settings.temperature ?? 0.7);
        const maxTokensSource = options?.maxOutputTokens ?? this.settings.maxOutputTokens ?? 1024;

        return {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: Number(maxTokensSource) || 1024,
            },
            systemInstruction: {
                role: 'system',
                parts: [{ text: options?.systemInstruction ?? this.settings.systemInstruction ?? '' }],
            },
        };
    }

    private combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
        const combinedController = new AbortController();
        for (const signal of signals) {
            if (signal.aborted) {
                combinedController.abort();
                break;
            }
            signal.addEventListener('abort', () => combinedController.abort(), { once: true });
        }
        return combinedController.signal;
    }

    private async parseResponse(response: Response): Promise<GeminiApiResponse> {
        let responseData: GeminiApiResponse;
        try {
            responseData = await response.json();
        } catch (parseError) {
            console.error('PDF Inline Translate: レスポンスのJSON解析に失敗しました', parseError);
            throw new Error(ERROR_MESSAGES.RESPONSE_PARSE_FAILED);
        }
        if (!responseData || typeof responseData !== 'object') {
            throw new Error(ERROR_MESSAGES.INVALID_RESPONSE_FORMAT);
        }
        return responseData;
    }

    private async getApiErrorDetail(response: Response): Promise<string> {
        let detail = `HTTP ${response.status}`;
        try {
            const errorPayload = await response.json();
            detail = errorPayload?.error?.message || detail;
        } catch (parseError) {
            console.error('エラーレスポンス解析失敗', parseError);
        }
        return detail;
    }
}
