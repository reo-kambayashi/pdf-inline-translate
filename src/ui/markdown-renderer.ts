import { MarkdownBlock } from '../types';

export class MarkdownRenderer {
    /**
     * Renders markdown content to HTML elements
     */
    static render(markdown: string, container: HTMLElement) {
        if (!container) {
            return;
        }

        const trimmed = markdown?.trim() ?? '';
        container.innerHTML = '';
        container.dataset.state = 'result';
        container.classList.add('pdf-inline-translate__translation--custom');

        const fragment = document.createDocumentFragment();
        if (!trimmed) {
            const placeholder = document.createElement('p');
            placeholder.className =
                'pdf-inline-translate__markdown-paragraph pdf-inline-translate__markdown-placeholder';
            placeholder.textContent = '翻訳結果がありません。';
            fragment.appendChild(placeholder);
            container.appendChild(fragment);
            return;
        }

        const blocks = MarkdownRenderer.parseMarkdownBlocks(trimmed);
        if (blocks.length === 0) {
            const paragraph = document.createElement('p');
            paragraph.className = 'pdf-inline-translate__markdown-paragraph';
            MarkdownRenderer.appendInlineElements(paragraph, trimmed);
            fragment.appendChild(paragraph);
        } else {
            for (const block of blocks) {
                switch (block.type) {
                    case 'heading': {
                        const level = Math.min(block.level, 4);
                        const headingTag = `h${level}` as keyof HTMLElementTagNameMap;
                        const heading = document.createElement(headingTag);
                        heading.classList.add(
                            'pdf-inline-translate__markdown-heading',
                            `pdf-inline-translate__markdown-heading--level-${level}`,
                        );
                        MarkdownRenderer.appendInlineElements(heading, block.text);
                        fragment.appendChild(heading);
                        break;
                    }
                    case 'paragraph': {
                        const paragraph = document.createElement('p');
                        paragraph.className = 'pdf-inline-translate__markdown-paragraph';
                        MarkdownRenderer.appendParagraphLines(block.lines, paragraph);
                        fragment.appendChild(paragraph);
                        break;
                    }
                    case 'list': {
                        const listEl = document.createElement(block.ordered ? 'ol' : 'ul');
                        listEl.classList.add('pdf-inline-translate__markdown-list');
                        if (block.ordered) {
                            listEl.classList.add('pdf-inline-translate__markdown-list--ordered');
                        }
                        for (const item of block.items) {
                            const li = document.createElement('li');
                            li.className = 'pdf-inline-translate__markdown-list-item';
                            MarkdownRenderer.appendInlineElements(li, item.trim());
                            listEl.appendChild(li);
                        }
                        fragment.appendChild(listEl);
                        break;
                    }
                    case 'blockquote': {
                        const quote = document.createElement('blockquote');
                        quote.className = 'pdf-inline-translate__markdown-quote';
                        for (const segment of block.lines) {
                            const quoteLine = document.createElement('p');
                            quoteLine.className = 'pdf-inline-translate__markdown-quote-line';
                            MarkdownRenderer.appendInlineElements(quoteLine, segment.trim());
                            quote.appendChild(quoteLine);
                        }
                        fragment.appendChild(quote);
                        break;
                    }
                    case 'code': {
                        const pre = document.createElement('pre');
                        pre.className = 'pdf-inline-translate__markdown-code';
                        const code = document.createElement('code');
                        code.textContent = block.lines.join('\n');
                        if (block.language) {
                            code.setAttribute('data-language', block.language);
                        }
                        pre.appendChild(code);
                        fragment.appendChild(pre);
                        break;
                    }
                }
            }
        }
        container.appendChild(fragment);
    }

    static parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
        const normalized = (markdown ?? '').replace(/\r\n?/g, '\n');
        const lines = normalized.split('\n');
        const blocks: MarkdownBlock[] = [];

        let paragraph: string[] = [];
        let blockquote: string[] = [];
        let list: { ordered: boolean; items: string[] } | null = null;
        let code: { language: string; lines: string[] } | null = null;

