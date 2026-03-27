export class PopupDragHandler {
    private dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
    private readonly boundOnDrag: (event: PointerEvent) => void;
    private readonly boundOnDragEnd: (event: PointerEvent) => void;

    constructor(
        private getContainer: () => HTMLElement | null,
        private onMove: (top: number, left: number) => void,
    ) {
        this.boundOnDrag = this.onDrag.bind(this);
        this.boundOnDragEnd = this.onDragEnd.bind(this);
    }

    startDrag(event: PointerEvent): void {
        if (event.button !== 0) return;
        if (
            (event.target as HTMLElement).closest('.pdf-inline-translate__popup-close') ||
            (event.target as HTMLElement).closest('.pdf-inline-translate__popup-collapse')
        ) {
            return;
        }
        const container = this.getContainer();
        if (!container) return;

        event.preventDefault();
        const rect = container.getBoundingClientRect();
        this.dragState = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };
        container.classList.add('is-dragging');
        try {
            container.setPointerCapture?.(event.pointerId);
        } catch (error) {
            console.debug('PDF Inline Translate: pointer capture失敗', error);
        }
        document.addEventListener('pointermove', this.boundOnDrag);
        document.addEventListener('pointerup', this.boundOnDragEnd);
    }

    stopDragging(): void {
        const container = this.getContainer();
        if (container) {
            container.classList.remove('is-dragging');
        }
        this.dragState = null;
        document.removeEventListener('pointermove', this.boundOnDrag);
        document.removeEventListener('pointerup', this.boundOnDragEnd);
    }

    destroy(): void {
        this.stopDragging();
    }

    private onDrag(event: PointerEvent): void {
        if (!this.dragState) return;
        const top = event.clientY - this.dragState.offsetY;
        const left = event.clientX - this.dragState.offsetX;
        this.onMove(top, left);
    }

    private onDragEnd(): void {
        const container = this.getContainer();
        if (this.dragState?.pointerId != null && container) {
            try {
                container.releasePointerCapture?.(this.dragState.pointerId);
            } catch (error) {
                console.debug('PDF Inline Translate: pointer release失敗', error);
            }
        }
        this.stopDragging();
    }
}
