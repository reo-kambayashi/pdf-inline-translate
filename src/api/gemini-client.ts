import { Notice } from "obsidian";
import { PdfInlineTranslatePluginSettings } from "../types";

const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_INSTRUCTION = `あなたは学術翻訳および専門用語の監修を担うプロフェッショナルです。次の原則を厳守してください。
1. 原文の論理展開・専門用語・トーンを忠実に保持し、誤訳や意訳を避ける。
2. 太字・斜体・数式・引用番号などの書式は可能な限り維持する。
3. 不要な前置き、免責、脚注、推測は一切付与しない。
4. 文体は学術誌の本文と同等の格調高いだ・である調で統一する。`;
const PROMPT_TEMPLATE = `## タスク
PDF原稿の{{page}}ページから抽出した内容を、{{targetLanguage}}で学術論文向けに翻訳してください。

## 守るべき要件
- 原文の段落・箇条書き・見出し・記号類をそのままの順序で保持する。
- 専門用語や固有名詞に確信が持てない場合は原文の表記を括弧内に併記する。
- 数式・変数・単位・引用番号・脚注記号は改変しない。
- 翻訳結果のみを出力し、追加の説明やサマリーを入れない。
- 数式の形が崩れていそうな場合は、整形して出力する。

## 例1
### 原文
The quick brown fox jumps over the lazy dog. This sentence contains all the letters of the English alphabet.

### 出力
素早い茶色の狐は怠惰な犬を飛び越える。この文には英語のアルファベットのすべての文字が含まれている。

## 例2
### 原文
**Figure 1:** A diagram showing the proposed architecture. The system consists of three main components: a data ingestion module, a processing engine, and a visualization dashboard.

### 出力
**図1:** 提案されたアーキテクチャを示す図。このシステムは、データ取り込みモジュール、処理エンジン、および可視化ダッシュボードの3つの主要コンポーネントで構成される。

## 対象の原文
{{text}}

## 出力形式
翻訳文のみを段落ごとに出力し、段落間の空行は1行以内とする。`;
const DICTIONARY_PROMPT_TEMPLATE = `以下の単語または熟語について、学術辞典スタイルのマークダウン解説カードを作成してください。

### 制約事項
- 対象言語: {{targetLanguage}}
- 出力は指定の項目のみ。余計な前置きや末尾コメントは禁止。
- 複数の品詞を持つ場合は、それぞれ番号付きリストで列挙すること。
- 同じ品詞内で複数の意味を持つ場合は、サブリスト（-）を用いて列挙すること。
- 意味は使用される頻度の高い順に並べること。
- 例文に登場する対象語句は、**太字**で強調すること。

### 例
mitigate

#### 出力例
**mitigate** /ˈmɪtɪɡeɪt/

1.  **品詞:** 動詞
    - **意味1:** （苦痛・厳しさなどを）和らげる、軽減する
      **例文:** They are trying to **mitigate** the effects of the crisis. / 彼らはその危機の効果を和らげようと試みている。

    - **意味2:** （刑罰などを）軽くする
      **例文:** The judge refused to **mitigate** the sentence. / 裁判官は刑の軽減を拒否した。

### 対象語句
{{text}}`;

export class GeminiClient {
	constructor(private settings: PdfInlineTranslatePluginSettings) {}

	private async isDictionaryWord(
		text: string,
		abortSignal: AbortSignal,
	): Promise<boolean> {
		const word = text.trim();
		// スペースを含む、または長すぎる文字列は辞書検索から除外
		if (word.includes(" ") || word.length > 50) {
			return false;
		}

		try {
			const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
				word,
			)}`;
			const response = await fetch(url, {
				method: "GET",
				signal: abortSignal,
			});
			return response.ok;
		} catch (error) {
			if (error.name !== "AbortError") {
				console.error(
					"PDF Inline Translate: Dictionary API request failed",
					error,
				);
			}
			return false;
		}
	}

	async requestTranslation(
		text: string,
		context: any,
		abortSignal: AbortSignal,
	): Promise<string> {
		const isDictionary = await this.isDictionaryWord(text, abortSignal);
		const classification = isDictionary ? "dictionary" : "translation";

		const prompt = this.buildPrompt(text, context, classification);

		const body: any = {
			contents: [
				{
					role: "user",
					parts: [{ text: prompt }],
				},
			],
			generationConfig: {
				temperature: this.settings.temperature,
				maxOutputTokens: this.settings.maxOutputTokens,
			},
			systemInstruction: {
				role: "system",
				parts: [{ text: SYSTEM_INSTRUCTION }],
			},
		};

		const url = `${GEMINI_API_BASE}/${encodeURIComponent(
			this.settings.model,
		)}:generateContent`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.settings.apiKey,
			},
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok) {
			const errorDetail = await this._getApiErrorDetail(response);
			throw new Error(errorDetail);
		}

		const responseData = await response.json();

		const parts: Array<{ text?: string }> =
			responseData?.candidates?.[0]?.content?.parts ?? [];
		const assembledTranslation = parts
			.map((part) => part?.text?.trim())
			.filter((value): value is string => Boolean(value))
			.join("\n\n")
			.trim();
		const fallbackTranslation =
			responseData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
		const translation =
			assembledTranslation.length > 0
				? assembledTranslation
				: fallbackTranslation;

		if (!translation || translation.length === 0) {
			throw new Error("Geminiから翻訳結果を取得できませんでした。");
		}

		if (responseData?.promptFeedback?.blockReason) {
			new Notice(
				`Geminiが出力をブロックしました: ${responseData.promptFeedback.blockReason}`,
			);
		}

		return translation;
	}

	private async _getApiErrorDetail(response: Response): Promise<string> {
		let detail = `HTTP ${response.status}`;
		try {
			const errorPayload = await response.json();
			detail = errorPayload?.error?.message || detail;
		} catch (parseError) {
			console.error("エラーレスポンス解析失敗", parseError);
		}
		return detail;
	}

	private buildPrompt(
		text: string,
		context: any,
		classification: string,
	): string {
		const template =
			classification === "dictionary"
				? DICTIONARY_PROMPT_TEMPLATE
				: PROMPT_TEMPLATE;

		return template
			.replaceAll("{{text}}", text)
			.replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
			.replaceAll(
				"{{page}}",
				context?.pageNumber != null ? String(context.pageNumber) : "N/A",
			);
	}
}
