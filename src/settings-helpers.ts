import { Setting } from 'obsidian';

export function addToggleSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    getValue: () => boolean,
    onChange: (value: boolean) => Promise<void>,
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((toggle) => toggle.setValue(getValue()).onChange(onChange));
}

export function addTextSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    getValue: () => string,
    onChange: (value: string) => Promise<void>,
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => text.setPlaceholder(placeholder).setValue(getValue()).onChange(onChange));
}

export function addDropdownSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    options: Record<string, string>,
    getValue: () => string,
    onChange: (value: string) => Promise<void>,
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addDropdown((dropdown) => {
            for (const [value, label] of Object.entries(options)) {
                dropdown.addOption(value, label);
            }
            dropdown.setValue(getValue()).onChange(onChange);
        });
}

export function addSliderSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    min: number,
    max: number,
    step: number,
    getValue: () => number,
    onChange: (value: number) => Promise<void>,
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addSlider((slider) =>
            slider.setLimits(min, max, step).setDynamicTooltip().setValue(getValue()).onChange(onChange),
        );
}

export function addTextAreaSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    rows: number,
    cols: number,
    getValue: () => string,
    onChange: (value: string) => Promise<void>,
    resetToDefault?: () => Promise<string>,
): void {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    let textAreaRef: { setValue: (v: string) => void } | null = null;
    setting.addTextArea((textArea) => {
        textArea.setValue(getValue()).onChange(onChange);
        textArea.inputEl.rows = rows;
        textArea.inputEl.cols = cols;
        textAreaRef = textArea;
    });
    if (resetToDefault) {
        setting.addExtraButton((btn) =>
            btn
                .setIcon('reset')
                .setTooltip('デフォルトに戻す')
                .onClick(async () => {
                    const next = await resetToDefault();
                    textAreaRef?.setValue(next);
                }),
        );
    }
}
