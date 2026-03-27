/**
 * Utility functions for PDF Inline Translate plugin
 */

// DOM utility functions
export function isValidRect(rect: any): boolean {
    return (
        rect &&
        typeof rect.top === 'number' &&
        typeof rect.left === 'number' &&
        typeof rect.height === 'number' &&
        typeof rect.width === 'number' &&
        typeof rect.right === 'number' &&
        typeof rect.bottom === 'number' &&
        typeof rect.x === 'number' &&
        typeof rect.y === 'number'
    );
}

export function createPlainRect(domRect: any): any | null {
    if (!domRect) return null;

    const top = Number(domRect.top) || 0;
    const left = Number(domRect.left) || 0;
    const width = Number(domRect.width) || 0;
    const height = Number(domRect.height) || 0;
    const bottom = Number(domRect.bottom) || 0;
    const right = Number(domRect.right) || 0;
    const x = Number(domRect.x) || 0;
    const y = Number(domRect.y) || 0;

    return {
        top,
        left,
        width,
        height,
        bottom,
        right,
        x,
        y,
        toJSON: () => {},
    };
}

export function calculateBoundsFromClientRects(range: Range): any | null {
    if (typeof range.getClientRects !== 'function') {
        return null;
    }

    let rawRects;
    try {
        rawRects = range.getClientRects?.();
    } catch (error) {
        console.error('PDF Inline Translate: Failed to get client rectangles', error);
        return null;
    }

    if (!rawRects || rawRects.length === 0) {
        return null;
    }

    let rects;
    try {
        rects = Array.from(rawRects);
    } catch (error) {
        console.error('PDF Inline Translate: Failed to convert client rectangles to array', error);
        return null;
    }

    if (rects.length === 0) {
        return null;
    }

    let top = Number(rects[0].top) || 0;
    let left = Number(rects[0].left) || 0;
    let right = Number(rects[0].right) || 0;
    let bottom = Number(rects[0].bottom) || 0;

    for (const item of rects) {
        if (item) {
            const itemTop = Number(item.top) || 0;
            const itemLeft = Number(item.left) || 0;
            const itemRight = Number(item.right) || 0;
            const itemBottom = Number(item.bottom) || 0;

            // Validate the values before using them
            if (isNaN(itemTop) || isNaN(itemLeft) || isNaN(itemRight) || isNaN(itemBottom)) {
                continue; // Skip invalid rectangle data
            }

            top = Math.min(top, itemTop);
            left = Math.min(left, itemLeft);
            right = Math.max(right, itemRight);
            bottom = Math.max(bottom, itemBottom);
        }
    }

    return {
        top: Number(top),
        left: Number(left),
        width: Math.abs(Number(right - left)),
        height: Math.abs(Number(bottom - top)),
        bottom: Number(bottom),
        right: Number(right),
        x: Number(left),
        y: Number(top),
        toJSON: () => {},
    };
}

// Number utility functions
export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

// Debounce utility function
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeout: number | null = null;

    return function executedFunction(...args: Parameters<T>): void {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout !== null) {
            window.clearTimeout(timeout);
        }

        timeout = window.setTimeout(later, wait);
    };
}

// Safe DOM manipulation utilities
export function safeGetSelection(): Selection | null {
    try {
        return window.getSelection?.() || null;
    } catch (error) {
        console.debug('PDF Inline Translate: Failed to get selection', error);
        return null;
    }
}

export function safeGetRangeAt(selection: Selection, index: number = 0): Range | null {
    try {
        return selection.getRangeAt(index);
    } catch (error) {
        console.debug('PDF Inline Translate: Failed to get range at index', error);
        return null;
    }
}

// Safe number parsing
export function safeParseNumber(value: any, defaultValue: number = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    return defaultValue;
}

// Enhanced error reporting function
export function reportError(message: string, error: any, context?: string): void {
    let fullMessage = message;
    if (context) {
        fullMessage = `${context}: ${message}`;
    }

    console.error(`PDF Inline Translate: ${fullMessage}`, error);

    // Log to the history if available
    // (This would be used in context where the plugin instance is available)
}

// Validation utilities
export function isValidApiKey(key: string): boolean {
    return Boolean(
        typeof key === 'string' && key.trim().length > 0 && key.startsWith('AIza'),
    );
}

export function isValidModelName(name: string): boolean {
    return Boolean(typeof name === 'string' && name.trim().length > 0);
}

export function isValidTargetLanguage(lang: string): boolean {
    return Boolean(typeof lang === 'string' && lang.trim().length > 0);
}

// String utility
export function validateAndTrim(value: any, fallbackValue: string = ''): string {
    if (typeof value === 'string') {
        return value.trim();
    }
    return fallbackValue;
}

export function splitTextForBatch(text: string): string[] {
    // Split text by paragraphs or sentences, but preserve sentence structure
    // Limit each segment to avoid API limits
    const maxSegmentLength = 1000; // Adjust based on API limits

    // First, split by paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    const segments: string[] = [];

    for (const paragraph of paragraphs) {
        if (paragraph.length <= maxSegmentLength) {
            segments.push(paragraph.trim());
        } else {
            // If paragraph is too long, split by sentences
            const sentences = paragraph.split(/(?<=[.!?])\s+/);
            let currentSegment = '';

            for (const sentence of sentences) {
                if ((currentSegment + ' ' + sentence).length > maxSegmentLength) {
                    if (currentSegment) {
                        segments.push(currentSegment.trim());
                    }
                    currentSegment = sentence;
                } else {
                    currentSegment = currentSegment ? currentSegment + ' ' + sentence : sentence;
                }
            }

            if (currentSegment) {
                segments.push(currentSegment.trim());
            }
        }
    }

    // Filter out any empty segments
    return segments.filter((s) => s.length > 0);
}
