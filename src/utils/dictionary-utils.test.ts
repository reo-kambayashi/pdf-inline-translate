import { describe, it, expect } from 'vitest';
import { normalizeDictionaryTerm, isDictionaryCandidate } from './dictionary-utils';

describe('normalizeDictionaryTerm', () => {
    it('returns lowercase for a valid single word', () => {
        expect(normalizeDictionaryTerm('Hello')).toBe('hello');
        expect(normalizeDictionaryTerm('WORLD')).toBe('world');
    });

    it('returns null for empty string', () => {
        expect(normalizeDictionaryTerm('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(normalizeDictionaryTerm('   ')).toBeNull();
    });

    it('returns null for string with a space', () => {
        expect(normalizeDictionaryTerm('hello world')).toBeNull();
    });

    it('returns null for string exceeding 50 characters', () => {
        expect(normalizeDictionaryTerm('a'.repeat(51))).toBeNull();
    });

    it('accepts a 50-character string', () => {
        const term = 'a'.repeat(50);
        expect(normalizeDictionaryTerm(term)).toBe(term);
    });

    it('accepts words with hyphens', () => {
        expect(normalizeDictionaryTerm('well-known')).toBe('well-known');
    });

    it("accepts words with apostrophes (straight and curly)", () => {
        expect(normalizeDictionaryTerm("don't")).toBe("don't");
        expect(normalizeDictionaryTerm('don\u2019t')).toBe('don\u2019t');
    });

    it('returns null for non-English characters', () => {
        expect(normalizeDictionaryTerm('café')).toBeNull();
        expect(normalizeDictionaryTerm('日本語')).toBeNull();
    });

    it('returns null for a word starting with a non-letter (e.g. digit)', () => {
        expect(normalizeDictionaryTerm('1word')).toBeNull();
    });

    it('returns null for non-string input', () => {
        expect(normalizeDictionaryTerm(null as unknown as string)).toBeNull();
        expect(normalizeDictionaryTerm(undefined as unknown as string)).toBeNull();
    });
});

describe('isDictionaryCandidate', () => {
    it('returns true for a valid single word', () => {
        expect(isDictionaryCandidate('translation')).toBe(true);
    });

    it('returns false for a phrase with a space', () => {
        expect(isDictionaryCandidate('two words')).toBe(false);
    });

    it('returns false for an empty string', () => {
        expect(isDictionaryCandidate('')).toBe(false);
    });

    it('returns false for a word with non-English characters', () => {
        expect(isDictionaryCandidate('naïve')).toBe(false);
    });
});
