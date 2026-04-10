import { PdfInlineTranslatePluginSettings } from './types';

export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

export const DEFAULT_SETTINGS: PdfInlineTranslatePluginSettings = {
    apiKey: '',
    targetLanguage: '日本語',
    maxOutputTokens: 512,
    popupBackgroundColorAlpha: 0.9,
    enableAutoTranslate: true,
    systemInstruction: `あなたは学術翻訳および専門用語の監修を担うプロフェッショナルです。次の原則を厳守してください。
1. 原文の論理展開・専門用語・トーンを忠実に保持し、誤訳や意訳を避ける。
2. 太字・斜体・数式・引用番号などの書式は可能な限り維持する。
3. 不要な前置き、免責、脚注、推測は一切付与しない。
4. 文体は学術誌の本文と同等の格調高いだ・である調で統一する。`,
    translationPromptTemplate: `## タスク
PDF原稿の{{page}}ページから抽出した内容を、{{targetLanguage}}で学術論文向けに翻訳してください。

## 守るべき要件
- 原文の段落・箇条書き・見出し・記号類をそのままの順序で保持する。
- 専門用語や固有名詞に確信が持てない場合は原文の表記を括弧内に併記する。
- 数式・変数・単位・引用番号・脚注記号は改変しない。
- 翻訳結果のみを出力し、追加の説明やサマリーを入れない。
- 数式の形が崩れていそうな場合は、整形して出力する。

## 対象の原文
{{text}}

## 出力形式
翻訳文のみを段落ごとに出力し、段落間の空行は1行以内とする。`,
    dictionaryPromptTemplate: `以下の単語または熟語について、学術辞典スタイルのマークダウン解説カードを作成してください。

### 制約事項
- 対象言語: {{targetLanguage}}
- 出力は指定の項目のみ。余計な前置きや末尾コメントは禁止。
- 複数の品詞を持つ場合は、それぞれ番号付きリストで列挙すること。
- 同じ品詞内で複数の意味を持つ場合は、サブリスト（-）を用いて列挙すること。
- 意味は使用される頻度の高い順に並べること。
- 例文に登場する対象語句は、**太字**で強調すること。

### 出力形式
**{語句}** /{発音記号}/

1.  **品詞:** {品詞}
    - **意味N:** {意味}
      **例文:** {例文（対象語句は**太字**）}

### 対象語句
{{text}}`,
    temperature: 0.3,
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
