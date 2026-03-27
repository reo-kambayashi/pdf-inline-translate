import { TranslationContext } from '../types';
import { POPUP_DEFAULT_TOP, POPUP_OFFSET } from './constants';
import { isValidRect as utilsIsValidRect, clamp as utilsClamp } from '../utils';

export class PopupPositioner {
    private lastPosition: { top: number; left: number } | null = null;

    constructor(private getContainer: () => HTMLElement | null) {}

    setPositionFromContext(context: TranslationContext): void {
        const container = this.getContainer();
        if (!container) return;

        let rect: { top: number; left: number; height: number; width: number } | null = null;
        if (context?.rect && utilsIsValidRect(context.rect)) {
            const rectData = context.rect;
            if (
                typeof rectData.top === 'number' &&
                typeof rectData.left === 'number' &&
                typeof rectData.height === 'number' &&
                typeof rectData.width === 'number' &&
                !isNaN(rectData.top) &&
                !isNaN(rectData.left) &&
                !isNaN(rectData.height) &&
                !isNaN(rectData.width)
            ) {
                rect = {
                    top: Number(rectData.top),
                    left: Number(rectData.left),
                    height: Number(rectData.height),
                    width: Number(rectData.width),
                };
            }
        }

        const schedule = window?.requestAnimationFrame ?? ((fn: FrameRequestCallback) => setTimeout(fn, 16));
        schedule(() => {
            const c = this.getContainer();
            if (!c) return;

            if (rect) {
                const top = Number(rect.top) + Number(rect.height) + POPUP_OFFSET;
                const left = Number(rect.left);
                if (!isNaN(top) && !isNaN(left) && isFinite(top) && isFinite(left)) {
                    this.applyPosition(top, left);
                    return;
                }
            }

            if (this.lastPosition) {
                this.applyPosition(this.lastPosition.top, this.lastPosition.left);
            } else {
                const c2 = this.getContainer();
                const defaultLeft = window.innerWidth - (c2?.offsetWidth || 300) - POPUP_OFFSET;
                this.applyPosition(POPUP_DEFAULT_TOP, defaultLeft);
            }
        });
    }

    applyPosition(top: number, left: number): void {
        const container = this.getContainer();
        if (!container) return;

        if (
            typeof top !== 'number' ||
            typeof left !== 'number' ||
            isNaN(top) ||
            isNaN(left) ||
            !isFinite(top) ||
            !isFinite(left)
        ) {
            console.warn('PDF Inline Translate: 無効なポジション値が検出されました', { top, left });
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width || container.offsetWidth || 300;
        const containerHeight = containerRect.height || container.offsetHeight || 200;

        const maxTop = window.innerHeight - containerHeight - POPUP_OFFSET;
        const maxLeft = window.innerWidth - containerWidth - POPUP_OFFSET;
        const clampedTop = utilsClamp(top, POPUP_OFFSET, Math.max(POPUP_OFFSET, maxTop));
        const clampedLeft = utilsClamp(left, POPUP_OFFSET, Math.max(POPUP_OFFSET, maxLeft));

        if (isFinite(clampedTop) && isFinite(clampedLeft)) {
            container.style.top = `${clampedTop}px`;
            container.style.left = `${clampedLeft}px`;
            this.lastPosition = { top: clampedTop, left: clampedLeft };
        }
    }

    getLastPosition(): { top: number; left: number } | null {
        return this.lastPosition;
    }
}
