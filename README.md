# PDF Inline Translate for Obsidian

Obsidian の PDF ビューアで選択したテキストを Google Gemini（gemini-2.5-flash-lite）に送信し、選択範囲のすぐそばにポップアップとして翻訳結果を表示するプラグインです。Gemini API キーはプラグイン設定画面で安全に保存され、翻訳にはレートリミットとリトライ制御が含まれます。

## 主な機能
- PDF ビューアで選択したテキストをワンクリックで翻訳
- 翻訳結果をポップアップで即時表示し、その場でコピーが可能
- Gemini API へのリトライ（429/500 系）とタイムアウト制御を内蔵
- Obsidian の言語設定（ja/en）に応じた UI 表示

## インストールと設定
1. Google AI Studio で Gemini API キーを取得します。
2. プラグインを Obsidian のプラグインフォルダ（`.obsidian/plugins/pdf-inline-translate`）へ配置します。
3. Obsidian を再起動し、設定 > コミュニティプラグインから **PDF Inline Translate** を有効化します。
4. プラグイン設定タブで Gemini API キーと翻訳先言語（例: `ja`, `en`, `fr`）を入力します。必要に応じて翻訳元言語・タイムアウト・リトライ回数を調整してください。

## 使い方
- PDF ビューアで翻訳したい文章を選択し、コマンドパレット（`Cmd/Ctrl+P`）から「選択した PDF テキストを翻訳」を実行するか、ファイルコンテキストメニューの「選択範囲を翻訳 (Gemini)」をクリックします。
- 翻訳が完了すると選択範囲付近にポップアップが開き、原文と翻訳結果を確認できます。翻訳結果はワンクリックでコピー可能です。

## 開発ガイド
Node.js 18 以上を想定しています。

```bash
npm install
npm run dev    # esbuild --watch で main.js を生成
npm run build  # dist/main.js と main.js を本番向けに生成
npm run lint   # ESLint (@typescript-eslint)
npm run format # Prettier
npm run test   # Vitest + MSW
```

ビルド成果物は `dist/` に出力され、`esbuild.config.mjs` により `main.js` へ自動コピーされます。配布時は `manifest.json`, `main.js`, `styles.css` を同梱してください。

## テスト
- `tests/` ディレクトリに Vitest で記述したユニットテストを配置しています。
- Gemini API は MSW でスタブ化し、正常系と 429 リトライを検証済みです。
- `npm run test -- --coverage` でカバレッジレポートを出力できます。

## セキュリティとプライバシー
- Gemini API キーは Obsidian の設定ストアにのみ保存し、ファイルへは書き出しません。
- 翻訳対象テキストは API 呼び出し時のみメモリ上に保持し、ログには残しません。
- レートリミットやタイムアウトを備え、想定外の長時間リクエストを抑制します。
