import PdfInlineTranslatePlugin from "./main";
import {
  AUTO_TRANSLATE_DEBOUNCE_MS,
  AUTO_TRANSLATE_REPEAT_THRESHOLD_MS,
} from "./constants";
import { TranslationContext } from "./types";

export class SelectionManager {
  private plugin: PdfInlineTranslatePlugin;
  private autoTranslateTimer: number | null = null;
  private lastAutoTranslateKey: string | null = null;
  private lastAutoTranslateTriggeredAt: number = 0;
  isPointerSelecting: boolean = false;
  private manuallyClosedSelectionKey: string | null = null;
  private ignoreNextSelectionCheck: boolean = false;

  constructor(plugin: PdfInlineTranslatePlugin) {
    this.plugin = plugin;
  }

  onload() {
    this.plugin.registerDomEvent(document, "selectionchange", () => {
      this.scheduleAutoTranslateCheck();
    });

    this.plugin.registerDomEvent(document, "pointerdown", (event: PointerEvent) => {
      this.cancelAutoTranslateTimer();
      if (this.isEventInsidePluginUi(event)) {
        this.isPointerSelecting = false;
        this.ignoreNextSelectionCheck = true;
        return;
      }
      this.isPointerSelecting = true;
      this.ignoreNextSelectionCheck = false;
    });

    this.plugin.registerDomEvent(document, "pointerup", (event: PointerEvent) => {
      const interactedWithUi = this.isEventInsidePluginUi(event);
      const shouldSkipCheck = interactedWithUi || this.ignoreNextSelectionCheck;
      this.ignoreNextSelectionCheck = false;
      this.isPointerSelecting = false;
      if (shouldSkipCheck) {
        return;
      }
      this.scheduleAutoTranslateCheck();
    });

    this.plugin.registerDomEvent(document, "pointercancel", () => {
      this.resetPointerSelectionState();
    });

    this.plugin.registerDomEvent(window, "blur", () => {
      this.resetPointerSelectionState();
    });
  }

  onunload() {
    this.cancelAutoTranslateTimer();
    this.isPointerSelecting = false;
  }

  private resetPointerSelectionState() {
    this.isPointerSelecting = false;
    this.ignoreNextSelectionCheck = false;
  }

  private cancelAutoTranslateTimer() {
    if (this.autoTranslateTimer) {
      const cancelTimer = window?.clearTimeout ?? clearTimeout;
      cancelTimer(this.autoTranslateTimer);
      this.autoTranslateTimer = null;
    }
  }

  scheduleAutoTranslateCheck(delay: number = AUTO_TRANSLATE_DEBOUNCE_MS) {
    if (this.ignoreNextSelectionCheck) {
      return;
    }
    if (
      typeof document !== "undefined" &&
      typeof document.hasFocus === "function" &&
      !document.hasFocus()
    ) {
      return;
    }
    
    this.cancelAutoTranslateTimer();
    
    const schedule = window?.setTimeout ?? setTimeout;
    this.autoTranslateTimer = schedule(() => {
      this.autoTranslateTimer = null;
      this.handleSelectionForAutoTranslate();
    }, Math.max(0, delay));
  }

  private shouldSkipSelection(text: string, context: TranslationContext | null): boolean {
    if (!text) {
      if (this.plugin.floatingPopup?.hasPersistentState()) {
        return true;
      }
      this.plugin.closeFloatingPopup();
      if (this.manuallyClosedSelectionKey) {
        this.manuallyClosedSelectionKey = null;
      }
      return true;
    }

    if (!context) {
      if (this.plugin.floatingPopup?.hasPersistentState()) {
        return true;
      }
      this.plugin.closeFloatingPopup();
      if (this.manuallyClosedSelectionKey) {
        this.manuallyClosedSelectionKey = null;
      }
      return true;
    }

    return false;
  }

  private shouldSkipAutoTranslate(key: string): boolean {
    if (this.manuallyClosedSelectionKey === key) {
      return true;
    }

    const now = Date.now();
    if (
      this.lastAutoTranslateKey === key &&
      now - this.lastAutoTranslateTriggeredAt <
        AUTO_TRANSLATE_REPEAT_THRESHOLD_MS
    ) {
      return true;
    }

    return false;
  }

  handleSelectionForAutoTranslate() {
    if (this.isPointerSelecting) {
      this.scheduleAutoTranslateCheck();
      return;
    }

    const selection = window.getSelection?.();
    if (!selection) {
      return;
    }
    
    const text = selection.toString?.().trim() || "";
    const context = this.resolvePdfSelectionContext(selection, text);

    if (this.shouldSkipSelection(text, context)) {
      return;
    }

    const key = `${context?.pageNumber ?? "N/A"}|${text}`;
    const now = Date.now();

    if (this.shouldSkipAutoTranslate(key)) {
      return;
    }

    this.manuallyClosedSelectionKey = null;
    this.lastAutoTranslateKey = key;
    this.lastAutoTranslateTriggeredAt = now;
    this.plugin.openTranslation(text, context);
  }

