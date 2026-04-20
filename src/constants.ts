import { GeminiModelId, PdfInlineTranslatePluginSettings } from './types';

// Default model. Flash-Lite is the cheapest production-grade Gemini 2.5 model
// (~6x cheaper output than Flash) and is sufficient for short selections /
// dictionary lookups. Users can switch to Flash or Pro from settings.
export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-2.5-flash-lite';

export interface GeminiModelInfo {
    id: GeminiModelId;
    label: string;
    /** Compact label for popup header / status displays. */
    shortLabel: string;
    /** Per-1M-token pricing (USD). Source: https://ai.google.dev/gemini-api/docs/pricing (2026-04). */
    inputPricePerMTokenUsd: number;
    outputPricePerMTokenUsd: number;
    /** Whether the model supports `thinkingConfig.thinkingBudget`. */
    supportsThinking: boolean;
    description: string;
}

export const GEMINI_MODELS: Record<GeminiModelId, GeminiModelInfo> = {
    'gemini-2.5-flash-lite': {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash-Lite (高速・最安)',
        shortLabel: 'Flash-Lite',
        inputPricePerMTokenUsd: 0.1,
        outputPricePerMTokenUsd: 0.4,
        supportsThinking: false,
        description: '短文・辞書引きに最適。Flashの約6倍安い。',
    },
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (バランス)',
        shortLabel: 'Flash',
        inputPricePerMTokenUsd: 0.3,
        outputPricePerMTokenUsd: 2.5,
        supportsThinking: true,
        description: '長文・専門用語の精度が必要なときに。',
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro (最高精度)',
        shortLabel: 'Pro',
        inputPricePerMTokenUsd: 1.25,
        outputPricePerMTokenUsd: 10,
        supportsThinking: true,
        description: '高度な意味解釈が必要な学術翻訳向け。動的thinking有効。',
    },
};

export function getModelShortLabel(model: GeminiModelId | undefined): string {
    const info = GEMINI_MODELS[model ?? DEFAULT_GEMINI_MODEL];
    return info?.shortLabel ?? 'Gemini';
}

// Prompts are intentionally kept in code (not in data.json) so that template
// improvements ship with the plugin without users having to manually reset
// their settings. To customize, edit these constants directly.
export const SYSTEM_INSTRUCTION = `学術翻訳・専門用語監修のプロ。原則:
1. 論理展開・専門用語・トーンを忠実に保持。直訳が誤解を招くときのみ最小限の意訳。
2. 太字・斜体・数式・引用番号・URL・コード片は原文どおり維持。
3. 前置き・免責・脚注・推測・自己言及を付与しない。出力は翻訳本文のみ。
4. 文体は原文準拠（論文・技術文書はだ・である調、解説・口語ではその語調）。
5. 不明箇所を勝手に補完せず、原文に書かれた範囲だけを翻訳する。`;

export const TRANSLATION_PROMPT_TEMPLATE = `次のPDF抜粋（ページ {{page}}）を{{targetLanguage}}に翻訳せよ。

出力規則（厳守）:
- 翻訳本文のみを返す。前置き・後書き・「翻訳：」等のラベル・コードフェンス・引用符での囲い込みは禁止。
- 段落数・箇条書き数・見出し数・改行構造を原文どおり保つ（統合・分割・追加禁止）。
- 数式（$…$, $$…$$, \\(…\\), \\[…\\]）・変数名・単位・引用番号 [12] や (Smith, 2020)・脚注記号・URLは一切改変しない。
- 専門用語・固有名詞は標準訳がある場合は標準訳を、無い・不確実な場合は初出時のみ括弧で原語併記（例: トランスフォーマー(Transformer)）。
- OCR由来の不要スペース・改行で分断された語/数式は意味を保ったまま整形可。
- 段落間の空行は最大1行。

原文:
{{text}}`;

export const DICTIONARY_PROMPT_TEMPLATE = `{{targetLanguage}}辞書カードをMarkdownで出力。前置き・コードフェンス禁止。出力は辞書本体のみ。

──── 形式A：単一品詞 ────
## {語句}
*{品詞}* ・ /{IPA}/

**1.** {意味}
> {例文（対象語を**太字**）}
>
> {{{targetLanguage}}訳文（対応訳語を**太字**）}

──── 形式B：複数品詞 ────
## {語句}
/{IPA}/

### *{品詞1}*

**1.** {意味}
> {例文}
>
> {訳文}

### *{品詞2}*

**1.** {意味}
> {例文}
>
> {訳文}

絶対規則:
- 形式Bでは ### 行の直後に「{品詞} ・ /{IPA}/」のような行を絶対に書かない。品詞名は ### 行に1回のみ。
- 形式Bで品詞ごとに発音が明確に異なる場合のみ \`### *{品詞}* ・ /{IPA}/\` の形で1行に統合する（独立行にしない）。
- 意味・品詞名は{{targetLanguage}}で記述。原語（noun, verb, adj 等）禁止。日本語の品詞名は 名詞/動詞/形容詞/副詞/前置詞/接続詞/代名詞/助動詞/間投詞 等。
- 意味は頻度順に列挙する（件数の上限は設けない）。番号は品詞ごとに 1. から振り直す。
- IPA は \`/.../\` で囲む（例: /həˈloʊ/）。不明なら IPA 要素ごと省略。
- 例文は対象語を含む一般用例を1つだけ生成可（事実・固有名詞の創作禁止）。作れなければ blockquote ごと省略。
- 例文は「原言語 → {{targetLanguage}}訳」の順。

対象: {{text}}`;

