# Gemini API Integration

## Endpoints

| Mode | URL |
|---|---|
| Standard | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Streaming | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` |

API key passed as query param: `?key={apiKey}` (appended by `GeminiHttpClient`).

Base URL constant: `GEMINI_API_BASE` in [src/constants.ts](../src/constants.ts).

---

## Request payload

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "<prompt>" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 1024
  },
  "systemInstruction": {
    "role": "system",
    "parts": [{ "text": "<system instruction>" }]
  }
}
```

`systemInstruction` is omitted if the setting is empty.

---

## Response format

```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "translated text" }],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [...]
    }
  ],
  "promptFeedback": {
    "blockReason": "...",
    "safetyRatings": [...]
  }
}
```

Text is extracted from `candidates[0].content.parts[0].text`.

If `promptFeedback.blockReason` is set, the request was blocked by content policy → `CONTENT_BLOCKED` error.

---

## Streaming (SSE)

`streamGenerateContent?alt=sse` returns Server-Sent Events.

Each event is a JSON line matching the standard response format above. `GeminiHttpClient.streamRequest()`:

1. Reads the response body as a `ReadableStream`.
2. Splits on `\n`.
3. Strips `data: ` prefix from each line.
4. Parses JSON and extracts `candidates[0].content.parts[0].text`.
5. Calls `onChunk(text)` for each non-empty chunk.
6. On abort: calls `reader.cancel()`.

---

## Prompt templates

Templates are stored in settings and substituted by `GeminiPromptBuilder`.

**Placeholders:**

| Placeholder | Replaced with |
|---|---|
| `{{text}}` | The text to translate |
| `{{targetLanguage}}` | Target language (e.g. `日本語`) |
| `{{page}}` | PDF page number, or `"N/A"` if unknown |

Two templates:
- `translationPromptTemplate` — used for multi-word text (academic paragraph translation)
- `dictionaryPromptTemplate` — used for single English words (lexicon-style card)

Default templates are defined in `DEFAULT_SETTINGS` in [src/constants.ts](../src/constants.ts).

---

## Classification (dictionary vs. translation mode)

Before building a prompt, `TranslationClassifier.classify()` is called:

1. Checks in-memory cache (`Map<string, boolean>`).
2. On miss: calls `isDictionaryCandidate(text)` from [src/utils/dictionary-utils.ts](../src/utils/dictionary-utils.ts).

`isDictionaryCandidate` returns `true` if:
- No whitespace (single token)
- ≤ 50 characters
- Matches `/^[A-Za-z][A-Za-z''\-]*$/`

Result is cached for the session. History items seed the cache on startup via `TranslationClassifier.seedFromHistory()`.

---

## Error classification

`GeminiHttpClient` maps HTTP status codes to user-facing messages:

| HTTP status | Error constant | Displayed message |
|---|---|---|
| 400 | `API_AUTH_ERROR` | API認証エラー |
| 401 | `API_AUTH_ERROR` | API認証エラー |
| 403 | `API_AUTH_ERROR` | API認証エラー |
| 429 | `API_RATE_LIMITED` | レート制限 |
| other 4xx/5xx | generic | HTTP {status} |

Abort errors (from `AbortController`) are detected by `isAbortError()` and surface as `type: 'cancelled'`.

---

## Timeout

Default: 30 000 ms (`timeoutMs` setting).

`GeminiHttpClient` creates its own `AbortController` and calls `setTimeout` to trigger it. This is combined with the caller's `AbortController` via `combineAbortSignals()` — whichever fires first cancels the fetch.
