import { Notice } from "obsidian";
import { PdfInlineTranslatePluginSettings, TranslationContext } from "../types";
import { 
  SYSTEM_INSTRUCTION, 
  TRANSLATION_PROMPT_TEMPLATE, 
  DICTIONARY_PROMPT_TEMPLATE,
  GEMINI_API_BASE,
  DICTIONARY_API_BASE,
  ERROR_MESSAGES 
} from "../ui/constants";

export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings?: Array<any>;
  }>;
  promptFeedback?: {
    blockReason: string;
    safetyRatings?: Array<any>;
  };
}

export class GeminiClient {
  constructor(private settings: PdfInlineTranslatePluginSettings) {}

	private async isDictionaryWord(
    text: string,
    abortSignal: AbortSignal,
  ): Promise<boolean> {
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    const word = text.trim();
    // スペースを含む、または長すぎる文字列は辞書検索から除外
    if (word.includes(" ") || word.length > 50 || word.length === 0) {
      return false;
    }

    try {
      const encodedWord = encodeURIComponent(word);
      if (!encodedWord || encodedWord !== word) {
        // If encoding changed the string significantly, it might contain unsafe characters
        return false;
      }
      
      const url = `${DICTIONARY_API_BASE}/en/${encodedWord}`;
      const response = await fetch(url, {
        method: "GET",
        signal: abortSignal,
      });
      
      // Check if the request was aborted during fetch
      if (abortSignal.aborted) {
        return false;
      }
      
      return response.ok;
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(
          "PDF Inline Translate: Dictionary API request failed",
          error,
        );
      }
      return false;
    }
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

    const isDictionary = await this.isDictionaryWord(text, abortSignal);
    const classification = isDictionary ? "dictionary" : "translation";

    const prompt = this.buildPrompt(text, context, classification);
    if (!prompt || typeof prompt !== 'string') {
      throw new Error(ERROR_MESSAGES.PROMPT_FAILED);
    }

    const requestBody = this.createRequestPayload(prompt);
    const encodedModel = encodeURIComponent(this.settings.model);
    if (!encodedModel) {
      throw new Error("モデル名のエンコードに失敗しました。");
    }
    
    const url = `${GEMINI_API_BASE}/${encodedModel}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": String(this.settings.apiKey),
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (abortSignal.aborted) {
      throw new Error(ERROR_MESSAGES.CANCELLED);
    }

    if (!response.ok) {
      const errorDetail = await this.getApiErrorDetail(response);
      throw new Error(errorDetail);
    }

    const responseData = await this.parseResponse(response);

    const translation = this.extractTranslationFromResponse(responseData);
    if (!translation || translation.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
    }

    if (responseData?.promptFeedback?.blockReason) {
      new Notice(
        `Geminiが出力をブロックしました: ${String(responseData.promptFeedback.blockReason)}`,
      );
    }

    return translation;
  }

  private createRequestPayload(prompt: string) {
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: Number(this.settings.maxOutputTokens) || 1024,
      },
      systemInstruction: {
        role: "system",
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
    };
  }

  private async parseResponse(response: Response): Promise<GeminiResponse> {
    let responseData: GeminiResponse;
    try {
      responseData = await response.json();
    } catch (parseError) {
      console.error("PDF Inline Translate: レスポンスのJSON解析に失敗しました", parseError);
      throw new Error(ERROR_MESSAGES.RESPONSE_PARSE_FAILED);
    }

    if (!responseData || typeof responseData !== 'object') {
      throw new Error(ERROR_MESSAGES.INVALID_RESPONSE_FORMAT);
    }

    return responseData;
  }

  private extractTranslationFromResponse(responseData: GeminiResponse): string {
    const candidates = responseData?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
    }

    const firstCandidate = candidates[0];
    if (!firstCandidate || typeof firstCandidate !== 'object') {
      throw new Error("Geminiの応答形式が不正です。");
    }

    const content = firstCandidate?.content;
    if (!content || typeof content !== 'object') {
      throw new Error("Geminiの翻訳コンテンツがありません。");
    }

    const parts: Array<{ text?: string }> = Array.isArray(content?.parts) 
      ? content.parts 
      : [];
      
    const safeParts = parts.filter(part => part && typeof part === 'object' && typeof part.text === 'string');
    const assembledTranslation = safeParts
      .map((part) => part?.text?.trim())
      .filter((value): value is string => Boolean(value))
      .join("\n\n")
      .trim();
    const fallbackTranslation =
      safeParts.length > 0 && safeParts[0]?.text 
        ? safeParts[0].text.trim() 
        : "";
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
      console.error("エラーレスポンス解析失敗", parseError);
    }
    return detail;
  }

	private buildPrompt(
    text: string,
    context: TranslationContext,
    classification: string,
  ): string {
    const template =
      classification === "dictionary"
        ? DICTIONARY_PROMPT_TEMPLATE
        : TRANSLATION_PROMPT_TEMPLATE;

    return template
      .replaceAll("{{text}}", text)
      .replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
      .replaceAll(
        "{{page}}",
        context?.pageNumber != null ? String(context.pageNumber) : "N/A",
      );
  }
}
