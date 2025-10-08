import { ConsoleLogger, Logger, maskSecret } from "./logger";

const DEFAULT_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export interface GeminiClientOptions {
  apiKey: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: Logger;
}

export interface TranslateParams {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface TranslateResult {
  translatedText: string;
  promptTokens?: number;
  candidatesCount?: number;
}

export class GeminiClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(options: GeminiClientOptions) {
    if (!options.apiKey) {
      throw new Error("GeminiClient を初期化するには API キーが必要です。");
    }
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.logger = options.logger ?? new ConsoleLogger("GeminiClient");
    this.logger.info("GeminiClient を初期化しました", {
      endpoint: this.endpoint,
      apiKey: maskSecret(this.apiKey)
    });
  }

  async translate(params: TranslateParams): Promise<TranslateResult> {
    const { text, targetLanguage, sourceLanguage } = params;
    if (!text.trim()) {
      throw new Error("翻訳するテキストが空です。");
    }
    const prompt = this.buildPrompt(text, targetLanguage, sourceLanguage);
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    };

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          if (RETRY_STATUS.has(response.status) && attempt < this.maxRetries) {
            const retryDelay = this.retryDelay(attempt);
            this.logger.warn("Gemini API がエラーを返しました。リトライします。", {
              status: response.status,
              statusText: response.statusText,
              attempt,
              retryDelay
            });
            await this.delay(retryDelay);
            attempt += 1;
            continue;
          }
          const errorBody = await response.text();
          throw new Error(`Gemini API エラー: ${response.status} ${errorBody}`);
        }

        const data = (await response.json()) as GeminiGenerateContentResponse;
        const translatedText = this.extractText(data);
        if (!translatedText) {
          throw new Error("Gemini API のレスポンスから翻訳結果を取得できませんでした。");
        }

        return {
          translatedText,
          promptTokens: data.usageMetadata?.promptTokenCount,
          candidatesCount: data.candidates?.length
        };
      } catch (error) {
        lastError = error;
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        const isRetryable = isAbort || this.isRetryableNetworkError(error);
        if (isRetryable && attempt < this.maxRetries) {
          const retryDelay = this.retryDelay(attempt);
          this.logger.warn("Gemini API へのリクエストに失敗しました。リトライします。", {
            attempt,
            retryDelay,
            message: error instanceof Error ? error.message : String(error)
          });
          await this.delay(retryDelay);
          attempt += 1;
          continue;
        }
        break;
      }
    }

    throw new Error(
      `Gemini API へのリクエストが失敗しました: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  private buildPrompt(text: string, targetLanguage: string, sourceLanguage?: string): string {
    const base = [
      `You are a professional translator with PDF context awareness.`,
      `Translate the following text into ${targetLanguage}.`,
      `Preserve technical terms, punctuation, and footnote markers.`,
      `Respond with the translated text only without extra commentary.`
    ];
    if (sourceLanguage) {
      base.splice(2, 0, `Source language is ${sourceLanguage}.`);
    } else {
      base.splice(2, 0, "Detect the source language automatically.");
    }
    return `${base.join(" ")}\n\n"""${text}"""`;
  }

  private extractText(response: GeminiGenerateContentResponse): string | undefined {
    const firstCandidate = response.candidates?.[0];
    const parts = firstCandidate?.content?.parts ?? [];
    const firstTextPart = parts.find((part) => "text" in part);
    if (firstTextPart && "text" in firstTextPart && firstTextPart.text) {
      return firstTextPart.text.trim();
    }
    return undefined;
  }

  private retryDelay(attempt: number): number {
    const baseDelay = 500;
    return baseDelay * Math.pow(2, attempt);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return ["ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes((error as NodeJS.ErrnoException).code ?? "");
    }
    return false;
  }
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | {
            text?: string;
          }
        | Record<string, unknown>
      >;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
