import { BaseTranslationProvider } from "../base-translation-provider";
import { TranslationResult, TranslationProvider } from "./translation-provider";
import { TranslationContext } from "./types";

export class AnthropicTranslationProvider extends BaseTranslationProvider implements TranslationProvider {
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  
  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
    context?: TranslationContext,
    abortSignal?: AbortSignal
  ): Promise<TranslationResult> {
    this.validateInputs(text, targetLang);
    this.handleAbortError(abortSignal);

    if (!this.isConfigured()) {
      return {
        text: "",
        success: false,
        error: "Anthropic API key is not configured"
      };
    }

    try {
      // Construct the prompt for translation
      const prompt = `Translate the following text to ${targetLang}. ${sourceLang ? `The source language is ${sourceLang}. ` : ''}Preserve the original formatting and structure as much as possible.\n\nText to translate:\n${text}`;
      
      const requestBody = {
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3 // Lower temperature for more consistent translations
      };

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal
      });

      this.handleAbortError(abortSignal);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Anthropic API error: ${response.status} ${response.statusText}`;
        
        // Handle specific error cases
        if (response.status === 401) {
          return {
            text: "",
            success: false,
            error: "Invalid Anthropic API key. Please check your settings."
          };
        } else if (response.status === 429) {
          return {
            text: "",
            success: false,
            error: "Anthropic rate limit exceeded. Please try again later."
          };
        } else {
          return {
            text: "",
            success: false,
            error: errorMessage
          };
        }
      }

      const data = await response.json();
      
      if (!data.content || data.content.length === 0) {
        return {
          text: "",
          success: false,
          error: "No translation returned from Anthropic"
        };
      }

      const translatedText = data.content[0]?.text?.trim() || "";
      
      if (!translatedText) {
        return {
          text: "",
          success: false,
          error: "Empty translation returned from Anthropic"
        };
      }

      return {
        text: translatedText,
        success: true,
        provider: "Anthropic",
        model: this.model
      };
    } catch (error) {
      if (error.name === "AbortError") {
        return {
          text: "",
          success: false,
          error: "Translation request was cancelled"
        };
      }
      
      return {
        text: "",
        success: false,
        error: error.message || "Unknown error occurred during translation"
      };
    }
  }
  
  getName(): string {
    return "Anthropic";
  }
}