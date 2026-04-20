const MAX_DICTIONARY_TERM_LENGTH = 50;

// A dictionary candidate is a single word made of letters from any script,
// optionally with internal hyphens or apostrophes. This catches:
//   - English: "translation", "well-known", "don't"
//   - Latin-script: "café", "naïve", "Müller"
//   - Cyrillic: "книга"
//   - CJK / Devanagari: short single tokens
// Phrases (containing whitespace) are excluded, as are inputs starting with
// non-letters (numbers, punctuation).
const DICTIONARY_CANDIDATE_REGEX = /^\p{L}[\p{L}\p{M}'’\-]*$/u;

/**
 * 入力文字列が辞書検索に適した語句かどうかを判定し、
 * キャッシュキーとして利用できる正規化済み文字列を返します。
 * 条件を満たさない場合は null を返します。
 */
export function normalizeDictionaryTerm(text: string): string | null {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const trimmed = text.trim();
    if (
        trimmed.length === 0 ||
        trimmed.length > MAX_DICTIONARY_TERM_LENGTH ||
        /\s/.test(trimmed)
    ) {
        return null;
    }

    if (!DICTIONARY_CANDIDATE_REGEX.test(trimmed)) {
        return null;
    }

    // toLocaleLowerCase handles Turkish I, German ß edge cases more correctly
    // than toLowerCase. CJK/Hangul are unaffected (no case).
    return trimmed.toLocaleLowerCase();
}

/**
 * 辞書モードの対象となり得る語句かどうかを簡易判定します。
 */
export function isDictionaryCandidate(text: string): boolean {
    return normalizeDictionaryTerm(text) !== null;
}
