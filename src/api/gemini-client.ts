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

## 原文
{{text}}

## 出力形式
翻訳文のみを段落ごとに出力し、段落間の空行は1行以内とする。`;
const DICTIONARY_PROMPT_TEMPLATE = `以下の単語または熟語について、学術辞典スタイルのマークダウン解説カードを作成してください。

### 制約事項
- 対象言語: {{targetLanguage}}
- 出力は指定の項目のみ。余計な前置きや末尾コメントは禁止。

### 出力フォーマット
**品詞:** （品詞を明記）
**意味:** （主要な意味を簡潔に説明）
**発音記号:** /IPA/（IPAで表記）
**例文:** （単語を用いた自然な例文） / （例文の日本語訳）

### 対象語句
{{text}}`;

export class GeminiClient {
	constructor(private settings: PdfInlineTranslatePluginSettings) {}

	async requestTranslation(
		text: string,
		context: any,
		abortSignal: AbortSignal,
	): Promise<string> {
		const prompt = this.buildPrompt(text, context);
		const body: any = {
			contents: [
				{
					role: "user",
					parts: [{ text: prompt }],
				}
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

	private buildPrompt(text: string, context: any): string {
		const trimmedText = text.trim();
		const wordCount = trimmedText.split(/\s+/).length;

		const isDictionaryQuery = wordCount <= 3 && trimmedText.length <= 50;

		const template =
			isDictionaryQuery
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
