import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationHistoryManager } from './translation-history-manager';

// ---------------------------------------------------------------------------
// Plugin mock factory
// ---------------------------------------------------------------------------

function makePlugin(settingsOverrides: Record<string, any> = {}) {
    const plugin = {
        settings: {
            enableTranslationHistory: true,
            maxHistoryItems: 5,
            model: 'gemini-test',
            ...settingsOverrides,
        },
        translationHistory: { items: [] as any[] },
        saveSettings: vi.fn().mockResolvedValue(undefined),
    };
    return plugin;
}

function makeManager(plugin: ReturnType<typeof makePlugin>) {
    return new TranslationHistoryManager(plugin as any);
}

// ---------------------------------------------------------------------------
// addToHistory
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.addToHistory', () => {
    it('does nothing when history is disabled', () => {
        const plugin = makePlugin({ enableTranslationHistory: false });
        const mgr = makeManager(plugin);
        mgr.addToHistory('text', 'translation', 'ja');
        expect(plugin.translationHistory.items).toHaveLength(0);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('adds item to the beginning (most-recent-first)', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('first', 'one', 'ja');
        mgr.addToHistory('second', 'two', 'ja');
        const items = mgr.getHistory();
        expect(items[0].original).toBe('second');
        expect(items[1].original).toBe('first');
    });

    it('trims history to maxHistoryItems', () => {
        const plugin = makePlugin({ maxHistoryItems: 3 });
        const mgr = makeManager(plugin);
        for (let i = 0; i < 5; i++) {
            mgr.addToHistory(`text${i}`, `trans${i}`, 'ja');
        }
        expect(mgr.getHistory()).toHaveLength(3);
    });

    it('records isDictionary flag', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja', undefined, undefined, true);
        expect(mgr.getHistory()[0].isDictionary).toBe(true);
    });

    it('calls saveSettings after adding', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        expect(plugin.saveSettings).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// getHistory / getRecent
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.getHistory', () => {
    it('returns a copy, not the internal array reference', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        const a = mgr.getHistory();
        const b = mgr.getHistory();
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

describe('TranslationHistoryManager.getRecent', () => {
    it('returns at most count items', () => {
        const plugin = makePlugin({ maxHistoryItems: 10 });
        const mgr = makeManager(plugin);
        for (let i = 0; i < 5; i++) mgr.addToHistory(`text${i}`, `trans${i}`, 'ja');
        expect(mgr.getRecent(3)).toHaveLength(3);
    });

    it('returns all items when count exceeds history length', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        expect(mgr.getRecent(100)).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// searchHistory
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.searchHistory', () => {
    let mgr: TranslationHistoryManager;

    beforeEach(() => {
        const plugin = makePlugin({ maxHistoryItems: 20 });
        mgr = makeManager(plugin);
        mgr.addToHistory('Hello World', 'こんにちは世界', 'ja');
        mgr.addToHistory('good morning', 'おはようございます', 'ja');
        mgr.addToHistory('sushi', 'すし', 'ja');
    });

    it('returns empty array for empty search term', () => {
        expect(mgr.searchHistory('')).toEqual([]);
    });

    it('is case-insensitive', () => {
        expect(mgr.searchHistory('hello')).toHaveLength(1);
        expect(mgr.searchHistory('HELLO')).toHaveLength(1);
    });

    it('searches in original text by default (both)', () => {
        expect(mgr.searchHistory('sushi')).toHaveLength(1);
    });

    it('searches in translation when searchIn=translation', () => {
        const results = mgr.searchHistory('おはよう', 'translation');
        expect(results).toHaveLength(1);
        expect(results[0].original).toBe('good morning');
    });

    it('searches in original only when searchIn=original', () => {
        const results = mgr.searchHistory('morning', 'original');
        expect(results).toHaveLength(1);
    });

    it('returns multiple matches', () => {
        const results = mgr.searchHistory('o'); // matches 'Hello World' and 'good morning'
        expect(results.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// findCachedTranslation
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.findCachedTranslation', () => {
    it('returns null when history is disabled', () => {
        const plugin = makePlugin({ settings: { enableTranslationHistory: false } });
        const mgr = makeManager(plugin);
        expect(mgr.findCachedTranslation('hello', 'ja')).toBeNull();
    });

    it('returns the matching item on cache hit', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        const found = mgr.findCachedTranslation('hello', 'ja');
        expect(found).not.toBeNull();
        expect(found!.translation).toBe('こんにちは');
    });

    it('returns null on text mismatch', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        expect(mgr.findCachedTranslation('goodbye', 'ja')).toBeNull();
    });

    it('returns null on language mismatch', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        expect(mgr.findCachedTranslation('hello', 'fr')).toBeNull();
    });

    it('filters by isDictionary=true', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'translation result', 'ja', undefined, undefined, false);
        expect(mgr.findCachedTranslation('hello', 'ja', { isDictionary: true })).toBeNull();
    });

    it('matches by isDictionary=false', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'translation result', 'ja', undefined, undefined, false);
        const found = mgr.findCachedTranslation('hello', 'ja', { isDictionary: false });
        expect(found).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// removeItem / clearHistory
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.removeItem', () => {
    it('returns true and removes the item when found', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        const id = mgr.getHistory()[0].id;
        expect(mgr.removeItem(id)).toBe(true);
        expect(mgr.getHistory()).toHaveLength(0);
    });

    it('returns false when item is not found', () => {
        const plugin = makePlugin({ maxHistoryItems: 10 });
        const mgr = makeManager(plugin);
        expect(mgr.removeItem('nonexistent-id')).toBe(false);
    });
});

describe('TranslationHistoryManager.clearHistory', () => {
    it('empties the history', () => {
        const plugin = makePlugin({ settings: { maxHistoryItems: 10 } });
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');
        mgr.addToHistory('world', '世界', 'ja');
        mgr.clearHistory();
        expect(mgr.getHistory()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// exportHistory / importHistory
// ---------------------------------------------------------------------------

describe('TranslationHistoryManager.exportHistory / importHistory', () => {
    it('roundtrips history through JSON', () => {
        const plugin = makePlugin({ maxHistoryItems: 10 });
        const mgr = makeManager(plugin);
        mgr.addToHistory('hello', 'こんにちは', 'ja');

        const json = mgr.exportHistory();
        mgr.clearHistory();
        expect(mgr.getHistory()).toHaveLength(0);

        const success = mgr.importHistory(json);
        expect(success).toBe(true);
        expect(mgr.getHistory()).toHaveLength(1);
        expect(mgr.getHistory()[0].original).toBe('hello');
    });

    it('returns false for invalid JSON', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        expect(mgr.importHistory('not valid json')).toBe(false);
    });

    it('returns false when JSON lacks items array', () => {
        const plugin = makePlugin();
        const mgr = makeManager(plugin);
        expect(mgr.importHistory(JSON.stringify({ notItems: [] }))).toBe(false);
    });
});
