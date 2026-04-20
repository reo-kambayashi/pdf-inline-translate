import { describe, it, expect } from 'vitest';
import { buildTranslationPrompt } from './gemini-prompt-builder';
import type { TranslationContext } from '../types';

const baseSettings = { targetLanguage: 'Japanese' };
const context: TranslationContext = { pageNumber: 3 };

describe('buildTranslationPrompt', () => {
    it('uses the translation template for "translation" classification', () => {
        const result = buildTranslationPrompt('hello', context, 'translation', baseSettings);
        expect(result).toContain('hello');
        expect(result).toContain('Japanese');
        expect(result).toContain('ページ 3');
        // Translation-specific markers from TRANSLATION_PROMPT_TEMPLATE.
        expect(result).toContain('PDF抜粋');
        expect(result).not.toContain('辞書カード');
    });

    it('uses the dictionary template for "dictionary" classification', () => {
        const result = buildTranslationPrompt('hello', context, 'dictionary', baseSettings);
        expect(result).toContain('hello');
        expect(result).toContain('Japanese');
        expect(result).toContain('辞書カード');
        expect(result).not.toContain('PDF抜粋');
    });

    it('substitutes {{page}} with "N/A" when pageNumber is missing', () => {
        const result = buildTranslationPrompt('hello', {} as TranslationContext, 'translation', baseSettings);
        expect(result).toContain('ページ N/A');
    });

    it('substitutes {{page}} with "N/A" when pageNumber is null', () => {
        const result = buildTranslationPrompt(
            'hello',
            { pageNumber: null as unknown as number },
            'translation',
            baseSettings,
        );
        expect(result).toContain('ページ N/A');
    });

    it('pre-cleans PDF noise in translation mode (hyphenation, mid-line break)', () => {
        const input = 'trans-\nlation\nof text';
        const result = buildTranslationPrompt(input, context, 'translation', baseSettings);
        expect(result).toContain('translation of text');
        expect(result).not.toContain('trans-');
    });

    it('preserves the original form in dictionary mode (no pre-cleaning)', () => {
        const input = 'naïve';
        const result = buildTranslationPrompt(input, context, 'dictionary', baseSettings);
        expect(result).toContain('naïve');
    });

    it('replaces every occurrence of {{targetLanguage}}', () => {
        const result = buildTranslationPrompt('hello', context, 'dictionary', { targetLanguage: 'EN' });
        expect(result).not.toContain('{{targetLanguage}}');
        expect(result.split('EN').length).toBeGreaterThan(2);
    });
});
