/**
 * ログ出力を抽象化するためのインターフェース。
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * API キーなどの機微情報をマスクするヘルパー。
 */
export const maskSecret = (value: string, visibleCount = 4): string => {
  if (!value) {
    return "";
  }
  if (value.length <= visibleCount) {
    return "*".repeat(value.length);
  }
  const visibleSegment = value.slice(0, visibleCount);
  const maskedSegment = "*".repeat(value.length - visibleCount);
  return `${visibleSegment}${maskedSegment}`;
};

/**
 * コンソールへ出力するシンプルなロガー実装。
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;

  constructor(prefix = "PDFInlineTranslate") {
    this.prefix = prefix;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.formatMessage("INFO", message), meta ?? {});
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.formatMessage("WARN", message), meta ?? {});
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(this.formatMessage("ERROR", message), meta ?? {});
  }

  private formatMessage(level: "INFO" | "WARN" | "ERROR", message: string): string {
    return `[${this.prefix}] [${level}] ${message}`;
  }
}
