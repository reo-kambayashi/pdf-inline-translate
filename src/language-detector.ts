/**
 * Simple language detection based on character patterns and common words
 */
export class LanguageDetector {
    /**
     * Detect the language of the given text
     * @param text The text to analyze
     * @returns Detected language code (e.g., 'en', 'ja', 'zh', 'ko', 'fr', etc.)
     */
    static detectLanguage(text: string): string {
        if (!text || typeof text !== 'string') {
            return 'unknown';
        }

        // Trim the text and take a sample for analysis
        const sample = text.trim().substring(0, 1000).toLowerCase();

        // Check for language-specific characters/patterns first
        if (this.containsJapaneseCharacters(sample)) {
            return 'ja';
        } else if (this.containsChineseCharacters(sample)) {
            return 'zh';
        } else if (this.containsKoreanCharacters(sample)) {
            return 'ko';
        } else if (this.containsArabicCharacters(sample)) {
            return 'ar';
        } else if (this.containsRussianCharacters(sample)) {
            return 'ru';
        } else if (this.containsThaiCharacters(sample)) {
            return 'th';
        }

        // If no specific characters found, use common words detection
        const languageScores = this.analyzeCommonWords(sample);

        // Find the language with the highest score
        let detectedLang = 'unknown';
        let highestScore = 0;

        for (const [lang, score] of Object.entries(languageScores)) {
            if (score > highestScore) {
                highestScore = score;
                detectedLang = lang;
            }
        }

        // If no language has a significant score, return 'en' as default
        return highestScore > 0 ? detectedLang : 'en';
    }

    /**
     * Check if text contains Japanese characters (Hiragana, Katakana, or Kanji)
     */
    private static containsJapaneseCharacters(text: string): boolean {
        // Hiragana: \u3040-\u309F
        // Katakana: \u30A0-\u30FF
        // Kanji: \u4E00-\u9FFF
        const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
        return japaneseRegex.test(text);
    }

    /**
     * Check if text contains Chinese characters (Simplified or Traditional)
     */
    private static containsChineseCharacters(text: string): boolean {
        // Chinese characters: \u4E00-\u9FFF (covers both simplified and traditional)
        const chineseRegex = /[\u4E00-\u9FFF]/;
        return chineseRegex.test(text);
    }

    /**
     * Check if text contains Korean characters (Hangul)
     */
    private static containsKoreanCharacters(text: string): boolean {
        // Hangul Syllables: \uAC00-\uD7AF
        // Hangul Jamo: \u1100-\u11FF
        // Hangul Compatibility Jamo: \u3130-\u318F
        const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
        return koreanRegex.test(text);
    }

    /**
     * Check if text contains Arabic characters
     */
    private static containsArabicCharacters(text: string): boolean {
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        return arabicRegex.test(text);
    }

    /**
     * Check if text contains Russian characters (Cyrillic)
     */
    private static containsRussianCharacters(text: string): boolean {
        const russianRegex = /[\u0400-\u04FF]/;
        return russianRegex.test(text);
    }

    /**
     * Check if text contains Thai characters
     */
    private static containsThaiCharacters(text: string): boolean {
        const thaiRegex = /[\u0E00-\u0E7F]/;
        return thaiRegex.test(text);
    }

    /**
     * Analyze common words for language detection
     */
    private static analyzeCommonWords(text: string): Record<string, number> {
        const languageScores: Record<string, number> = {
            en: 0, // English
            es: 0, // Spanish
            fr: 0, // French
            de: 0, // German
            it: 0, // Italian
            pt: 0, // Portuguese
            ru: 0, // Russian
            ar: 0, // Arabic
            hi: 0, // Hindi
            ja: 0, // Japanese (for words)
            ko: 0, // Korean (for words)
            zh: 0, // Chinese (for words)
        };

        // Define common words for each language
        const commonWords: Record<string, string[]> = {
            en: [
                'the',
                'be',
                'to',
                'of',
                'and',
                'a',
                'in',
                'that',
                'have',
                'i',
                'it',
                'for',
                'not',
                'on',
                'with',
                'he',
                'as',
                'you',
                'do',
                'at',
            ],
            es: [
                'el',
                'la',
                'de',
                'que',
                'y',
                'a',
                'en',
                'un',
                'es',
                'se',
                'no',
                'te',
                'lo',
                'le',
                'da',
                'si',
                'me',
                'ya',
                'por',
                'qué',
            ],
            fr: [
                'le',
                'de',
                'et',
                'à',
                'un',
                'il',
                'être',
                'et',
                'en',
                'avoir',
                'que',
                'pour',
                'dans',
                'je',
                'son',
                'ce',
                'la',
                'ne',
                'sur',
                'se',
            ],
            de: [
                'der',
                'die',
                'und',
                'in',
                'den',
                'von',
                'zu',
                'das',
                'nicht',
                'sie',
                'ist',
                'des',
                'es',
                'ein',
                'eine',
                'f체r',
                'auch',
                'sich',
                'auf',
                'so',
            ],
            it: [
                'il',
                'di',
                'e',
                'la',
                'che',
                'per',
                'una',
                'in',
                'il',
                'da',
                'con',
                'non',
                'sono',
                'che',
                'il',
                'del',
                'le',
                'il',
                'si',
                'ci',
            ],
            pt: [
                'o',
                'de',
                'a',
                'e',
                'do',
                'da',
                'em',
                'um',
                'para',
                'foi',
                'com',
                'não',
                'uma',
                'os',
                'no',
                'se',
                'na',
                'por',
                'mais',
                'as',
            ],
        };

        // Count matches for each language
        for (const [lang, words] of Object.entries(commonWords)) {
            for (const word of words) {
                // Count occurrences of the word as a whole word
                const regex = new RegExp(`\\b${word}\\b`, 'g');
                const matches = text.match(regex);
                if (matches) {
                    languageScores[lang] += matches.length;
                }
            }
        }

        return languageScores;
    }
}
