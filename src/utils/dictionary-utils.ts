const MAX_DICTIONARY_TERM_LENGTH = 50;
const DICTIONARY_CANDIDATE_REGEX = /^[A-Za-z][A-Za-z'’\-]*$/;

/**
 * 入力文字列が辞書検索に適した英語語句かどうかを判定し、
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
        trimmed.includes(' ')
    ) {
        return null;
    }

    if (!DICTIONARY_CANDIDATE_REGEX.test(trimmed)) {
        return null;
    }

    return trimmed.toLowerCase();
}

/**
 * 辞書モードの対象となり得る語句かどうかを簡易判定します。
 */
export function isDictionaryCandidate(text: string): boolean {
    return normalizeDictionaryTerm(text) !== null;
}
