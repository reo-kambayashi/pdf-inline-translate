import { describe, it, expect } from 'vitest';
import { splitTextForBatch } from './utils';

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
