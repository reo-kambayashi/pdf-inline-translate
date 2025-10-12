import { TranslationProvider, TranslationResult } from "./translation-provider";
import { PdfInlineTranslatePluginSettings } from "./types";
import { GeminiClient } from "./api/gemini-client";
import { OpenAITranslationProvider } from "./providers/openai-provider";
import { AnthropicTranslationProvider } from "./providers/anthropic-provider";
import { TranslationHistoryManager } from "./translation-history-manager";

export class TranslationProviderManager {
  private providers: Map<string, TranslationProvider> = new Map();
  private currentProvider: TranslationProvider | null = null;
  
  constructor(
    private settings: PdfInlineTranslatePluginSettings,
    private historyManager?: TranslationHistoryManager
  ) {
    this.initializeProviders();
  }
  
  private initializeProviders(): void {
    // Initialize Gemini provider (always available)
    const geminiClient = new GeminiClient(this.settings, this.historyManager);
    this.providers.set('gemini', {
      translate: async (text, targetLang, sourceLang, context, abortSignal) => {
        try {
          const result = await geminiClient.requestTranslation(text, context || {}, abortSignal || new AbortController().signal);
          return {
            text: result,
            success: true,
            provider: 'Gemini',
            model: this.settings.model
          };
        } catch (error) {
          return {
            text: "",
            success: false,
            error: error.message || "Unknown error occurred during translation"
          };
        }
      },
      isConfigured: () => !!this.settings.apiKey,
      getName: () => 'Gemini',
      getModel: () => this.settings.model
    });
    
    // Initialize OpenAI provider if API key is set
    if (this.settings.openAIApiKey) {
      this.providers.set('openai', new OpenAITranslationProvider(
        this.settings.openAIApiKey, 
        this.settings.openAIModel || 'gpt-4'
      ));
    }
    
    // Initialize Anthropic provider if API key is set
    if (this.settings.anthropicApiKey) {
      this.providers.set('anthropic', new AnthropicTranslationProvider(
        this.settings.anthropicApiKey, 
        this.settings.anthropicModel || 'claude-3-sonnet-20240229'
      ));
    }
    
    // Set the current provider based on settings
    this.currentProvider = this.providers.get(this.settings.translationProvider) || 
                          this.providers.get('gemini') || 
                          null;
  }
  
  getProvider(providerName?: string): TranslationProvider | null {
    if (providerName) {
      return this.providers.get(providerName) || null;
    }
    return this.currentProvider;
  }
  
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  setCurrentProvider(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    if (provider) {
      this.currentProvider = provider;
      // Update the settings to persist the change
      this.settings.translationProvider = providerName as any;
      return true;
    }
    return false;
  }
  
  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
    context?: any,
    abortSignal?: AbortSignal
  ): Promise<TranslationResult> {
    if (!this.currentProvider) {
      return {
        text: "",
        success: false,
        error: "No translation provider is configured"
      };
    }
    
    // Check for cached translation first if history manager is available
    if (this.historyManager) {
      const cachedResult = this.historyManager.findCachedTranslation(text, targetLang);
      if (cachedResult) {
        console.debug(`Using cached translation for: ${text.substring(0, 50)}...`);
        return {
          text: cachedResult.translation,
          success: true,
          provider: cachedResult.isDictionary ? 'Dictionary' : cachedResult.modelUsed,
          model: cachedResult.modelUsed
        };
      }
    }
    
    // Perform the translation
    const result = await this.currentProvider.translate(
      text,
      targetLang,
      sourceLang,
      context,
      abortSignal
    );
    
    // Add to history if successful and history manager is available
    if (result.success && this.historyManager && result.text) {
      this.historyManager.addToHistory(
        text,
        result.text,
        targetLang,
        sourceLang,
        result.model || this.currentProvider.getModel(),
        false // Not a dictionary lookup
      );
    }
    
    return result;
  }
  
  isCurrentProviderConfigured(): boolean {
    return this.currentProvider?.isConfigured() || false;
  }
  
  getCurrentProviderName(): string {
    return this.currentProvider?.getName() || 'Unknown';
  }
}