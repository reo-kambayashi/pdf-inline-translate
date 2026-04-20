import { Notice } from 'obsidian';
import { PdfInlineTranslatePluginSettings, TranslationContext } from '../types';
import { DEFAULT_GEMINI_MODEL, ERROR_MESSAGES } from '../constants';
import { TranslationHistoryManager } from '../translation-history-manager';
import { GeminiHttpClient, GeminiRequestOptions } from './gemini-http-client';
import { buildTranslationPrompt } from './gemini-prompt-builder';
import { isDictionaryCandidate } from '../utils/dictionary-utils';

// Dictionary lookups are single-word queries — the translation-oriented system
// instruction is wasted context, so a compact one is substituted.
const DICTIONARY_SYSTEM_INSTRUCTION = '簡潔で正確な辞書編集者として、指示のMarkdownのみ出力する。';

// Cap dictionary output to keep cost bounded. Even verbose dictionary cards
// rarely exceed ~600 tokens; user maxOutputTokens stays the upper bound.
const DICTIONARY_MAX_OUTPUT_TOKENS = 768;

export class GeminiClient {
    private httpClient: GeminiHttpClient;

    constructor(
        private settings: PdfInlineTranslatePluginSettings,
        private historyManager?: TranslationHistoryManager,
    ) {
        this.httpClient = new GeminiHttpClient(settings);
    }

    async requestTranslation(
        text: string,
        context: TranslationContext,
        abortSignal: AbortSignal,
        onChunk?: (text: string) => void,
    ): Promise<string> {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.EMPTY_TEXT);
        }
        if (abortSignal.aborted) throw new Error(ERROR_MESSAGES.CANCELLED);
        if (!this.settings.apiKey) throw new Error(ERROR_MESSAGES.NO_API_KEY);

        const skipCache = Boolean(context?.skipCache);
        if (this.historyManager && !skipCache) {
            const cachedResult = this.historyManager.findCachedTranslation(
                text,
                this.settings.targetLanguage,
            );
            if (cachedResult) {
                return cachedResult.translation;
            }
        }

        const classification: 'dictionary' | 'translation' = isDictionaryCandidate(text)
            ? 'dictionary'
            : 'translation';

        const timeoutMs = this.settings.timeoutMs || 30000;
        let finalTranslation: string | null = null;

        try {
            const prompt = buildTranslationPrompt(text, context, classification, this.settings);
            if (!prompt || typeof prompt !== 'string') {
                throw new Error(ERROR_MESSAGES.PROMPT_FAILED);
            }

            const requestOptions: GeminiRequestOptions = { timeoutMs };
            if (classification === 'dictionary') {
                requestOptions.systemInstruction = DICTIONARY_SYSTEM_INSTRUCTION;
                requestOptions.maxOutputTokens = Math.min(
                    DICTIONARY_MAX_OUTPUT_TOKENS,
                    this.settings.maxOutputTokens || DICTIONARY_MAX_OUTPUT_TOKENS,
                );
            }

            let translation: string;
            let finishReason: string | undefined;
            if (onChunk) {
                const streamResult = await this.httpClient.streamRequest(
                    prompt,
                    abortSignal,
                    onChunk,
                    requestOptions,
                );
                translation = streamResult.text;
                finishReason = streamResult.finishReason;
            } else {
                const responseData = await this.httpClient.sendRequest(prompt, abortSignal, requestOptions);
                const result = this.httpClient.extractResult(responseData);
                translation = result.text;
                finishReason = result.finishReason;
            }

            if (!translation || translation.length === 0) {
                throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
            }

            // Surface MAX_TOKENS truncation as a non-fatal warning rather than
            // silently returning a half-translated paragraph.
            if (finishReason === 'MAX_TOKENS') {
                console.warn('PDF Inline Translate: output truncated (MAX_TOKENS).');
                try {
                    new Notice(ERROR_MESSAGES.OUTPUT_TRUNCATED, 6000);
                } catch {
                    // Notice may be unavailable in test environments — ignore.
                }
            }

            finalTranslation = translation;
        } catch (error) {
            if (this.httpClient.isAbortError(error)) {
                console.debug('Translation request was cancelled');
                throw new Error(ERROR_MESSAGES.CANCELLED);
            }
            if (error instanceof Error) throw error;
            throw new Error(String(error));
        }

        if (!finalTranslation || finalTranslation.trim().length === 0) {
            throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
        }

        if (this.historyManager) {
            this.historyManager.addToHistory(
                text,
                finalTranslation,
                this.settings.targetLanguage,
                undefined,
                this.settings.model ?? DEFAULT_GEMINI_MODEL,
                classification === 'dictionary',
            );
        }

        return finalTranslation;
    }
}