        const pushParagraph = () => {
            if (paragraph.length) {
                blocks.push({ type: 'paragraph', lines: [...paragraph] });
                paragraph = [];
            }
        };
        const pushBlockquote = () => {
            if (blockquote.length) {
                blocks.push({ type: 'blockquote', lines: [...blockquote] });
                blockquote = [];
            }
        };
        const pushList = () => {
            if (list && list.items.length) {
                blocks.push({
                    type: 'list',
                    ordered: list.ordered,
                    items: [...list.items],
                });
            }
            list = null;
        };
        const pushCode = () => {
            if (code) {
                blocks.push({
                    type: 'code',
                    language: code.language,
                    lines: [...code.lines],
                });
                code = null;
            }
        };

        for (const rawLine of lines) {
            const line = rawLine.replace(/\s+$/, '');
            if (code) {
                if (/^```/.test(line)) {
                    pushCode();
                    continue;
                }
                code.lines.push(rawLine);
                continue;
            }

            if (/^```/.test(line)) {
                pushParagraph();
                pushBlockquote();
                pushList();
                code = {
                    language: line.slice(3).trim(),
                    lines: [],
                };
                continue;
            }

            if (!line.trim()) {
                pushParagraph();
                pushBlockquote();
                pushList();
                continue;
            }

            const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                pushParagraph();
                pushBlockquote();
                pushList();
                blocks.push({
                    type: 'heading',
                    level: headingMatch[1].length,
                    text: headingMatch[2].trim(),
                });
                continue;
            }

            const quoteMatch = line.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                pushParagraph();
                pushList();
                blockquote.push(quoteMatch[1]);
                continue;
            } else if (blockquote.length) {
                pushBlockquote();
            }

            const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/);
            if (unorderedMatch) {
                pushParagraph();
                if (!list || list.ordered) {
                    pushList();
                    list = { ordered: false, items: [] };
                }
                list.items.push(unorderedMatch[1]);
                continue;
            }

            const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
            if (orderedMatch) {
                pushParagraph();
                if (!list || !list.ordered) {
                    pushList();
                    list = { ordered: true, items: [] };
                }
                list.items.push(orderedMatch[1]);
                continue;
            }

            if (list) {
                pushList();
            }
            paragraph.push(line);
        }

        pushParagraph();
        pushBlockquote();
        pushList();
        pushCode();

        return blocks;
    }

    static appendParagraphLines(lines: string[], container: HTMLElement) {
        lines.forEach((segment, index) => {
            MarkdownRenderer.appendInlineElements(container, segment.trim());
            if (index < lines.length - 1) {
                container.appendChild(document.createElement('br'));
            }
        });
    }

    static appendInlineElements(container: HTMLElement, text: string) {
        if (!text) {
            return;
        }
        const tokenPattern =
            /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = tokenPattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                const plain = text.slice(lastIndex, match.index);
                container.appendChild(document.createTextNode(plain));
            }
            const token = match[0];
            if (token.startsWith('**') || token.startsWith('__')) {
                const strong = document.createElement('strong');
                const content = token.slice(2, -2);
                MarkdownRenderer.appendInlineElements(strong, content);
                container.appendChild(strong);
            } else if (
                (token.startsWith('*') && token.endsWith('*')) ||
                (token.startsWith('_') && token.endsWith('_'))
            ) {
                const emphasis = document.createElement('em');
                const content = token.slice(1, -1);
                MarkdownRenderer.appendInlineElements(emphasis, content);
                container.appendChild(emphasis);
            } else if (token.startsWith('~~') && token.endsWith('~~')) {
                const del = document.createElement('del');
                MarkdownRenderer.appendInlineElements(del, token.slice(2, -2));
                container.appendChild(del);
            } else if (token.startsWith('`') && token.endsWith('`')) {
                const code = document.createElement('code');
                code.textContent = token.slice(1, -1);
                container.appendChild(code);
            } else if (token.startsWith('[')) {
                const linkMatch = token.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^\"]*)")?\)$/);
                if (linkMatch) {
                    const anchor = document.createElement('a');
                    anchor.textContent = linkMatch[1];
                    anchor.href = linkMatch[2];
                    anchor.target = '_blank';
                    anchor.rel = 'noopener noreferrer';
                    if (linkMatch[3]) {
                        anchor.title = linkMatch[3];
                    }
                    container.appendChild(anchor);
                } else {
                    container.appendChild(document.createTextNode(token));
                }
            } else {
                container.appendChild(document.createTextNode(token));
            }
            lastIndex = tokenPattern.lastIndex;
        }
        if (lastIndex < text.length) {
            container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
    }
}
