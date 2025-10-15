import { Notice, requestUrl } from 'obsidian';
import {
    PdfInlineTranslatePluginSettings,
    TranslationContext,
    GeminiApiResponse,
} from '../types';
import { DICTIONARY_API_BASE, ERROR_MESSAGES } from '../constants';
import { TranslationHistoryManager } from '../translation-history-manager';

export class GeminiClient {
    constructor(
        private settings: PdfInlineTranslatePluginSettings,
        private historyManager?: TranslationHistoryManager,
    ) {}

    private async isDictionaryWord(text: string, abortSignal: AbortSignal): Promise<boolean> {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const word = text.trim();
        // スペースを含む、または長すぎる文字列は辞書検索から除外
        if (word.includes(' ') || word.length > 50 || word.length === 0) {
            return false;
        }

        // 英単語として成立しているかを先にチェック
        const dictionaryCandidatePattern = /^[A-Za-z][A-Za-z'’\-]*$/;
        if (!dictionaryCandidatePattern.test(word)) {
            return false;
        }

        if (abortSignal.aborted) {
            console.debug('Dictionary lookup cancelled before request.');
            return false;
        }

        try {
            const normalizedWord = word.toLowerCase();
            const encodedWord = encodeURIComponent(normalizedWord);
            const url = `${DICTIONARY_API_BASE}/en/${encodedWord}`;

            // requestUrlはCORSの影響を受けない
            const response = await requestUrl({
                url: url,
                method: 'GET',
                throw: false, // 4xx, 5xx エラーで例外を投げないようにする
            });

            if (abortSignal.aborted) {
                console.debug('Dictionary lookup cancelled after request.');
                return false;
            }

            // 200 OKなら単語が見つかった
            if (response.status === 200) {
                return true;
            }

            // 404 Not Found など、辞書APIで単語が見つからなかった場合は
            // LLMベースの辞書生成にフォールバックする
            if (response.status !== 404) {
                console.debug(`Dictionary API request failed with status: ${response.status}`);
            }
        } catch (error) {
            // ネットワークエラーなど、リクエスト自体が失敗した場合
            console.debug('PDF Inline Translate: Dictionary API request failed at network level.', error);
        }

        if (abortSignal.aborted) {
            console.debug('Dictionary lookup cancelled after API fallback.');
            return false;
        }

        // APIで見つからなくても英単語らしければ辞書スタイルで処理する
        return true;
    }

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

        // Check for cached translation first
        if (this.historyManager) {
            const cachedResult = this.historyManager.findCachedTranslation(
                text,
                this.settings.targetLanguage,
            );
            if (cachedResult) {
                console.debug('Using cached translation for:', text.substring(0, 50) + '...');
                return cachedResult.translation;
            }
        }

        // Add timeout support if configured
        const timeoutMs = this.settings.timeoutMs || 30000; // Default to 30 seconds
        const timeoutAbortController = new AbortController();
        const timeoutId = setTimeout(() => timeoutAbortController.abort(), timeoutMs);

        try {
            const isDictionaryPromise = this.isDictionaryWord(text, abortSignal);
            let isDictionary = false;

            try {
                isDictionary = await isDictionaryPromise;
            } catch (dictError) {
                // If dictionary lookup fails, continue with translation anyway
                console.debug('Dictionary lookup failed, proceeding with translation:', dictError);
                isDictionary = false;
            }

            const classification = isDictionary ? 'dictionary' : 'translation';

            const prompt = this.buildPrompt(text, context, classification);
            if (!prompt || typeof prompt !== 'string') {
                throw new Error(ERROR_MESSAGES.PROMPT_FAILED);
            }

            const requestBody = this.createRequestPayload(prompt);
            const encodedModel = encodeURIComponent(this.settings.model);
            if (!encodedModel) {
                throw new Error('モデル名のエンコードに失敗しました。');
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;

            // Combine the request abort signal with the timeout abort signal
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

                // Check if it's a quota or authorization issue and notify user appropriately
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

            const responseData: GeminiApiResponse = await this.parseResponse(response);

            const translation = this.extractTranslationFromResponse(responseData);
            if (!translation || translation.length === 0) {
                throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
            }

            if (responseData?.promptFeedback?.blockReason) {
                const blockReason = String(responseData.promptFeedback.blockReason);
                new Notice(`Geminiが出力をブロックしました: ${blockReason}`);
                // Still return the translation even if blocked for safety reasons
            }

            // Add the new translation to history
            if (this.historyManager) {
                this.historyManager.addToHistory(
                    text,
                    translation,
                    this.settings.targetLanguage,
                    undefined, // source language would need to be detected
                    this.settings.model,
                    isDictionary,
                );
            }

            return translation;
        } catch (error) {
            // Handle AbortError specifically
            if (error.name === 'AbortError' || error.message.includes('cancelled')) {
                console.debug('Translation request was cancelled');
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }

            // Re-throw the original error
            throw error;
        } finally {
            clearTimeout(timeoutId);
            if (!timeoutAbortController.signal.aborted) {
                timeoutAbortController.abort();
            }
        }
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

    private createRequestPayload(prompt: string) {
        return {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                temperature: this.settings.temperature ?? 0.7,
                maxOutputTokens: Number(this.settings.maxOutputTokens) || 1024,
            },
            systemInstruction: {
                role: 'system',
                parts: [{ text: this.settings.systemInstruction ?? '' }],
            },
        };
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

    private extractTranslationFromResponse(responseData: GeminiApiResponse): string {
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
        const assembledTranslation = safeParts
            .map((part) => part?.text?.trim())
            .filter((value): value is string => Boolean(value))
            .join('\n\n')
            .trim();
        const fallbackTranslation =
            safeParts.length > 0 && safeParts[0]?.text ? safeParts[0].text.trim() : '';
        const translation =
            assembledTranslation && assembledTranslation.length > 0
                ? assembledTranslation
                : fallbackTranslation;

        return translation;
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

    private buildPrompt(text: string, context: TranslationContext, classification: string): string {
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
}
