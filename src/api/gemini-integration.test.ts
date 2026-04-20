import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GeminiHttpClient } from './gemini-http-client';
import { DEFAULT_SETTINGS } from '../constants';

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

// Single real-API smoke test. Streaming, retries, 401, abort, timeout, and
// extractText edge cases are all covered by mocked tests in
// gemini-http-client.test.ts — keep this suite minimal to limit cost and flakiness.
describe.skipIf(!runIntegration)('Gemini API integration (smoke)', () => {
    it('returns a non-empty response from the live API', async () => {
        const client = new GeminiHttpClient({ ...DEFAULT_SETTINGS, apiKey });
        const response = await client.sendRequest(
            'Say "hello" in one word.',
            new AbortController().signal,
        );
        const text = client.extractText(response);
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
    }, 30_000);
});
