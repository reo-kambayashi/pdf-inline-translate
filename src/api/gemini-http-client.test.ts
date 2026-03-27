import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiHttpClient } from './gemini-http-client';
import { DEFAULT_SETTINGS, ERROR_MESSAGES } from '../constants';
import type { GeminiApiResponse } from '../types';

// Build a GeminiApiResponse-conforming candidate array from plain text parts.
function makeCandidate(...texts: string[]): GeminiApiResponse['candidates'] {
    return [
        {
            content: { parts: texts.map((text) => ({ text })), role: 'model' },
            finishReason: 'STOP',
            index: 0,
        },
    ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const settings = { ...DEFAULT_SETTINGS, apiKey: 'test-key' };

function makeClient() {
    return new GeminiHttpClient(settings);
}

function makeJsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeOkResponse(text = 'translated text') {
    return makeJsonResponse(200, { candidates: makeCandidate(text) });
}

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

function makeSseResponse(parts: string[]): Response {
    const sseLines = parts
        .map((text) => `data: ${JSON.stringify({ candidates: makeCandidate(text) })}\n`)
        .join('\n');
    return new Response(makeSSEStream([sseLines]), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    });
}

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------

describe('GeminiHttpClient.extractText', () => {
    const client = makeClient();

    it('extracts text from a normal response', () => {
        expect(client.extractText({ candidates: makeCandidate('hello') })).toBe('hello');
    });

    it('joins multiple parts with double newline', () => {
        expect(client.extractText({ candidates: makeCandidate('part one', 'part two') })).toBe(
            'part one\n\npart two',
        );
    });

    it('throws when candidates array is empty', () => {
        expect(() => client.extractText({ candidates: [] })).toThrow(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
    });

    it('throws when candidates is missing', () => {
        expect(() => client.extractText({})).toThrow(ERROR_MESSAGES.NO_TRANSLATION_RESULT);
    });

    it('returns empty string when parts are present but all texts are empty', () => {
        expect(client.extractText({ candidates: makeCandidate('') })).toBe('');
    });
});

// ---------------------------------------------------------------------------
// isAbortError
// ---------------------------------------------------------------------------

describe('GeminiHttpClient.isAbortError', () => {
    const client = makeClient();

    it('returns true for a DOMException with name AbortError', () => {
        const err = new DOMException('Aborted', 'AbortError');
        expect(client.isAbortError(err)).toBe(true);
    });

    it('returns true for an Error with name AbortError', () => {
        const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
        expect(client.isAbortError(err)).toBe(true);
    });

    it('returns true for an Error whose message contains "cancelled"', () => {
        const err = new Error(ERROR_MESSAGES.CANCELLED);
        expect(client.isAbortError(err)).toBe(true);
    });

    it('returns false for a generic Error', () => {
        expect(client.isAbortError(new Error('network error'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(client.isAbortError(null)).toBe(false);
        expect(client.isAbortError(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// sendRequest
// ---------------------------------------------------------------------------

describe('GeminiHttpClient.sendRequest', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('returns parsed response on 200', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse('bonjour')));
        const client = makeClient();
        const result = await client.sendRequest('hello', new AbortController().signal);
        expect(client.extractText(result)).toBe('bonjour');
    });

    it('does not call fetch when signal is already aborted', async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        const controller = new AbortController();
        controller.abort();

        const client = makeClient();
        await expect(client.sendRequest('hello', controller.signal)).rejects.toThrow(
            ERROR_MESSAGES.CANCELLED,
        );
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws without retry on 400 (non-retryable)', async () => {
        const mockFetch = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(400, { error: { message: 'Bad request' } }));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        await expect(client.sendRequest('hello', new AbortController().signal)).rejects.toThrow(
            /check your API key/i,
        );
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws without retry on 401', async () => {
        const mockFetch = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(401, { error: { message: 'Unauthorized' } }));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        await expect(client.sendRequest('hello', new AbortController().signal)).rejects.toThrow(
            /check your API key/i,
        );
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 and exhausts all attempts', async () => {
        vi.useFakeTimers();
        const mockFetch = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(429, { error: { message: 'Rate limit' } }));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        // Attach handler before advancing timers to avoid unhandled rejection
        const promise = client.sendRequest('hello', new AbortController().signal);
        const expectation = expect(promise).rejects.toThrow(/Rate limit/);
        await vi.runAllTimersAsync();
        await expectation;
        // 1 initial + 3 retries = 4 total
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('retries on 500 and exhausts all attempts', async () => {
        vi.useFakeTimers();
        const mockFetch = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(500, { error: { message: 'Server error' } }));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        const promise = client.sendRequest('hello', new AbortController().signal);
        const expectation = expect(promise).rejects.toThrow();
        await vi.runAllTimersAsync();
        await expectation;
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('succeeds on retry after initial 503', async () => {
        vi.useFakeTimers();
        const mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeJsonResponse(503, { error: { message: 'Unavailable' } }))
            .mockResolvedValueOnce(makeOkResponse('hello'));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        const promise = client.sendRequest('hello', new AbortController().signal);
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(client.extractText(result)).toBe('hello');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('times out and throws when request hangs', async () => {
        vi.useFakeTimers();
        // Make fetch signal-aware so it rejects when the timeout aborts
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
                return new Promise<Response>((_, reject) => {
                    (opts.signal as AbortSignal).addEventListener('abort', () =>
                        reject(new DOMException('Aborted', 'AbortError')),
                    );
                });
            }),
        );
        const client = makeClient();

        const promise = client.sendRequest('hello', new AbortController().signal, { timeoutMs: 100 });
        const expectation = expect(promise).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(200);
        await expectation;
    });
});

// ---------------------------------------------------------------------------
// streamRequest
// ---------------------------------------------------------------------------

describe('GeminiHttpClient.streamRequest', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('calls onChunk for each part and returns accumulated text', async () => {
        const parts = ['Hello', ', ', 'world'];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSseResponse(parts)));
        const client = makeClient();
        const chunks: string[] = [];

        const result = await client.streamRequest(
            'prompt',
            new AbortController().signal,
            (chunk) => chunks.push(chunk),
        );

        expect(chunks).toEqual(parts);
        expect(result).toBe(parts.join(''));
    });

    it('skips malformed SSE lines and continues', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: not-json\n\ndata: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
                    ),
                );
                controller.close();
            },
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
        );
        const client = makeClient();
        const chunks: string[] = [];

        const result = await client.streamRequest(
            'prompt',
            new AbortController().signal,
            (chunk) => chunks.push(chunk),
        );

        expect(chunks).toEqual(['ok']);
        expect(result).toBe('ok');
    });

    it('throws when response body is null', async () => {
        const response = new Response(null, { status: 200 });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const client = makeClient();

        await expect(
            client.streamRequest('prompt', new AbortController().signal, () => {}),
        ).rejects.toThrow(ERROR_MESSAGES.RESPONSE_PARSE_FAILED);
    });

    it('does not call fetch when signal is already aborted', async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        const controller = new AbortController();
        controller.abort();
        const client = makeClient();

        await expect(
            client.streamRequest('prompt', controller.signal, () => {}),
        ).rejects.toThrow(ERROR_MESSAGES.CANCELLED);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retries on 429 during streaming and exhausts all attempts', async () => {
        vi.useFakeTimers();
        const mockFetch = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(429, { error: { message: 'Rate limit' } }));
        vi.stubGlobal('fetch', mockFetch);
        const client = makeClient();

        const promise = client.streamRequest('prompt', new AbortController().signal, () => {});
        const expectation = expect(promise).rejects.toThrow(/Rate limit/);
        await vi.runAllTimersAsync();
        await expectation;
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });
});
