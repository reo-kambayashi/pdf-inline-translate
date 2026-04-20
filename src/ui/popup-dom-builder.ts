import { setIcon } from 'obsidian';

export interface HeaderRefs {
    element: HTMLElement;
    titleEl: HTMLSpanElement;
    statusBadgeEl: HTMLSpanElement;
    collapseButton: HTMLButtonElement;
}

export interface BodyRefs {
    element: HTMLElement;
    statusEl: HTMLParagraphElement;
    originalSection: HTMLElement;
    originalToggleButton: HTMLButtonElement;
    originalEl: HTMLPreElement;
    translationEl: HTMLDivElement;
    copyButton: HTMLButtonElement;
    retryButton: HTMLButtonElement;
}

export class PopupDomBuilder {
    static buildHeader(
        onCollapse: () => void,
        onClose: () => void,
        onDragStart: (event: PointerEvent) => void,
        titleText = '翻訳',
    ): HeaderRefs {
        const header = document.createElement('div');
        header.className = 'pdf-inline-translate__popup-header';

        const headline = document.createElement('div');
        headline.className = 'pdf-inline-translate__popup-headline';
        const title = document.createElement('span');
        title.className = 'pdf-inline-translate__popup-title';
        title.textContent = titleText;
        headline.appendChild(title);

        const statusBadgeEl = document.createElement('span');
        statusBadgeEl.className = 'pdf-inline-translate__popup-badge';
        statusBadgeEl.textContent = '待機中';
        statusBadgeEl.setAttribute('aria-live', 'polite');
        statusBadgeEl.setAttribute('role', 'status');
        headline.appendChild(statusBadgeEl);
        header.appendChild(headline);

        const headerActions = document.createElement('div');
        headerActions.className = 'pdf-inline-translate__popup-actions';
        header.appendChild(headerActions);

        const collapseButton = document.createElement('button');
        collapseButton.type = 'button';
        collapseButton.className = 'pdf-inline-translate__popup-collapse';
        collapseButton.setAttribute('aria-label', 'ポップアップを折りたたむ');
        setIcon(collapseButton, 'minus');
        collapseButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onCollapse();
        });
        headerActions.appendChild(collapseButton);

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'pdf-inline-translate__popup-close';
        closeButton.setAttribute('aria-label', '閉じる');
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', onClose);
        headerActions.appendChild(closeButton);

        header.addEventListener('pointerdown', onDragStart);

        return { element: header, titleEl: title, statusBadgeEl, collapseButton };
    }

    static buildBody(
        isOriginalVisible: boolean,
        onToggleOriginal: () => void,
        onCopy: () => void,
        onRetry: () => void,
    ): BodyRefs {
        const body = document.createElement('div');
        body.className = 'pdf-inline-translate__popup-body';

        const statusEl = document.createElement('p');
        statusEl.className = 'pdf-inline-translate__status';
        statusEl.setAttribute('role', 'status');
        statusEl.setAttribute('aria-live', 'polite');
        body.appendChild(statusEl);

        const originalSection = document.createElement('div');
        originalSection.className = 'pdf-inline-translate__original-section';

        const originalToggleButton = document.createElement('button');
        originalToggleButton.type = 'button';
        originalToggleButton.className = 'pdf-inline-translate__original-toggle';
        originalToggleButton.addEventListener('click', onToggleOriginal);
        originalSection.appendChild(originalToggleButton);

        const originalEl = document.createElement('pre');
        originalEl.className = 'pdf-inline-translate__original';
        originalEl.setAttribute('aria-live', 'polite');
        originalEl.tabIndex = 0;
        originalSection.appendChild(originalEl);
        body.appendChild(originalSection);

        const translationEl = document.createElement('div');
        translationEl.className = 'pdf-inline-translate__translation';
        translationEl.setAttribute('aria-live', 'polite');
        body.appendChild(translationEl);

        const buttonRow = document.createElement('div');
        buttonRow.className = 'pdf-inline-translate__buttons';

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'pdf-inline-translate__retry';
        retryButton.textContent = '再翻訳';
        retryButton.title = 'キャッシュを無視して翻訳し直す';
        retryButton.addEventListener('click', onRetry);
        buttonRow.appendChild(retryButton);

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'mod-cta';
        copyButton.textContent = 'コピー';
        copyButton.setAttribute('disabled', 'true');
        copyButton.addEventListener('click', onCopy);
        buttonRow.appendChild(copyButton);
        body.appendChild(buttonRow);

        return { element: body, statusEl, originalSection, originalToggleButton, originalEl, translationEl, copyButton, retryButton };
    }
}
