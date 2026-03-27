import { PdfInlineTranslatePluginSettings, TranslationContext } from '../types';

export function buildTranslationPrompt(
    text: string,
    context: TranslationContext,
    classification: 'dictionary' | 'translation',
    settings: Pick<PdfInlineTranslatePluginSettings, 'translationPromptTemplate' | 'dictionaryPromptTemplate' | 'targetLanguage'>,
): string {
    const template =
        classification === 'dictionary'
            ? settings.dictionaryPromptTemplate
            : settings.translationPromptTemplate;

    return (template ?? '')
        .replaceAll('{{text}}', text)
        .replaceAll('{{targetLanguage}}', settings.targetLanguage)
        .replaceAll('{{page}}', context?.pageNumber != null ? String(context.pageNumber) : 'N/A');
}

export function buildClassificationPrompt(text: string, context: TranslationContext): string {
    const pageInfo = context?.pageNumber != null ? `Page: ${context.pageNumber}` : 'Page: unknown';

    return `Classify whether the user expects a dictionary-style lexical explanation or a standard translation.
Output only the single lowercase word "dictionary" or "translation".
Choose "dictionary" for single words, idioms, or short terms that benefit from parts-of-speech, definitions, phonetics, or usage notes. Choose "translation" for sentences, paragraphs, or when contextual translation is better.

${pageInfo}
Original text:
"""${text.trim()}"""`;
}

export function parseClassificationResponse(raw: string): 'dictionary' | 'translation' | null {
    if (!raw || typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'dictionary' || normalized.startsWith('dictionary')) return 'dictionary';
    if (normalized === 'translation' || normalized.startsWith('translation')) return 'translation';
    return null;
}