export const DEFAULT_SETTINGS: PdfInlineTranslatePluginSettings = {
    apiKey: '',
    model: DEFAULT_GEMINI_MODEL,
    targetLanguage: '日本語',
    // 2048 covers most paragraph translations without truncation; user can
    // tune. Output cost on Flash-Lite is $0.40/M, so worst-case 2048 tokens
    // ≈ $0.0008 per call.
    maxOutputTokens: 2048,
    popupBackgroundColorAlpha: 0.9,
    enableAutoTranslate: true,
    temperature: 0.2,
    autoInsertToNote: false,
    insertionTemplate: `> {{original}}
>
> {{translation}}
`,
    timeoutMs: 30000, // 30 seconds
    enableTranslationHistory: true,
    maxHistoryItems: 50,
    popupWidth: 420,
    popupHeight: 320,
    popupPosition: 'top-right',
    popupTheme: 'system',
    fontSize: 'medium',
    showOriginalText: false,
    autoExpandPopup: false,
    enableLanguageDetection: true,
    sourceLanguage: 'auto',
};

// Auto-translate timing constants
export const AUTO_TRANSLATE_DEBOUNCE_MS = 350;
export const AUTO_TRANSLATE_REPEAT_THRESHOLD_MS = 1500;

// Popup positioning constants
export const POPUP_MIN_WIDTH = 300;
export const POPUP_MAX_WIDTH = 500;
export const POPUP_MIN_HEIGHT = 200;
export const POPUP_MAX_HEIGHT = 600;
export const POPUP_OFFSET = 12;
export const POPUP_DEFAULT_TOP = 24;
export const POPUP_DEFAULT_LEFT = 24;

// API constants
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Error message constants
export const ERROR_MESSAGES = {
    EMPTY_TEXT: '翻訳するテキストが空です。',
    CANCELLED: '翻訳リクエストがキャンセルされました。',
    NO_API_KEY: 'Gemini APIキーが設定されていません。',
    PROMPT_FAILED: 'プロンプトの生成に失敗しました。',
    RESPONSE_PARSE_FAILED: '翻訳応答を解析できませんでした。',
    INVALID_RESPONSE_FORMAT: 'Geminiからの応答形式が不正です。',
    NO_TRANSLATION_RESULT: '翻訳結果を取得できませんでした。',
    INVALID_SELECTION: '選択テキストが無効です。',
    SELECTION_TOO_LONG: '選択テキストが長すぎます。',
    REQUEST_ABORTED: '翻訳リクエストが中断されました。',
    INVALID_RECT: '矩形情報が無効です。',
    POPUP_CREATION_FAILED: '翻訳ポップアップを開くことができませんでした。',
    API_QUOTA_EXCEEDED: 'APIの使用制限に達しました。料金プランを確認してください。',
    API_RATE_LIMITED: 'APIのレート制限に達しました。しばらく時間を置いてから再度お試しください。',
    API_AUTH_ERROR: 'API認証エラー。APIキーが無効または期限切れです。',
    CONTENT_BLOCKED: 'Geminiが安全上またはコンテンツポリシーの理由で出力をブロックしました。',
    OUTPUT_TRUNCATED: '出力が最大トークン数に達して途中で打ち切られました。設定で「最大出力トークン」を増やすか、選択範囲を短くしてください。',
};

// UI status message constants
export const UI_STATUS_MESSAGES = {
    LOADING: '翻訳中…',
    PENDING: '翻訳を開始するにはボタンをクリックしてください。',
    CANCELLED: '翻訳を中断しました。',
    ERROR_DEFAULT: '翻訳に失敗しました。詳細はコンソールをご確認ください。',
    ERROR_API_KEY: 'APIキーが設定されていません。設定を確認してください。',
    ERROR_RATE_LIMIT: 'レート制限に達しました。しばらくしてから再度お試しください。',
    ERROR_QUOTA_EXCEEDED: 'API利用制限に達しました。料金プランを確認してください。',
};
