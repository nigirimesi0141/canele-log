# 料理試作記録アプリ 仕様書 (Obsidianプラグイン方式)

## 1. 概要

料理の試作（テストクック）を**カテゴリ別に**記録・比較するための、Obsidian上で動作するプラグイン。
もともとはカヌレの試作記録用だったが、カヌレを1カテゴリとして扱い、焼き菓子から煮込み料理まで汎用的に記録できる。
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
│        Recipes/*.md, Recipes/attachments/*  │
└───────────────────────────────────────────┘
```

- サーバー・バックエンド・外部通信は一切なし。すべてObsidian Plugin API経由でVault内に読み書き。
- Node.js固有API（`fs`, `child_process`等）は使用不可（モバイルはCapacitor環境のため）。ファイル操作は必ず `app.vault` / `app.fileManager` / `app.metadataCache` を使う。
- Frontmatterの読み取りは `metadataCache.getFileCache(file)?.frontmatter` を使用。書き込みは `app.fileManager.processFrontMatter(file, cb)` を使用（YAMLの手書きシリアライズ不要）。

## 3. データモデル

1試作 = 1 Markdownノート。ファイル名は**レシピのタイトル**（`Recipes/さつまいもドーナツ.md` など。ファイル名に使えない文字は除去、重複時は連番、空なら `id`）。タイトルを変更するとファイルもリネームされる。識別子は frontmatter の `id` で、ファイル名とは独立（写真名も `id` ベース）。保存先フォルダは設定で変更可

```markdown
---
id: "20260704-143022"
title: "試作 #1"
date: "2026-07-04"
category: "カヌレ"         # 料理の種類（カテゴリ）
rating: 4                # 1〜5
based_on: null            # 複製元trialのid
steps:                    # 調理工程（可変長）。手順ごとに温度・時間を記録（温度/時間は任意）
  - label: 予熱後に投入
    temp_c: 250
    time_min: 10
  - label: 温度を下げてじっくり
    temp_c: 200
    time_min: 50
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
  - "Recipes/attachments/20260704-143022-1.jpg"
tags: [抹茶, 改良版]        # ユーザーが自由に追加するタグ
---

## メモ

外側はカリッと、中はもちっと仕上がった。次回は焼成温度を10度上げて試す。
```

- `category` は料理の種類（例: `カヌレ`, `カレー`, `食パン`）。一覧ビューでカテゴリ絞り込みに使う。設定で候補（カテゴリ一覧）とデフォルト値を登録できる。空でも可。
- `ingredients` は可変長配列（材料名・分量・単位）。あらゆる料理に流用できる汎用構造。
- `steps` は可変長の調理工程配列（手順ラベル・温度℃・時間分）。「高温で予熱→温度を下げて焼く」のような複数段階の焼成や、煮込み・下ごしらえなどの手順を記録できる（温度/時間は任意）。旧フォーマットの単一 `bake_temp_c` / `bake_time_min` を持つノートは、読み込み時に自動的に1件の `steps` へ移行される。
- `based_on` により複製元をたどれる。
- `tags` はユーザーが自由に追加できる文字列配列（例: `抹茶`, `失敗作`, `改良版`）。Obsidian標準のfrontmatter tagsとして扱われるため、Obsidian本体のタグペイン・タグ検索・グラフビューでもそのまま利用できる。（※以前は固定タグ `canele` を自動付与していたが、汎用化に伴い廃止。分類は `category` を使う。）
- 本文（frontmatter以下）は「自動生成ブロック」＋「自由メモ」の2部構成。プラグインは保存時に、frontmatter の写真・材料・工程から **「## 写真」（画像埋め込み `![[...]]`）・「## 材料」表・「## 調理工程」リストを本文に自動生成**する（`%% canele-log:auto-start %%` 〜 `%% canele-log:auto-end %%` の間。Obsidianコメントなので閲覧時は非表示）。これによりノートを開くだけで内容を読める。区切りより下がユーザーの自由メモで、読み込み時はここだけをメモ欄に反映する。frontmatter が引き続き真実の情報源であり、材料・工程の編集は記録モーダルから行う（自動ブロックは毎回再生成される）。旧バージョンで作成したノートは、次回モーダルから保存した時点で自動ブロックが付与される。

## 4. 機能一覧（MVP）

| # | 機能 | 内容 |
|---|------|------|
| 1 | 試作記録の作成 | コマンドパレット/リボンアイコンからモーダルを開き、カテゴリ・材料配合・調理工程（複数段の温度/時間）・メモを入力してノート作成 |
| 2 | 写真添付 | `<input type="file" accept="image/*">` でカメラロール/ファイルから選択し、Vault内attachmentsに保存してfrontmatterに追記。作成・編集モーダルでは既存/未保存の写真をサムネイル表示し、読み取り元画像と入力内容を見比べられる（保存済みはクリックで拡大） |
| 3 | カテゴリ分類 | 作成/編集モーダルでカテゴリ（料理の種類）を入力。設定のカテゴリ一覧＋既存記録からサジェスト。デフォルトカテゴリを設定可能 |
| 4 | タグ付け | 作成/編集モーダルでタグをカンマ区切りで追加。既存タグの入力補完（過去に使ったタグ一覧からサジェスト）あり |
| 5 | 一覧表示 | 専用ItemView（サイドペイン）で全試作をリスト表示。日付・評価でソート、カテゴリ・タグでの絞り込み |
| 6 | 詳細表示 | 一覧から選択したノートを開く（Obsidian標準のノート表示を利用。タグはObsidian標準のタグリンクとして表示） |
| 7 | 評価 | 5段階評価（★）をモーダルで入力・編集 |
| 8 | レシピ複製 | 一覧から「複製」を選ぶと、カテゴリ・材料配合・工程・タグをコピーした新規モーダルが開く（`based_on`セット） |
| 9 | 比較ビュー | 一覧でチェックした2件以上をモーダルで並べて比較表示（カテゴリ・材料・工程・評価・タグ） |
| 10 | 編集・削除 | 一覧から既存ノートを編集モーダルで開く／削除 |
| 11 | 画像からの読み取り（任意） | 記録モーダルの「📷 画像から入力」でレシピ写真を選択。Anthropic の画像対応モデル（Structured Outputs でこのデータモデルに強制）でカテゴリ・材料・工程・メモを抽出しフォームに下書き入力。入力画像は写真にも追加。APIキー未設定時は非表示 |

## 5. プラグイン内部設計

| モジュール | 役割 |
|---|---|
| `main.ts` | プラグイン本体。コマンド登録、リボンアイコン、ビュー登録、設定読み込み |
| `settings.ts` | 設定タブ（保存先フォルダ名、添付先フォルダ名、カテゴリ一覧、デフォルトカテゴリ） |
| `types.ts` | `TrialFrontmatter` 等の型定義 |
| `vaultStore.ts` | ノートのCRUD・複製・frontmatter読み書き・添付ファイル保存・全ノートから既存タグ／カテゴリ一覧を収集するヘルパー |
| `views/TrialListView.ts` | サイドペインの一覧ビュー（`ItemView`継承）。日付/評価ソート、カテゴリ・タグ絞り込みUI |
| `views/TrialModal.ts` | 作成・編集用モーダル（カテゴリ選択、材料・工程の動的行、評価、タグ入力＋サジェスト、写真ピッカー、画像からの読み取りボタン） |
| `views/CompareModal.ts` | 比較表示用モーダル |
| `recipeExtractor.ts` | レシピ画像を Anthropic API（`requestUrl`）に送り、Structured Outputs でこのデータモデルに沿ったJSONを取得するヘルパー。APIキー未設定時は呼ばれない |

## 6. 設定項目（Settings Tab）

- 記録保存フォルダ（デフォルト: `Recipes`）
- 添付ファイルフォルダ（デフォルト: `Recipes/attachments`）
- カテゴリ一覧（カンマ区切りで登録。記録時の候補に表示）
- デフォルトカテゴリ（新規記録時に初期選択されるカテゴリ）
- Anthropic API キー（画像読み取り機能用。任意。空欄で機能無効）
- 読み取りモデル（デフォルト: `claude-haiku-4-5`。Sonnet 5 / Opus 4.8 も選択可）

## 7. 非機能要件・前提

- 単一ユーザー・単一Vault前提のため認証機構は不要。
- iOS/Androidのモバイル版Obsidianで動作すること（Node専用APIを使わない）を必須要件とする。
- 「サーバー不要・外部通信なし」を既定とするが、**画像からの読み取りは唯一の例外**であり、ユーザーがAPIキーを設定したときのみ有効になる任意（オプトイン）機能。通信は Obsidian の `requestUrl` 経由で Anthropic API に直接送られ、第三者には送信されない。APIキーは Vault 内（`.obsidian`）に平文保存されるため、Vault同期時は他端末にも同期される点に留意（専用キーの利用を推奨）。
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
