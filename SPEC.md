# カヌレ試作記録アプリ 仕様書 (Obsidianプラグイン方式)

## 1. 概要

カヌレの試作（テストベイク）を記録・比較するための、Obsidian上で動作するプラグイン。
サーバーやPCを介さず **iPhone単体（Obsidian iOSアプリ）だけで完結** することを最優先とする。
記録データはVault内のMarkdownノート（frontmatter付き）として保存し、Obsidianの通常のノートとしても閲覧・編集できる。

- 利用形態: Obsidianコミュニティプラグイン（Desktop / iOS 両対応）
- 想定ユーザー: 開発者本人（1人）
- 同期: Obsidian自体の同期機能（iCloud経由のVaultフォルダ共有、Obsidian Sync等）に委ねる。プラグイン側は同期を意識しない。

## 2. アーキテクチャ

```
┌───────────────────────────────────────────┐
│              Obsidian App (iOS / Desktop)   │
│  ┌───────────────────────────────────────┐ │
│  │  Canele Log Plugin (TypeScript)         │ │
│  │  - Modal (記録フォーム/比較)             │ │
│  │  - ItemView (一覧ペイン)                 │ │
│  │  - vaultStore (Obsidian Vault/          │ │
│  │    FileManager/MetadataCache 経由で      │ │
│  │    ノート・添付ファイルを読み書き)         │ │
│  └───────────────────┬───────────────────┘ │
│                       │ Obsidian Plugin API │
│                       ▼                     │
│              Vault（ローカルファイル）        │
│         Canele/*.md, Canele/attachments/*   │
└───────────────────────────────────────────┘
```

- サーバー・バックエンド・外部通信は一切なし。すべてObsidian Plugin API経由でVault内に読み書き。
- Node.js固有API（`fs`, `child_process`等）は使用不可（モバイルはCapacitor環境のため）。ファイル操作は必ず `app.vault` / `app.fileManager` / `app.metadataCache` を使う。
- Frontmatterの読み取りは `metadataCache.getFileCache(file)?.frontmatter` を使用。書き込みは `app.fileManager.processFrontMatter(file, cb)` を使用（YAMLの手書きシリアライズ不要）。

## 3. データモデル

1試作 = 1 Markdownノート（`Canele/2026-07-04-143022.md`、設定でフォルダ名変更可）

```markdown
---
id: "20260704-143022"
title: "試作 #1"
date: "2026-07-04"
rating: 4                # 1〜5
based_on: null            # 複製元trialのid
bake_temp_c: 200
bake_time_min: 55
ingredients:
  - name: 薄力粉
    amount: 50
    unit: g
  - name: 卵黄
    amount: 2
    unit: 個
  - name: 牛乳
    amount: 250
    unit: ml
photos:
  - "Canele/attachments/20260704-143022-1.jpg"
tags: [canele, 抹茶, 改良版]   # "canele" は固定タグ、それ以降はユーザーが自由に追加
---

## メモ

外側はカリッと、中はもちっと仕上がった。次回は焼成温度を10度上げて試す。
```

- `ingredients` は可変長配列（材料名・分量・単位）。カヌレ以外の焼き菓子にも流用できる汎用構造。
- `based_on` により複製元をたどれる。
- `tags` はユーザーが自由に追加できる文字列配列。作成時に固定タグ `canele` を自動付与し、それに加えてユーザーが任意のタグ（例: `抹茶`, `失敗作`, `改良版`）を入力できる。Obsidian標準のfrontmatter tagsとして扱われるため、Obsidian本体のタグペイン・タグ検索・グラフビューでもそのまま利用できる。
- 本文（frontmatter以下）は自由記述のメモ欄。ユーザーがObsidian上で直接編集してもプラグインは壊れない（frontmatterのキーのみ参照する）。

## 4. 機能一覧（MVP）

| # | 機能 | 内容 |
|---|------|------|
| 1 | 試作記録の作成 | コマンドパレット/リボンアイコンからモーダルを開き、材料配合・焼成温度/時間・メモを入力してノート作成 |
| 2 | 写真添付 | `<input type="file" accept="image/*">` でカメラロール/ファイルから選択し、Vault内attachmentsに保存してfrontmatterに追記 |
| 3 | タグ付け | 作成/編集モーダルでタグをカンマ区切り or チップ入力形式で追加。固定タグ`canele`は自動付与、既存タグの入力補完（過去に使ったタグ一覧からサジェスト）あり |
| 4 | 一覧表示 | 専用ItemView（サイドペイン）で全試作をリスト表示。日付・評価でソート、タグでの絞り込み |
| 5 | 詳細表示 | 一覧から選択したノートを開く（Obsidian標準のノート表示を利用。タグはObsidian標準のタグリンクとして表示） |
| 6 | 評価 | 5段階評価（★）をモーダルで入力・編集 |
| 7 | レシピ複製 | 一覧から「複製」を選ぶと、材料配合とタグをコピーした新規モーダルが開く（`based_on`セット） |
| 8 | 比較ビュー | 一覧でチェックした2件以上をモーダルで並べて比較表示（材料・条件・評価・タグ） |
| 9 | 編集・削除 | 一覧から既存ノートを編集モーダルで開く／削除 |

## 5. プラグイン内部設計

| モジュール | 役割 |
|---|---|
| `main.ts` | プラグイン本体。コマンド登録、リボンアイコン、ビュー登録、設定読み込み |
| `settings.ts` | 設定タブ（保存先フォルダ名、添付先フォルダ名） |
| `types.ts` | `TrialFrontmatter` 等の型定義 |
| `vaultStore.ts` | ノートのCRUD・複製・frontmatter読み書き・添付ファイル保存・全ノートから既存タグ一覧を収集するヘルパー |
| `views/TrialListView.ts` | サイドペインの一覧ビュー（`ItemView`継承）。日付/評価ソート、タグ絞り込みUI |
| `views/TrialModal.ts` | 作成・編集用モーダル（材料の動的行、評価、タグ入力＋既存タグサジェスト、写真ピッカー） |
| `views/CompareModal.ts` | 比較表示用モーダル |

## 6. 設定項目（Settings Tab）

- 記録保存フォルダ（デフォルト: `Canele`）
- 添付ファイルフォルダ（デフォルト: `Canele/attachments`）

## 7. 非機能要件・前提

- 単一ユーザー・単一Vault前提のため認証機構は不要。
- iOS/Androidのモバイル版Obsidianで動作すること（Node専用APIを使わない）を必須要件とする。
- 写真ファイル名は `{id}-{連番}.{ext}` にリネームして衝突を回避。
- 将来的な拡張候補（本MVPには含めない）: タグ検索、全文検索、CSVエクスポート、グラフ表示。

## 8. ディレクトリ構成（リポジトリ）

```
canele-log/
├── README.md
├── manifest.json          # Obsidianプラグインマニフェスト
├── versions.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs     # ビルド設定（main.ts → main.js）
├── styles.css
└── src/
    ├── main.ts
    ├── settings.ts
    ├── types.ts
    ├── vaultStore.ts
    └── views/
        ├── TrialListView.ts
        ├── TrialModal.ts
        └── CompareModal.ts
```

## 9. インストール・開発フロー

- ビルド: `npm run build`（esbuildで`main.js`を生成）
- 開発時: Vault直下の `.obsidian/plugins/canele-log/` にシンボリックリンクまたはコピーし、Obsidianの「コミュニティプラグイン」からリロードして動作確認
- 配布: 個人利用のため Obsidian公式コミュニティプラグイン一覧への申請は行わず、GitHub ReleaseからBRAT（Beta Reviewers Auto-update Tester）プラグイン経由でインストールする想定
