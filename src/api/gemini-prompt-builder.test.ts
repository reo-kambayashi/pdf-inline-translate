import { describe, it, expect } from 'vitest';
import { buildTranslationPrompt } from './gemini-prompt-builder';
import type { TranslationContext } from '../types';

const baseSettings = {
    translationPromptTemplate: 'Translate {{text}} to {{targetLanguage}} (page {{page}})',
    dictionaryPromptTemplate: 'Define {{text}} in {{targetLanguage}} (page {{page}})',
    targetLanguage: 'Japanese',
};

const context: TranslationContext = { pageNumber: 3 };

describe('buildTranslationPrompt', () => {
    it('substitutes {{text}}, {{targetLanguage}}, {{page}} for translation mode', () => {
        const result = buildTranslationPrompt('hello', context, 'translation', baseSettings);
        expect(result).toBe('Translate hello to Japanese (page 3)');
    });

    it('uses dictionaryPromptTemplate for dictionary classification', () => {
        const result = buildTranslationPrompt('hello', context, 'dictionary', baseSettings);
        expect(result).toBe('Define hello in Japanese (page 3)');
    });

    it('replaces {{page}} with N/A when pageNumber is undefined', () => {
        const result = buildTranslationPrompt('hello', {} as TranslationContext, 'translation', baseSettings);
        expect(result).toBe('Translate hello to Japanese (page N/A)');
    });

    it('replaces {{page}} with N/A when pageNumber is null', () => {
        const result = buildTranslationPrompt(
            'hello',
            { pageNumber: null as unknown as number },
            'translation',
            baseSettings,
        );
        expect(result).toBe('Translate hello to Japanese (page N/A)');
    });

    it('replaces all occurrences of each placeholder', () => {
        const settings = {
            translationPromptTemplate: '{{text}} {{text}} → {{targetLanguage}} p{{page}} p{{page}}',
            dictionaryPromptTemplate: '',
            targetLanguage: 'EN',
        };
        const result = buildTranslationPrompt('word', { pageNumber: 1 }, 'translation', settings);
        expect(result).toBe('word word → EN p1 p1');
    });

    it('handles an empty template gracefully', () => {
        const settings = { ...baseSettings, translationPromptTemplate: '' };
        const result = buildTranslationPrompt('hello', context, 'translation', settings);
        expect(result).toBe('');
    });

    it('handles template with no placeholders', () => {
        const settings = { ...baseSettings, translationPromptTemplate: 'static text' };
        const result = buildTranslationPrompt('hello', context, 'translation', settings);
        expect(result).toBe('static text');
    });
});
