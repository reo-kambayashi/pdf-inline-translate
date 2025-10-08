import { App, Modal, Notice, Setting } from "obsidian";
import { translate, LocaleId } from "../locales";

export interface TranslationModalProps {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  locale: LocaleId;
}

/**
 * 翻訳結果を表示し、コピーなどの操作を提供するモーダル。
 */
export class TranslatableResultModal extends Modal {
  private readonly props: TranslationModalProps;

  constructor(app: App, props: TranslationModalProps) {
    super(app);
    this.props = props;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.textContent = `${translate("modal.title", this.props.locale)} (${this.props.targetLanguage})`;

    const originalSection = contentEl.createDiv({ cls: "pdf-inline-translate-section" });
    originalSection.createEl("h3", { text: translate("modal.originalTitle", this.props.locale) });
    originalSection.createEl("p", { text: this.props.originalText });

    const translatedSection = contentEl.createDiv({ cls: "pdf-inline-translate-section" });
    translatedSection.createEl("h3", { text: translate("modal.translatedTitle", this.props.locale) });
    translatedSection.createEl("p", { text: this.props.translatedText });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(translate("modal.copyButton", this.props.locale))
          .onClick(async () => {
            await navigator.clipboard.writeText(this.props.translatedText);
            new Notice(translate("modal.copyDone", this.props.locale));
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("checkmark")
          .setTooltip(translate("modal.closeTooltip", this.props.locale))
          .onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
