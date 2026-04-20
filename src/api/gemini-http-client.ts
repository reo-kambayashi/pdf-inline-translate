import { GeminiApiResponse, GeminiModelId, PdfInlineTranslatePluginSettings } from '../types';
import {
    DEFAULT_GEMINI_MODEL,
    ERROR_MESSAGES,
    GEMINI_API_BASE,
    GEMINI_MODELS,
    SYSTEM_INSTRUCTION,
} from '../constants';

export interface GeminiRequestOptions {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
    timeoutMs?: number;
    /** Override model (defaults to settings.model). */
    model?: GeminiModelId;
    /**
     * Override thinkingBudget. -1 enables dynamic thinking on Pro/Flash.
     * 0 disables thinking entirely. Ignored on models without thinking support.
     */
    thinkingBudget?: number;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

export interface ExtractTextResult {
    text: string;
    finishReason?: string;
    blockReason?: string;
}

export class GeminiHttpClient {
    constructor(private settings: PdfInlineTranslatePluginSettings) {}

    private getModel(options?: GeminiRequestOptions): GeminiModelId {
        return options?.model ?? this.settings.model ?? DEFAULT_GEMINI_MODEL;
    }

    private buildUrl(model: GeminiModelId, action: 'generateContent' | 'streamGenerateContent'): string {
        const encodedModel = encodeURIComponent(model);
        const suffix = action === 'streamGenerateContent' ? `${action}?alt=sse` : action;
        return `${GEMINI_API_BASE}/${encodedModel}:${suffix}`;
    }

    private async throwForStatus(response: Response): Promise<never> {
        const errorDetail = await this.getApiErrorDetail(response);
        const errorMessage = `Gemini API error: ${errorDetail}`;
        if (response.status === 400 || response.status === 401 || response.status === 403) {
            throw new Error(`${errorMessage} - Please check your API key and quota.`);
        } else if (response.status === 429) {
            throw new Error(`${errorMessage} - Rate limit exceeded. Please try again later.`);
        }
        throw new Error(errorMessage);
    }

    /** Exponential backoff with full jitter (AWS-style) to avoid retry storms. */
    private computeRetryDelay(attempt: number): number {
        const cap = BASE_RETRY_DELAY_MS * 2 ** attempt;
        return Math.floor(Math.random() * cap);
    }

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
            const url = this.buildUrl(this.getModel(options), 'generateContent');
            const combinedSignal = this.combineAbortSignals(abortSignal, timeoutAbortController.signal);

            let lastError: Error | undefined;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (abortSignal.aborted || timeoutAbortController.signal.aborted) {
                    throw new Error(ERROR_MESSAGES.CANCELLED);
                }
                if (attempt > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.computeRetryDelay(attempt - 1)),
                    );
                }

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
                    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
                        lastError = new Error(`Gemini API error: HTTP ${response.status}`);
                        continue;
                    }
                    await this.throwForStatus(response);
                }

                return await this.parseResponse(response);
            }
            throw lastError ?? new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
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
    ): Promise<{ text: string; finishReason?: string; blockReason?: string }> {
        const timeoutMs = options?.timeoutMs ?? this.settings.timeoutMs ?? 30000;
        const timeoutAbortController = new AbortController();
        const timeoutId = setTimeout(() => timeoutAbortController.abort(), timeoutMs);

        try {
            const requestBody = this.createRequestPayload(prompt, options);
            const url = this.buildUrl(this.getModel(options), 'streamGenerateContent');
            const combinedSignal = this.combineAbortSignals(abortSignal, timeoutAbortController.signal);

            let response: Response | undefined;
            let lastError: Error | undefined;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (abortSignal.aborted || timeoutAbortController.signal.aborted) {
                    throw new Error(ERROR_MESSAGES.CANCELLED);
                }
                if (attempt > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.computeRetryDelay(attempt - 1)),
                    );
                }
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': String(this.settings.apiKey),
                    },
                    body: JSON.stringify(requestBody),
                    signal: combinedSignal,
                });
                if (!response.ok) {
                    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
                        lastError = new Error(`Gemini API error: HTTP ${response.status}`);
                        continue;
                    }
                    await this.throwForStatus(response);
                }
                break;
            }
            if (!response || !response.ok) {
                throw lastError ?? new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
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
            let finishReason: string | undefined;
            let blockReason: string | undefined;

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
                        if (data?.promptFeedback?.blockReason) {
                            blockReason = data.promptFeedback.blockReason;
                        }
                        const candidate = data?.candidates?.[0];
                        if (candidate?.finishReason) {
                            finishReason = candidate.finishReason;
                        }
                        const parts = candidate?.content?.parts;
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

            return { text: accumulated, finishReason, blockReason };
        } finally {
            clearTimeout(timeoutId);
            if (!timeoutAbortController.signal.aborted) {
                timeoutAbortController.abort();
            }
        }
    }

    extractText(responseData: GeminiApiResponse): string {
        return this.extractResult(responseData).text;
    }

    extractResult(responseData: GeminiApiResponse): ExtractTextResult {
        const blockReason = responseData?.promptFeedback?.blockReason;
        const candidates = responseData?.candidates;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            if (blockReason) {
                throw new Error(`${ERROR_MESSAGES.CONTENT_BLOCKED} (${blockReason})`);
            }
            throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
        }

        const firstCandidate = candidates[0];
        if (!firstCandidate || typeof firstCandidate !== 'object') {
            throw new Error('Geminiの応答形式が不正です。');
        }

        const finishReason = firstCandidate?.finishReason;
        const content = firstCandidate?.content;
        if (!content || typeof content !== 'object') {
            // No content but a finishReason can mean SAFETY/RECITATION/OTHER block.
            if (finishReason && finishReason !== 'STOP') {
                throw new Error(`${ERROR_MESSAGES.CONTENT_BLOCKED} (${finishReason})`);
            }
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
        const text = assembledText && assembledText.length > 0 ? assembledText : fallbackText;
        return { text, finishReason, blockReason };
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
        const temperature = options?.temperature ?? (this.settings.temperature ?? 0.2);
        const maxTokensSource = options?.maxOutputTokens ?? this.settings.maxOutputTokens ?? 2048;
        const model = this.getModel(options);
        const modelInfo = GEMINI_MODELS[model];

        const generationConfig: Record<string, unknown> = {
            temperature,
            maxOutputTokens: Number(maxTokensSource) || 2048,
            // Plain-text response (no JSON wrapping) — translations are rendered
            // directly as Markdown by the popup.
            responseMimeType: 'text/plain',
        };

        // Only attach thinkingConfig on models that support it. Sending it to
        // Flash-Lite triggers a 400 error.
        if (modelInfo?.supportsThinking) {
            const thinkingBudget = options?.thinkingBudget ?? this.defaultThinkingBudget(model);
            generationConfig.thinkingConfig = { thinkingBudget };
        }

        const payload: Record<string, unknown> = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
        };

        const systemInstruction = options?.systemInstruction ?? SYSTEM_INSTRUCTION;
        if (systemInstruction && systemInstruction.trim().length > 0) {
            payload.systemInstruction = {
                role: 'system',
                parts: [{ text: systemInstruction }],
            };
        }

        return payload;
    }

    /**
     * Default thinking budget by model. Flash gets 0 (translation rarely
     * benefits from reasoning, and thinking tokens are billed). Pro gets -1
     * (dynamic) — Pro's strength is reasoning, so let it allocate as needed.
     */
    private defaultThinkingBudget(model: GeminiModelId): number {
        if (model === 'gemini-2.5-pro') return -1;
        return 0;
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
