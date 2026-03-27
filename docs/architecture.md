# Architecture

## Component map

```
src/
├── main.ts                        Plugin entry, orchestrates all managers
├── commands.ts                    Obsidian command registrations
├── settings-tab.ts                Settings UI
├── settings-helpers.ts            Helpers for Obsidian settings UI elements
├── types.ts                       All shared TypeScript interfaces
├── constants.ts                   Default settings, prompts, error strings, API base URL
│
├── selection-manager.ts           PDF text selection detection and auto-translate trigger
├── language-detector.ts           Static language detection (~12 languages)
│
├── translation-provider.ts        TranslationProvider interface + TranslationResult type
├── base-translation-provider.ts   Abstract base with input validation and abort handling
├── translation-provider-manager.ts Routes requests; owns cache lookup and mode dispatch
│
├── translation-history-manager.ts History CRUD, caching, export/import
├── batch-translation-service.ts   Batch job management with concurrency control
│
├── api/
│   ├── gemini-client.ts           High-level: classification, prompt, streaming coordination
│   ├── gemini-http-client.ts      Low-level: HTTP, SSE streaming, retry, timeout/abort
│   └── gemini-prompt-builder.ts   Template substitution for prompts
│
├── ui/
│   ├── ui-manager.ts              Popup lifecycle, translation execution, page observer
│   ├── floating-popup.ts          Popup component: state, drag, themes, streaming
│   ├── popup-dom-builder.ts       Static DOM factory for header and body
│   ├── popup-state-renderer.ts    Renders TranslationState to popup DOM
│   ├── popup-positioner.ts        Positions popup from selection rect or last position
│   ├── popup-drag-handler.ts      Pointer-capture drag-to-move
│   ├── markdown-renderer.ts       Custom Markdown → HTML renderer for popup body
│   ├── translation-history-view.ts Obsidian ItemView for history side panel
│   └── constants.ts               UI status strings, popup offset defaults
│
├── utils.ts                       DOM helpers, debounce, text splitting, validation
└── utils/
    └── dictionary-utils.ts        isDictionaryCandidate() — single English word check
```

---

## Data flow

```
1. User selects text in PDF++ viewer
         ↓
2. SelectionManager
   - selectionchange / pointerup events
   - Debounce 350ms (AUTO_TRANSLATE_DEBOUNCE_MS)
   - Skip if same selection repeated within 1500ms
   - Skip if user manually closed popup for this selection
   - Extracts pageNumber from data-page-number attribute
   - Builds TranslationContext { pageNumber, rect, selection }
         ↓
3. Plugin.openTranslation(text, context)
   - Validates text (non-empty, ≤ 10 000 chars)
   - Checks API configuration
         ↓
4. UIManager.openTranslationInPopup(text, context)
   - Gets or creates GeminiTranslationFloatingPopup
   - Prepares collapsed state
   - If autoExpandPopup=true → immediately expands
         ↓
5. [User expands popup OR autoExpandPopup]
         ↓
6. UIManager.executeTranslationRequest(text, context)
   - Detects language if enableLanguageDetection=true
   - Creates AbortController for timeout
   - Calls TranslationProviderManager.translate()
         ↓
7. TranslationProviderManager.translate()
   - Checks TranslationHistoryManager cache (keyed by text + targetLang + isDictionary)
   - On hit → returns cached result immediately
   - On miss → classifies text, calls GeminiClient.requestTranslation()
         ↓
8. GeminiClient.requestTranslation(text, context, abortSignal, onChunk)
   - isDictionaryCandidate(text) → dictionary or translation mode
   - GeminiPromptBuilder builds prompt from template
   - GeminiHttpClient.sendRequest() or .streamRequest()
         ↓
9. GeminiHttpClient
   - POST to Gemini API (standard or SSE streaming endpoint)
   - Combines timeout abort + caller abort via combineAbortSignals()
   - Streaming: parses SSE chunks, calls onChunk callback
         ↓
10. Result bubbles back to UIManager
    - Streaming: FloatingPopup.appendStreamChunk() called per chunk
    - Final: TranslationHistoryManager.addToHistory() + FloatingPopup.showResult()
    - Error: FloatingPopup.showError()
    - Cancelled: FloatingPopup.showCancelled()
         ↓
11. [Optional] Auto-insert to note
    - If autoInsertToNote=true, inserts using insertionTemplate into active Markdown editor
```

---

## Caching (3 levels)

| Level | Location | Scope | Persisted |
|---|---|---|---|
| Translation | `TranslationHistoryManager` | text + targetLang + isDictionary → result | Yes (plugin data) |
| History store | Obsidian `loadData/saveData` | All history items (max 50) | Yes |

Cache key for translation lookup: exact string match on `original` + `targetLanguage` + `isDictionary`.

---

## Abort / timeout mechanism

- `UIManager` creates an `AbortController` per request.
- `GeminiHttpClient` creates its own timeout `AbortController` (default 30s).
- Both signals are combined via `combineAbortSignals()` — whichever fires first aborts the fetch.
- On streaming: the `ReadableStreamDefaultReader` is `.cancel()`-ed on abort.
- Result is `type: 'cancelled'` (no error shown) for user-initiated cancels, `type: 'error'` for timeout.

---

## Dictionary vs. translation mode

`isDictionaryCandidate(text)` in `src/utils/dictionary-utils.ts`:
- Single token (no whitespace)
- ≤ 50 characters
- Matches `/^[A-Za-z][A-Za-z''\-]*$/` (English word characters only)

If true → `dictionaryPromptTemplate` is used (lexicon-style card with definitions and examples).
Otherwise → `translationPromptTemplate` (academic paragraph translation).

Classification is performed inline in `GeminiClient.requestTranslation()` on every call; there is no separate cache for classification results.

---

## Adding a new provider

1. Implement `TranslationProvider` from [src/translation-provider.ts](../src/translation-provider.ts) (or extend `BaseTranslationProvider`).
2. Add provider key to the `translationProvider` union type in [src/types.ts](../src/types.ts).
3. Register the provider in `TranslationProviderManager` ([src/translation-provider-manager.ts](../src/translation-provider-manager.ts)).
4. Add any required settings fields in `PdfInlineTranslatePluginSettings` ([src/types.ts](../src/types.ts)) and expose them in the settings tab.
