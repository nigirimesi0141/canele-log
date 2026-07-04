# Canele Log

カヌレの試作（テストベイク）を記録・比較するためのObsidianプラグインです。

- サーバー不要、iPhone/iPad/デスクトップのObsidianアプリだけで完結します
- 記録は Vault 内に frontmatter 付きの Markdown ノートとして保存されるため、Obsidian の通常のノートとしてもそのまま閲覧・編集できます
- 材料配合・焼成温度/時間・評価（★1〜5）・タグ・写真を記録し、一覧・比較ができます

詳細な仕様は [SPEC.md](./SPEC.md) を参照してください。

## 開発

```bash
npm install
npm run dev    # esbuildのwatchビルド
npm run build  # 本番ビルド（型チェック + main.js生成）
```

ビルドした `main.js` / `manifest.json` / `styles.css` を Vault の
`.obsidian/plugins/canele-log/` に配置し、Obsidianの設定からコミュニティプラグインを有効化してください。

## 主な機能

- 試作記録の作成・編集・削除
- 材料配合（可変長）の入力
- 写真の添付（複数枚）
- 5段階評価
- タグ付け・タグ絞り込み
- 既存レシピからの複製
- 複数試作の比較ビュー
