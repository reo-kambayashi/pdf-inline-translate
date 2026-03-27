import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GeminiHttpClient } from './gemini-http-client';
import { DEFAULT_SETTINGS, GEMINI_MODEL } from '../constants';

// Mirror how the actual plugin loads the API key: Obsidian persists settings to
// data.json in the plugin root via this.loadData() / this.saveData().
function loadApiKeyFromDataJson(): string {
    try {
        const dataPath = resolve(__dirname, '../../data.json');
        const raw = JSON.parse(readFileSync(dataPath, 'utf-8'));
        return typeof raw?.apiKey === 'string' ? raw.apiKey : '';
    } catch {
        return '';
    }
}

const apiKey = process.env.GEMINI_API_KEY || loadApiKeyFromDataJson();
const runIntegration = !!apiKey;

describe('Gemini API key', () => {
    it('API key is configured (data.json or GEMINI_API_KEY env var)', () => {
        expect(
            apiKey,
            'APIキーが見つかりません。Obsidianの設定でキーを入力するか、GEMINI_API_KEY 環境変数をセットしてください。',
        ).not.toBe('');
    });
});

describe.skipIf(!runIntegration)('Gemini API integration', () => {
    const settings = {
        ...DEFAULT_SETTINGS,
        apiKey,
        model: GEMINI_MODEL,
    };
    const client = new GeminiHttpClient(settings);
    const abortSignal = new AbortController().signal;

    it('returns a non-empty response for a simple prompt', async () => {
        const response = await client.sendRequest('Say "hello" in one word.', abortSignal);
        const text = client.extractText(response);
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
    }, 30_000);

    it('streams chunks and accumulates the full response', async () => {
        const chunks: string[] = [];
        const accumulated = await client.streamRequest(
            'Say "hello" in one word.',
            abortSignal,
            (chunk) => chunks.push(chunk),
        );
        expect(chunks.length).toBeGreaterThan(0);
        expect(accumulated).toBe(chunks.join(''));
        expect(accumulated.trim().length).toBeGreaterThan(0);
    }, 30_000);

    it('throws on invalid API key', async () => {
        const badClient = new GeminiHttpClient({ ...settings, apiKey: 'invalid-key' });
        await expect(badClient.sendRequest('hello', abortSignal)).rejects.toThrow(/API key|check your API key/i);
    }, 30_000);
});
