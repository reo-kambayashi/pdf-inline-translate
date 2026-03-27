import { TranslationContext } from '../types';
import { ERROR_MESSAGES } from '../constants';
import { isDictionaryCandidate } from '../utils/dictionary-utils';

export class TranslationClassifier {
    private cache = new Map<string, 'dictionary' | 'translation'>();

    async classify(
        text: string,
        _context: TranslationContext,
        abortSignal: AbortSignal,
    ): Promise<'dictionary' | 'translation'> {
        const normalizedKey = text.trim().toLowerCase();

        if (this.cache.has(normalizedKey)) {
            return this.cache.get(normalizedKey)!;
        }

        if (abortSignal.aborted) {
            throw new Error(ERROR_MESSAGES.CANCELLED);
        }

        const result = isDictionaryCandidate(text) ? 'dictionary' : 'translation';
        this.cache.set(normalizedKey, result);
        return result;
    }

    seedFromHistory(normalizedKey: string, classification: 'dictionary' | 'translation'): void {
        this.cache.set(normalizedKey, classification);
    }

    getCached(normalizedKey: string): 'dictionary' | 'translation' | undefined {
        return this.cache.get(normalizedKey);
    }
}
