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

