import { Notice } from "obsidian";
import { PdfInlineTranslatePluginSettings } from "../types";

const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_INSTRUCTION =
	"あなたはプロの学術翻訳者です。与えられた原文を、その分野の専門家が読むことを想定し、専門用語やニュアンスを正確に反映した、自然で格調高い日本語の学術論文スタイル（だ・である調）で翻訳してください。追加の説明、解釈、脚注は一切含めず、翻訳文のみを厳密に出力してください。";
const PROMPT_TEMPLATE =
	"以下の学術論文の抜粋を、{{targetLanguage}}に翻訳してください。原文の専門用語と論理構造を忠実に維持し、学術的な文体で記述してください。翻訳結果のみを出力してください。\n\n--- 原文 ---\n{{text}}\n";
const DICTIONARY_PROMPT_TEMPLATE =
	"以下の単語または熟語について、指定の形式で解説を作成してください。\n\n**言語:** {{targetLanguage}}\n**出力形式:** マークダウン\n\n--- 指示 ---\n1. **品詞:** 単語の品詞を記述してください。\n2. **意味:** 主な意味を簡潔に説明してください。\n3. **発音記号:** IPA（国際音声記号）で発音を記述してください。\n4. **例文:** その単語が自然に使われている例文を1つ作成し、その日本語訳も併記してください。\n\n--- 単語 ---\n{{text}}\n";

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