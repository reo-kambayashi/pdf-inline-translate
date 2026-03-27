# Gemini API Integration

## Endpoints

| Mode | URL |
|---|---|
| Standard | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Streaming | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` |

API key passed as request header: `x-goog-api-key: {apiKey}` (set by `GeminiHttpClient`).

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

`systemInstruction` is always included in the payload; its `text` field defaults to an empty string if not configured.

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

Before building a prompt, `GeminiClient.requestTranslation()` calls `isDictionaryCandidate(text)` from [src/utils/dictionary-utils.ts](../src/utils/dictionary-utils.ts) directly.

`isDictionaryCandidate` returns `true` if:
- No whitespace (single token)
- ≤ 50 characters
- Matches `/^[A-Za-z][A-Za-z''\-]*$/`

Classification is stateless — computed on every request with no separate cache.

---

## Retry logic

`GeminiHttpClient` retries automatically for transient failures (`MAX_RETRIES = 3`):

- Retryable HTTP statuses: **429**, **500**, **503**
- Backoff: `1000 * 2^(attempt-1)` ms (1 s, 2 s, 4 s)
- Aborts immediately if the caller's signal or the timeout fires between attempts

Non-retryable errors (400, 401, 403, other 4xx) throw immediately.

---

## Error classification

`GeminiHttpClient.throwForStatus()` maps HTTP status codes to error messages:

| HTTP status | Error message |
|---|---|
| 400, 401, 403 | `"Gemini API error: {detail} - Please check your API key and quota."` |
| 429 | `"Gemini API error: {detail} - Rate limit exceeded. Please try again later."` (retried first) |
| 500, 503 | Retried up to 3 times; then throws `"Gemini API error: {detail}"` |
| other | `"Gemini API error: {detail}"` |

`{detail}` is extracted from the JSON error response (`error.message`), falling back to `HTTP {status}`.

Abort errors (from `AbortController`) are detected by `isAbortError()` and surface as `type: 'cancelled'`.

---

## Timeout

Default: 30 000 ms (`timeoutMs` setting).

`GeminiHttpClient` creates its own `AbortController` and calls `setTimeout` to trigger it. This is combined with the caller's `AbortController` via `combineAbortSignals()` — whichever fires first cancels the fetch.
