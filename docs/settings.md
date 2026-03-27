# Settings Reference

All settings are stored in `PdfInlineTranslatePluginSettings` ([src/types.ts](../src/types.ts)).
Defaults are in `DEFAULT_SETTINGS` ([src/constants.ts](../src/constants.ts)).

---

## API

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `""` | Gemini API key. Must start with `AIza`. Get from https://aistudio.google.com/ |

---

## Language

| Key | Type | Default | Description |
|---|---|---|---|
| `targetLanguage` | `string` | `"日本語"` | Language to translate into |
| `sourceLanguage` | `string` | `"auto"` | Source language when detection is disabled |
| `enableLanguageDetection` | `boolean` | `true` | Auto-detect source language from selected text |

---

## Translation behavior

| Key | Type | Default | Description |
|---|---|---|---|
| `enableAutoTranslate` | `boolean` | `true` | Trigger translation automatically on PDF text selection |
| `autoInsertToNote` | `boolean` | `false` | Insert translation into active Markdown editor after completion |
| `insertionTemplate` | `string` | `"> {{original}}\n> \n> {{translation}}\n"` | Template for note insertion. Placeholders: `{{original}}`, `{{translation}}` |

---

## Popup UI

| Key | Type | Default | Description |
|---|---|---|---|
| `popupPosition` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left' \| 'custom'` | `'top-right'` | Initial popup placement |
| `popupTheme` | `'system' \| 'default' \| 'dark' \| 'light' \| 'blue' \| 'green'` | `'system'` | Popup color theme |
| `fontSize` | `'small' \| 'medium' \| 'large'` | `'medium'` | Translation text font size |
| `popupWidth` | `number` | `420` | Popup width in px |
| `popupHeight` | `number` | `320` | Popup height in px |
| `popupBackgroundColorAlpha` | `number` | `0.9` | Background opacity (0–1) |
| `showOriginalText` | `boolean` | `false` | Show original text in popup by default |
| `autoExpandPopup` | `boolean` | `false` | Expand popup immediately on selection (skip manual expand) |

---

## Advanced / model

| Key | Type | Default | Description |
|---|---|---|---|
| `systemInstruction` | `string?` | (academic translator prompt) | System prompt sent to Gemini |
| `translationPromptTemplate` | `string?` | (see constants.ts) | Prompt for multi-word / sentence translation. Supports `{{text}}`, `{{targetLanguage}}`, `{{page}}` |
| `dictionaryPromptTemplate` | `string?` | (see constants.ts) | Prompt for single English word dictionary lookup. Same placeholders |
| `temperature` | `number?` | `0.7` | Gemini sampling temperature (0–1) |
| `maxOutputTokens` | `number` | `1024` | Max tokens in Gemini response |
| `timeoutMs` | `number?` | `30000` | Request timeout in milliseconds |

---

## History

| Key | Type | Default | Description |
|---|---|---|---|
| `enableTranslationHistory` | `boolean` | `true` | Cache and persist translation history |
| `maxHistoryItems` | `number` | `50` | Maximum number of history entries to keep |
