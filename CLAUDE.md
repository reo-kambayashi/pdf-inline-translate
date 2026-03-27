# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Development build with watch mode and inline sourcemaps
npm run build     # Production build (minified, outputs main.js)
npm run lint      # ESLint on src/**/*.ts
npm run format    # Prettier formatting on src/**/*.ts
npm test          # Run Vitest tests
npx vitest run src/utils.test.ts  # Run a single test file
```

Output is always `main.js` at the repo root (consumed by Obsidian directly).

## Architecture

This is an **Obsidian plugin** that integrates with the **PDF++ plugin** to translate selected PDF text using AI (Gemini, OpenAI, Anthropic).

**Data flow:**
```
PDF++ text selection
  → SelectionManager (detects, debounces, triggers auto-translate)
  → Plugin.openTranslation()
  → TranslationProviderManager (routes to configured provider)
  → [GeminiClient | OpenAIProvider | AnthropicProvider] → API
  → TranslationHistoryManager (cache)
  → UIManager → GeminiTranslationFloatingPopup (floating popup over PDF)
```

**Key source files:**
- [src/main.ts](src/main.ts) — Plugin entry point; initializes all managers, registers commands/settings
- [src/translation-provider-manager.ts](src/translation-provider-manager.ts) — Routes translation requests to the active provider
- [src/selection-manager.ts](src/selection-manager.ts) — Tracks PDF text selection, manages auto-translate debounce
- [src/api/gemini-client.ts](src/api/gemini-client.ts) — Primary provider; handles Gemini API, prompt building, dictionary/translation mode classification
- [src/providers/openai-provider.ts](src/providers/openai-provider.ts) and [src/providers/anthropic-provider.ts](src/providers/anthropic-provider.ts) — Additional provider implementations
- [src/ui/ui-manager.ts](src/ui/ui-manager.ts) — Creates/destroys the floating popup, observes PDF page DOM for cleanup
- [src/ui/floating-popup.ts](src/ui/floating-popup.ts) — Floating popup UI with drag, copy, original text toggle, theme handling
- [src/translation-history-manager.ts](src/translation-history-manager.ts) — Persists translation history (CRUD, export/import, max items limit)
- [src/batch-translation-service.ts](src/batch-translation-service.ts) — Batch translation with concurrency control
- [src/settings-tab.ts](src/settings-tab.ts) — Settings UI (API keys, models, prompts, behavior toggles)
- [src/types.ts](src/types.ts) — All TypeScript interfaces (`PdfInlineTranslatePluginSettings`, `TranslationProvider`, `TranslationResult`, `TranslationHistoryItem`, etc.)
- [src/constants.ts](src/constants.ts) — Default settings, error/status messages, API endpoints, popup dimensions

## Provider Interface

All translation providers implement `TranslationProvider` from [src/translation-provider.ts](src/translation-provider.ts):
```typescript
interface TranslationProvider {
  translate(text, targetLang, sourceLang?, context?, abortSignal?): Promise<TranslationResult>;
  isConfigured(): boolean;
  getName(): string;
  getModel(): string;
}
```

New providers should extend `BaseTranslationProvider` ([src/base-translation-provider.ts](src/base-translation-provider.ts)) and be registered in `TranslationProviderManager`.

## Obsidian Plugin Notes

- Obsidian API is external (not bundled); access via `import { ... } from 'obsidian'`
- Plugin settings persist via `this.loadData()` / `this.saveData()` in main.ts
- Commands are registered in [src/commands.ts](src/commands.ts)
- The plugin requires PDF++ to be installed and active; it hooks into PDF++ DOM events
- `manifest.json` controls plugin ID (`pdf-inline-translate`) and minimum Obsidian version (`1.11.7`)
