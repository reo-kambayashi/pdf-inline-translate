import { Notice } from 'obsidian';
import {
    PdfInlineTranslatePluginSettings,
    TranslationContext,
    GeminiApiResponse,
} from '../types';
import { ERROR_MESSAGES, GEMINI_API_BASE } from '../constants';
import { TranslationHistoryManager } from '../translation-history-manager';
import { isDictionaryCandidate } from '../utils/dictionary-utils';

export class GeminiClient {
    private classificationCache = new Map<string, 'dictionary' | 'translation'>();

    constructor(
        private settings: PdfInlineTranslatePluginSettings,
        private historyManager?: TranslationHistoryManager,
    ) {}

    async requestTranslation(
        text: string,
        context: TranslationContext,
        abortSignal: AbortSignal,
    ): Promise<string> {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.EMPTY_TEXT);
        }

        if (abortSignal.aborted) {
            throw new Error(ERROR_MESSAGES.CANCELLED);
        }

        if (!this.settings.apiKey) {
            throw new Error(ERROR_MESSAGES.NO_API_KEY);
        }

        if (!this.settings.model) {
            throw new Error(ERROR_MESSAGES.NO_MODEL);
        }

        const normalizedKey = text.trim().toLowerCase();

        if (this.historyManager) {
            let cachedResult = this.historyManager.findCachedTranslation(
                text,
                this.settings.targetLanguage,
            );

            if (cachedResult) {
                const cachedClassification = cachedResult.isDictionary ? 'dictionary' : 'translation';
                this.classificationCache.set(normalizedKey, cachedClassification);
                return cachedResult.translation;
            }
        }

        let classification: 'dictionary' | 'translation';

        if (this.classificationCache.has(normalizedKey)) {
            classification = this.classificationCache.get(normalizedKey)!;
        } else {
            classification = await this.classifyTranslationMode(text, context, abortSignal);
        }

        const timeoutMs = this.settings.timeoutMs || 30000;
        let finalTranslation: string | null = null;

        try {
            const prompt = this.buildPrompt(text, context, classification);
            if (!prompt || typeof prompt !== 'string') {
                throw new Error(ERROR_MESSAGES.PROMPT_FAILED);
            }

            const responseData = await this.sendGeminiRequest(prompt, abortSignal, {
                timeoutMs,
            });

            const translation = this.extractTextFromResponse(responseData);
            if (!translation || translation.length === 0) {
                throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
            }

            if (responseData?.promptFeedback?.blockReason) {
                const blockReason = String(responseData.promptFeedback.blockReason);
                new Notice(`Geminiが出力をブロックしました: ${blockReason}`);
            }

            finalTranslation = translation;
        } catch (error) {
            if (this.isAbortError(error)) {
                console.debug('Translation request was cancelled');
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }

            if (error instanceof Error) {
                throw error;
            }

            throw new Error(String(error));
        }

        if (!finalTranslation || finalTranslation.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
        }

        this.classificationCache.set(normalizedKey, classification);

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

    private async classifyTranslationMode(
        text: string,
        context: TranslationContext,
        abortSignal: AbortSignal,
    ): Promise<'dictionary' | 'translation'> {
        const normalizedKey = text.trim().toLowerCase();

        if (this.classificationCache.has(normalizedKey)) {
            return this.classificationCache.get(normalizedKey)!;
        }

        if (abortSignal.aborted) {
            throw new Error(ERROR_MESSAGES.CANCELLED);
        }

        const heuristicFallback = isDictionaryCandidate(text) ? 'dictionary' : 'translation';

        try {
            const prompt = this.buildClassificationPrompt(text, context);
            const responseData = await this.sendGeminiRequest(prompt, abortSignal, {
                temperature: 0,
                maxOutputTokens: 8,
                systemInstruction:
                    'You are a classification module. Respond with only "dictionary" or "translation" to indicate the best output style for the given input.',
                timeoutMs: Math.min(this.settings.timeoutMs || 30000, 10000),
            });

            const rawResult = this.extractTextFromResponse(responseData);
            const classification = this.parseClassificationText(rawResult) ?? heuristicFallback;
            this.classificationCache.set(normalizedKey, classification);
            return classification;
        } catch (error) {
            if (this.isAbortError(error)) {
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }

            console.debug('Gemini classification failed; falling back to heuristic.', error);
            this.classificationCache.set(normalizedKey, heuristicFallback);
            return heuristicFallback;
        }
    }

    private buildClassificationPrompt(text: string, context: TranslationContext): string {
        const pageInfo =
            context?.pageNumber != null ? `Page: ${context.pageNumber}` : 'Page: unknown';

        return `Classify whether the user expects a dictionary-style lexical explanation or a standard translation.
Output only the single lowercase word "dictionary" or "translation".
Choose "dictionary" for single words, idioms, or short terms that benefit from parts-of-speech, definitions, phonetics, or usage notes. Choose "translation" for sentences, paragraphs, or when contextual translation is better.

${pageInfo}
Original text:
"""${text.trim()}"""`;
    }

    private parseClassificationText(raw: string): 'dictionary' | 'translation' | null {
        if (!raw || typeof raw !== 'string') {
            return null;
        }

        const normalized = raw.trim().toLowerCase();

        if (normalized === 'dictionary' || normalized.startsWith('dictionary')) {
            return 'dictionary';
        }

        if (normalized === 'translation' || normalized.startsWith('translation')) {
            return 'translation';
        }

        return null;
    }

    private buildPrompt(
        text: string,
        context: TranslationContext,
        classification: 'dictionary' | 'translation',
    ): string {
        const template =
            classification === 'dictionary'
                ? this.settings.dictionaryPromptTemplate
                : this.settings.translationPromptTemplate;

        return (template ?? '')
            .replaceAll('{{text}}', text)
            .replaceAll('{{targetLanguage}}', this.settings.targetLanguage)
            .replaceAll(
                '{{page}}',
                context?.pageNumber != null ? String(context.pageNumber) : 'N/A',
            );
    }

    private async sendGeminiRequest(
        prompt: string,
        abortSignal: AbortSignal,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            systemInstruction?: string;
            timeoutMs?: number;
        },
    ): Promise<GeminiApiResponse> {
        const timeoutMs = options?.timeoutMs ?? this.settings.timeoutMs ?? 30000;
        const timeoutAbortController = new AbortController();
        const timeoutId = setTimeout(() => timeoutAbortController.abort(), timeoutMs);

        try {
            const requestBody = this.createRequestPayload(prompt, options);
            const encodedModel = encodeURIComponent(this.settings.model);
            if (!encodedModel) {
                throw new Error('モデル名のエンコードに失敗しました。');
            }

            const url = `${GEMINI_API_BASE}/${encodedModel}:generateContent`;
            const combinedSignal = this.combineAbortSignals(
                abortSignal,
                timeoutAbortController.signal,
            );

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
                    throw new Error(
                        `${errorMessage} - Rate limit exceeded. Please try again later.`,
                    );
                } else {
                    throw new Error(errorMessage);
                }
            }

            return await this.parseResponse(response);
        } finally {
            clearTimeout(timeoutId);
            if (!timeoutAbortController.signal.aborted) {
                timeoutAbortController.abort();
            }
        }
    }

    private createRequestPayload(
        prompt: string,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            systemInstruction?: string;
        },
    ) {
        const temperature =
            options?.temperature ?? (this.settings.temperature ?? 0.7);
        const maxTokensSource = options?.maxOutputTokens ?? this.settings.maxOutputTokens ?? 1024;

        return {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                temperature,
                maxOutputTokens: Number(maxTokensSource) || 1024,
            },
            systemInstruction: {
                role: 'system',
                parts: [
                    {
                        text: options?.systemInstruction ?? this.settings.systemInstruction ?? '',
                    },
                ],
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
            signal.addEventListener(
                'abort',
                () => {
                    combinedController.abort();
                },
                { once: true },
            );
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

    private extractTextFromResponse(responseData: GeminiApiResponse): string {
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
        const fallbackText =
            safeParts.length > 0 && safeParts[0]?.text ? safeParts[0].text.trim() : '';
        const result = assembledText && assembledText.length > 0 ? assembledText : fallbackText;

        return result;
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

    private isAbortError(error: unknown): boolean {
        if (!error) {
            return false;
        }

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
}
