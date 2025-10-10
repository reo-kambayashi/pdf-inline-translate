import { Notice } from "obsidian";
import { PdfInlineTranslatePluginSettings } from "../types";

const GEMINI_API_BASE =
	"https://generativelanguage.googleapis.com/v1beta/models";

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
				},
			],
			generationConfig: {
				temperature: this.settings.temperature,
				maxOutputTokens: this.settings.maxOutputTokens,
			},
		};

		if (this.settings.systemInstruction?.trim()) {
			body.systemInstruction = {
				role: "system",
				parts: [{ text: this.settings.systemInstruction }],
			};
		}

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
				? this.settings.dictionaryPromptTemplate
				: this.settings.promptTemplate;

		return template
			.replaceAll("{{text}}", text)
			.replaceAll("{{targetLanguage}}", this.settings.targetLanguage)
			.replaceAll(
				"{{page}}",
				context?.pageNumber != null ? String(context.pageNumber) : "N/A",
			);
	}
}
