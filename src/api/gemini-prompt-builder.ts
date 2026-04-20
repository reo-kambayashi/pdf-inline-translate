import { PdfInlineTranslatePluginSettings, TranslationContext } from '../types';
import { DICTIONARY_PROMPT_TEMPLATE, TRANSLATION_PROMPT_TEMPLATE } from '../constants';
import { cleanPdfText } from '../utils';

export function buildTranslationPrompt(
    text: string,
    context: TranslationContext,
    classification: 'dictionary' | 'translation',
    settings: Pick<PdfInlineTranslatePluginSettings, 'targetLanguage'>,
): string {
    const template =
        classification === 'dictionary'
            ? DICTIONARY_PROMPT_TEMPLATE
            : TRANSLATION_PROMPT_TEMPLATE;

    // Dictionary candidates are single words — no PDF noise to strip, and
    // preserving the exact form (e.g. capitalization) matters for the lookup.
    const preparedText =
        classification === 'translation' ? cleanPdfText(text) : text;

    return template
        .replaceAll('{{text}}', preparedText)
        .replaceAll('{{targetLanguage}}', settings.targetLanguage)
        .replaceAll('{{page}}', context?.pageNumber != null ? String(context.pageNumber) : 'N/A');
}

