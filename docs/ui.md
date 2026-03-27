# UI Components

## Floating popup

### DOM structure

```
div.pdf-inline-translate__popup  [fixed, flex-column, draggable]
│
├── div.pdf-inline-translate__popup-header  [drag handle]
│   ├── span.pdf-inline-translate__popup-title   "PDF Translate"
│   ├── span.pdf-inline-translate__status-badge  (loading / result / error / cancelled)
│   ├── button.pdf-inline-translate__collapse-btn  [-]
│   └── button.pdf-inline-translate__close-btn     [×]
│
└── div.pdf-inline-translate__popup-body  [hidden when collapsed]
    ├── div.pdf-inline-translate__status        Status text (loading message etc.)
    ├── div.pdf-inline-translate__original-section  [hidden by default]
    │   ├── button  "原文を表示 ▶" toggle
    │   └── pre     original text
    ├── div.pdf-inline-translate__translation   Markdown-rendered translation
    └── div.pdf-inline-translate__buttons
        ├── button.copy-btn   "コピー"
        └── button.insert-btn "ノートに挿入"  (if autoInsertToNote=true)
```

### Translation state machine

```
pending ──[expand / autoExpand]──► loading
loading ──[API success]──────────► result
loading ──[API error]────────────► error
loading ──[user cancel]──────────► cancelled
result  ──[new text selected]────► loading
error   ──[new text selected]────► loading
```

State is reflected via `data-state` attribute on the popup root and used by CSS for badge color and body visibility.

| State | Badge color | Badge text | Copy button |
|---|---|---|---|
| pending | grey | 待機中 | disabled |
| loading | blue | 翻訳中 | disabled |
| result | green | 完了 | enabled |
| error | red | エラー | disabled |
| cancelled | yellow | 中断 | disabled |

### Popup lifecycle

1. **Creation** — `UIManager.getOrCreateFloatingPopup()` instantiates `GeminiTranslationFloatingPopup`, appends to `document.body`.
2. **Positioning** — `PopupPositioner.setPositionFromContext()` places popup near selection rect (with viewport bounds clamping). Falls back to `PopupPositioner.getLastPosition()` or defaults (`top: 24px, left: 24px`).
3. **Collapsed state** — Header visible, body hidden. Shows original text and current state.
4. **Expansion** — User clicks collapse button (or `autoExpandPopup=true`) → body shown, translation request fires.
5. **Streaming** — `appendStreamChunk(chunk)` appends text to translation area in real-time.
6. **Destruction** — `UIManager.destroyFloatingPopup()` removes DOM node, cancels pending requests, disconnects `MutationObserver`.

### Page removal observer

`UIManager` attaches a `MutationObserver` to the PDF page element. When the element is removed from the DOM (PDF++ page virtualisation), the popup is automatically destroyed.

---

## Drag handler (`popup-drag-handler.ts`)

- `pointerdown` on header → `setPointerCapture`, records start position.
- `pointermove` → updates popup `top`/`left` CSS; adds `.is-dragging` class.
- `pointerup` / `pointercancel` → releases capture, removes `.is-dragging`.
- Last position is stored in `PopupPositioner` and reused for next open.

---

## Markdown renderer (`markdown-renderer.ts`)

Custom renderer (no external dependency). Supports:

| Element | Syntax |
|---|---|
| Headings | `#` – `####` |
| Bold | `**text**` |
| Italic | `*text*` or `_text_` |
| Strikethrough | `~~text~~` |
| Unordered list | `- item` |
| Ordered list | `1. item` |
| Blockquote | `> text` |
| Inline code | `` `code` `` |
| Code block | ` ```...``` ` |
| Link | `[label](url)` |

CSS classes use the `pdf-inline-translate__markdown-*` prefix.

---

## Themes and styling

Set via `popupTheme` setting. Applied as a CSS class on the popup root.

| Setting value | CSS class | Description |
|---|---|---|
| `system` | (none / Obsidian vars) | Follows Obsidian app theme |
| `default` | `.pdf-inline-translate__theme-default` | Dark-blue base |
| `dark` | `.pdf-inline-translate__theme-dark` | Dark (`#1e1e2e`) |
| `light` | `.pdf-inline-translate__theme-light` | Light (`#f8fafc`) |
| `blue` | `.pdf-inline-translate__theme-blue` | Blue accent |
| `green` | `.pdf-inline-translate__theme-green` | Green accent |

Font size classes: `.pdf-inline-translate__font-small/medium/large`.

Background opacity is set as inline CSS `background: rgba(..., alpha)` using `popupBackgroundColorAlpha`.

---

## Translation history view (`translation-history-view.ts`)

Obsidian `ItemView` registered at leaf type `pdf-inline-translate-history`.

- Opened via command `open-translation-history`.
- Lists items newest-first with original + translation pairs.
- Search input filters by original or translation text.
- Per-item: copy button, delete button.
- "Clear all" button with confirmation dialog.