  prepareContext(context: TranslationContext): TranslationContext {
    const base = context && typeof context === "object" ? { ...context } : {};
    if (!base.rect) {
      const rect = this.getActiveSelectionRect();
      if (rect) {
        base.rect = rect;
      }
    }
    return base;
  }

  getActiveSelectionRect(): DOMRect | null {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    try {
      const range = selection.getRangeAt(0);
      return this.extractRectFromRange(range);
    } catch (error) {
      console.debug("PDF Inline Translate: selection rect取得失敗", error);
      return null;
    }
  }

  private createPlainRect(domRect: any): any | null {
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

  private calculateBoundsFromClientRects(range: Range): any | null {
    if (typeof range.getClientRects !== "function") {
      return null;
    }
    
    const rawRects = range.getClientRects?.();
    if (!rawRects || rawRects.length === 0) {
      return null;
    }
    
    const rects = Array.from(rawRects);
    if (rects.length === 0) {
      return null;
    }
    
    let top = Number(rects[0].top) || 0;
    let left = Number(rects[0].left) || 0;
    let right = Number(rects[0].right) || 0;
    let bottom = Number(rects[0].bottom) || 0;
    
    for (const item of rects) {
      if (item) {
        top = Math.min(top, Number(item.top) || 0);
        left = Math.min(left, Number(item.left) || 0);
        right = Math.max(right, Number(item.right) || 0);
        bottom = Math.max(bottom, Number(item.bottom) || 0);
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

  extractRectFromRange(range: Range): DOMRect | null {
    if (!range || typeof range.getBoundingClientRect !== "function") {
      return null;
    }
    
    let rect;
    try {
      rect = range.getBoundingClientRect();
    } catch (error) {
      console.debug("PDF Inline Translate: bounding rect取得失敗", error);
      return null;
    }
    
    if (!rect) {
      return null;
    }

    // If the rectangle has meaningful dimensions, use it directly
    if (rect.width > 0 || rect.height > 0) {
      return this.createPlainRect(rect);
    }

    // Otherwise, compute a bounding rectangle from client rectangles
    return this.calculateBoundsFromClientRects(range);
  }

  resolvePdfSelectionContext(selection: Selection, text: string): TranslationContext | null {
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    
    let range;
    try {
      range = selection.getRangeAt(0);
    } catch (error) {
      console.debug("PDF Inline Translate: selection range取得失敗", error);
      return null;
    }

    if (!range) {
      return null;
    }
    
    const candidateElement = this.findPdfSelectionElement(
      range.commonAncestorContainer,
    );
    if (!candidateElement) {
      return null;
    }

    const pageElement = candidateElement.closest?.("[data-page-number]");
    if (!pageElement) {
      return null;
    }

    const pageAttr = pageElement.getAttribute("data-page-number");
    const pageNumber = Number(pageAttr);
    const context: TranslationContext = {
      selection: text,
    };
    if (Number.isFinite(pageNumber) && pageNumber > 0) {
      context.pageNumber = pageNumber;
    }
    const rect = this.extractRectFromRange(range);
    if (rect) {
      context.rect = rect;
    }
    return context;
  }

  private isPdfPageElement(element: Element): boolean {
    return element.matches?.(".page, [data-page-number]") || false;
  }

  private findPdfViewer(element: Element): Element | null {
    return element.closest?.(
      ".pdf-viewer, .pdfViewer, .pdf-plus-viewer, .pdf-plus-root, .obsidian-pdf-view",
    ) ??
    element.closest?.(
      '[data-type="pdf"], [data-type="pdf-plus"]',
    ) ?? null;
  }

  findPdfSelectionElement(node: Node): HTMLElement | null {
    if (!node) {
      return null;
    }
    
    let element =
      node instanceof Element ? (node as HTMLElement) : node?.parentElement;
    
    while (element) {
      if (element.nodeType !== Node.ELEMENT_NODE) {
        element = element.parentElement;
        continue;
      }
      
      if (this.isPdfPageElement(element)) {
        const viewer = this.findPdfViewer(element);
        if (viewer) {
          return element;
        }
      }
      element = element.parentElement;
    }
    return null;
  }

  setManuallyClosedSelectionKey(key: string | null) {
    this.manuallyClosedSelectionKey = key;
  }

  getLastAutoTranslateKey(): string | null {
    return this.lastAutoTranslateKey;
  }

  private isEventInsidePluginUi(event: Event): boolean {
    if (!event || !event.target) {
      return false;
    }
    const popup = this.plugin.floatingPopup;
    if (!popup) {
      return false;
    }
    return popup.containsElement(event.target);
  }
}
