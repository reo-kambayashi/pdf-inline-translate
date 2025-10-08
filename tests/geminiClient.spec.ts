import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup/vitest.setup";
import { GeminiClient } from "../src/lib/geminiClient";

const TEST_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

describe("GeminiClient", () => {
  it("Gemini API のレスポンスから翻訳結果を取得できる", async () => {
    server.use(
      http.post(TEST_ENDPOINT, async () =>
        HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [{ text: "こんにちは" }]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 12
          }
        })
      )
    );

    const client = new GeminiClient({
      apiKey: "test-key",
      endpoint: TEST_ENDPOINT,
      maxRetries: 0
    });

    const result = await client.translate({
      text: "Hello",
      targetLanguage: "ja"
    });

    expect(result.translatedText).toBe("こんにちは");
    expect(result.promptTokens).toBe(12);
  });

  it("429 エラー時にリトライして成功する", async () => {
    let callCount = 0;
    server.use(
      http.post(TEST_ENDPOINT, async () => {
        callCount += 1;
        if (callCount === 1) {
          return new HttpResponse("rate limited", { status: 429 });
        }
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [{ text: "テスト" }]
              }
            }
          ]
        });
      })
    );

    const client = new GeminiClient({
      apiKey: "test-key",
      endpoint: TEST_ENDPOINT,
      maxRetries: 1,
      timeoutMs: 1000
    });

    const result = await client.translate({
      text: "Test",
      targetLanguage: "ja"
    });

    expect(callCount).toBe(2);
    expect(result.translatedText).toBe("テスト");
  });
});
