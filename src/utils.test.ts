import { describe, it, expect } from 'vitest';
import { splitTextForBatch, isValidRect, createPlainRect } from './utils';

describe('splitTextForBatch', () => {
    it('should split text by paragraphs', () => {
        const text = 'Paragraph 1.\n\nParagraph 2.';
        const segments = splitTextForBatch(text);
        expect(segments).toEqual(['Paragraph 1.', 'Paragraph 2.']);
    });

    it('should not split short paragraphs', () => {
        const text = 'This is a short paragraph.';
        const segments = splitTextForBatch(text);
        expect(segments).toEqual(['This is a short paragraph.']);
    });

    it('should split long paragraphs by sentences', () => {
        const text = 'This is a very long sentence that should be split. This is another long sentence that should also be split.'.repeat(20);
        const segments = splitTextForBatch(text);
        expect(segments.length).toBeGreaterThan(1);
    });

    it('should handle empty strings', () => {
        const text = '';
        const segments = splitTextForBatch(text);
        expect(segments).toEqual([]);
    });

    it('should handle text with only whitespace', () => {
        const text = '   \n\n   ';
        const segments = splitTextForBatch(text);
        expect(segments).toEqual([]);
    });
});

describe('isValidRect', () => {
    it('returns true for an object with all required numeric fields', () => {
        expect(
            isValidRect({ top: 0, left: 0, height: 10, width: 10, right: 10, bottom: 10, x: 0, y: 0 }),
        ).toBe(true);
    });

    it('returns false when a field is missing', () => {
        expect(isValidRect({ top: 0, left: 0, height: 10, width: 10, right: 10, bottom: 10, x: 0 })).toBe(
            false,
        );
    });

    it('returns false when a field is not a number', () => {
        expect(
            isValidRect({ top: '0', left: 0, height: 10, width: 10, right: 10, bottom: 10, x: 0, y: 0 }),
        ).toBe(false);
    });

    it('returns falsy for null', () => {
        expect(isValidRect(null)).toBeFalsy();
    });

    it('returns falsy for undefined', () => {
        expect(isValidRect(undefined)).toBeFalsy();
    });
});

describe('createPlainRect', () => {
    it('returns null for null input', () => {
        expect(createPlainRect(null)).toBeNull();
    });

    it('converts numeric fields from the input object', () => {
        const rect = createPlainRect({ top: 5, left: 10, width: 100, height: 50, bottom: 55, right: 110, x: 10, y: 5 });
        expect(rect).toMatchObject({ top: 5, left: 10, width: 100, height: 50 });
    });

    it('defaults non-numeric fields to 0', () => {
        const rect = createPlainRect({ top: undefined, left: NaN, width: null, height: 0, bottom: 0, right: 0, x: 0, y: 0 });
        expect(rect.top).toBe(0);
        expect(rect.left).toBe(0);
        expect(rect.width).toBe(0);
    });

    it('includes a toJSON function', () => {
        const rect = createPlainRect({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0, x: 0, y: 0 });
        expect(typeof rect.toJSON).toBe('function');
    });
});
