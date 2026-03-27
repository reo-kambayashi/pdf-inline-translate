# Testing

## Runner and configuration

[Vitest](https://vitest.dev/) is used as the test runner.

```
npm test                                      # run all tests
npx vitest run <path>                         # run a single file
npx vitest run src/api/gemini-http-client.test.ts
```

Configuration lives in [vitest.config.ts](../vitest.config.ts):

- `globals: true` — Vitest globals (`describe`, `it`, `expect`, …) available without importing.
- `resolve.alias` — `obsidian` is aliased to [src/__mocks__/obsidian.ts](../src/__mocks__/obsidian.ts), a minimal stub exposing only the `Notice` class. No real Obsidian context is needed.

---

## Test files

| File | Subject | Key dependencies |
|---|---|---|
| [src/utils.test.ts](../src/utils.test.ts) | `splitTextForBatch`, `isValidRect`, `createPlainRect` | none |
| [src/utils/dictionary-utils.test.ts](../src/utils/dictionary-utils.test.ts) | `normalizeDictionaryTerm`, `isDictionaryCandidate` | none |
| [src/api/gemini-prompt-builder.test.ts](../src/api/gemini-prompt-builder.test.ts) | `buildTranslationPrompt` | none |
| [src/translation-history-manager.test.ts](../src/translation-history-manager.test.ts) | `TranslationHistoryManager` | plugin mock factory |
| [src/batch-translation-service.test.ts](../src/batch-translation-service.test.ts) | `BatchTranslationService` | provider/history/UI mock factories |
| [src/api/gemini-http-client.test.ts](../src/api/gemini-http-client.test.ts) | `GeminiHttpClient` | `vi.stubGlobal('fetch', …)`, fake timers |
| [src/api/gemini-integration.test.ts](../src/api/gemini-integration.test.ts) | Real Gemini API round-trip | live API key required |

---

## Coverage by file

### `src/utils.test.ts`

`splitTextForBatch` — paragraph splitting, sentence splitting for long text, empty/whitespace input.

`isValidRect` — valid full rect object, missing field, non-numeric field, null/undefined.

`createPlainRect` — null passthrough, numeric field conversion, non-numeric fields default to 0, `toJSON` presence.

---

### `src/utils/dictionary-utils.test.ts`

`normalizeDictionaryTerm` — valid single words lowercased; null for empty, whitespace, spaces, >50 chars, non-English chars, digit-leading, non-string input; accepts hyphens and apostrophes (straight + curly).

`isDictionaryCandidate` — true for a valid single English word; false for phrases, empty string, accented characters.

---

### `src/api/gemini-prompt-builder.test.ts`

`buildTranslationPrompt` — `{{text}}` / `{{targetLanguage}}` / `{{page}}` substitution; dictionary vs. translation template selection; `N/A` when `pageNumber` is undefined or null; all placeholder occurrences replaced; empty template; template with no placeholders.

---

### `src/translation-history-manager.test.ts`

Uses a lightweight plugin mock (no Obsidian APIs). `saveSettings` is a `vi.fn()`.

| Method | Cases covered |
|---|---|
| `addToHistory` | disabled flag no-ops; newest-first ordering; `maxHistoryItems` trimming; `isDictionary` flag; `saveSettings` called |
| `getHistory` | returns a copy (not the internal reference) |
| `getRecent(count)` | limits to count; returns all when count > length |
| `searchHistory` | empty query returns `[]`; case-insensitive; `searchIn` param (`both` / `original` / `translation`) |
| `findCachedTranslation` | disabled returns null; hit on exact match; null on text mismatch; null on language mismatch; `isDictionary` filter |
| `removeItem` | true + removes on found; false on unknown id |
| `clearHistory` | empties the array |
| `exportHistory` / `importHistory` | JSON round-trip; invalid JSON returns false; missing `items` array returns false |

---

### `src/batch-translation-service.test.ts`

Uses mock factories for `TranslationProviderManager`, `TranslationHistoryManager`, and `UIManager`.

| Method | Cases covered |
|---|---|
| `createJob` | correct item count; `status=pending`, `progress=0`; unique IDs; retrievable via `getJob` |
| `executeJob` | `completed`+`progress=100` on full success; results array populated; `addToHistory` called per item; item `status=failed` on error; job `status=failed` when all fail; `completed` when any succeed; exception from `translate()` caught; throws for unknown jobId |
| `cancelJob` | returns true + `status=failed`; `AbortController` aborted; false for unknown id |
| `clearCompletedJobs` | removes completed jobs older than 24 h; keeps newer ones; skips pending/processing; returns removed count |
| `getAllJobs` | returns all created jobs |

---

### `src/api/gemini-http-client.test.ts`

Network is mocked via `vi.stubGlobal('fetch', vi.fn(…))`. Retry backoff and timeout use `vi.useFakeTimers()` + `vi.runAllTimersAsync()`.

| Method | Cases covered |
|---|---|
| `extractText` | single part; multiple parts joined with `\n\n`; empty candidates throws; missing candidates throws; all-empty parts |
| `isAbortError` | `DOMException` with `AbortError` name; `Error` with `AbortError` name; message contains "cancelled"; generic error; null/undefined |
| `sendRequest` | 200 success; pre-aborted signal skips fetch; 400/401 throws immediately (no retry); 429 retries 3×, exhausts; 500 retries 3×, exhausts; 503 succeeds on second attempt; timeout fires and throws |
| `streamRequest` | chunks accumulated and `onChunk` called per part; malformed SSE lines skipped; null body throws; pre-aborted signal skips fetch; 429 retries 3×, exhausts |

---

### `src/api/gemini-integration.test.ts`

Hits the real Gemini API. The suite is **skipped automatically** when no API key is present.

API key resolution order:
1. `GEMINI_API_KEY` environment variable
2. `data.json` in the plugin root (`apiKey` field — the file Obsidian writes via `saveData()`)

Cases (each with a 30 s timeout):
- Non-empty response for a simple prompt (`sendRequest`)
- Streaming accumulates full text and chunks concatenate (`streamRequest`)
- Invalid API key throws an auth error

---

## Adding tests

- **No Obsidian context required** — most modules only depend on the `obsidian` stub (`Notice`). Instantiate classes directly.
- **Mock `fetch`** with `vi.stubGlobal` + `afterEach(() => vi.restoreAllMocks())` for HTTP-level tests.
- **Retry/timeout** scenarios need `vi.useFakeTimers()` + `vi.runAllTimersAsync()` + `vi.useRealTimers()` in `afterEach`.
- **Integration tests** should use `describe.skipIf(!apiKey)(…)` so CI passes without credentials.
