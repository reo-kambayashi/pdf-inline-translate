import { Notice } from "obsidian";
import type { LocaleId, LocaleKey } from "../locales";
import { translate } from "../locales";

export interface PopupPosition {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface InlinePopupOptions {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  locale: LocaleId;
  position: PopupPosition;
  onClose?: () => void;
}

/**
 * 選択範囲付近に翻訳結果を表示するインラインポップアップ。
 */
export class TranslatableInlinePopup {
  private readonly options: InlinePopupOptions;
  private container: HTMLDivElement | null = null;
  private cleanup: Array<() => void> = [];

  constructor(options: InlinePopupOptions) {
    this.options = options;
  }

  open(): void {
    if (this.container) {
      return;
    }

    const container = document.createElement("div");
    container.className = "pdf-inline-translate-popup";
    container.tabIndex = -1;

    const header = document.createElement("div");
    header.className = "pdf-inline-translate-popup__header";

    const title = document.createElement("span");
    title.className = "pdf-inline-translate-popup__title";
    title.textContent = `${translate("modal.title", this.options.locale)} (${this.options.targetLanguage})`;
    header.appendChild(title);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "pdf-inline-translate-popup__close";
    closeButton.setAttribute("aria-label", translate("modal.closeTooltip", this.options.locale));
    closeButton.textContent = "X";
    closeButton.addEventListener("click", () => this.close());
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.className = "pdf-inline-translate-popup__body";
    body.appendChild(this.createSection("modal.originalTitle", this.options.originalText));
    body.appendChild(this.createSection("modal.translatedTitle", this.options.translatedText));

    const actions = document.createElement("div");
    actions.className = "pdf-inline-translate-popup__actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "pdf-inline-translate-popup__button";
    copyButton.textContent = translate("modal.copyButton", this.options.locale);
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.options.translatedText);
      new Notice(translate("modal.copyDone", this.options.locale));
    });
    actions.appendChild(copyButton);

    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(actions);
    document.body.appendChild(container);

    this.container = container;
    this.bindEvents();
    this.positionPopup();

    // レイアウト確定後に位置を再調整
    requestAnimationFrame(() => this.positionPopup());
  }

  close(): void {
    if (!this.container) {
      return;
    }
    this.cleanup.forEach((dispose) => dispose());
    this.cleanup = [];
    this.container.remove();
    this.container = null;
    this.options.onClose?.();
  }

  private createSection(labelKey: LocaleKey, text: string): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "pdf-inline-translate-section";

    const heading = document.createElement("h3");
    heading.textContent = translate(labelKey, this.options.locale);
    section.appendChild(heading);

    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.appendChild(paragraph);

    return section;
  }

  private bindEvents(): void {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!this.container) {
        return;
      }
      if (!this.container.contains(event.target as Node)) {
        this.close();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick, true);
    this.cleanup.push(() => document.removeEventListener("mousedown", handleOutsideClick, true));

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.close();
      }
    };
    document.addEventListener("keydown", handleKeydown, true);
    this.cleanup.push(() => document.removeEventListener("keydown", handleKeydown, true));

    const handleScroll = () => this.close();
    window.addEventListener("scroll", handleScroll, true);
    this.cleanup.push(() => window.removeEventListener("scroll", handleScroll, true));

    const handleResize = () => this.close();
    window.addEventListener("resize", handleResize);
    this.cleanup.push(() => window.removeEventListener("resize", handleResize));
  }

  private positionPopup(): void {
    if (!this.container) {
      return;
    }
    const offset = 12;
    const viewportPadding = 8;
    const containerRect = this.container.getBoundingClientRect();
    let left = this.options.position.left;
    let top = this.options.position.bottom + offset;

    const maxLeft = window.innerWidth - containerRect.width - viewportPadding;
    left = Math.max(viewportPadding, Math.min(left, maxLeft));

    if (top + containerRect.height + viewportPadding > window.innerHeight) {
      top = this.options.position.top - containerRect.height - offset;
    }

    if (top < viewportPadding) {
      top = Math.max(viewportPadding, Math.min(window.innerHeight - containerRect.height - viewportPadding, top));
    }

    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
  }
}
