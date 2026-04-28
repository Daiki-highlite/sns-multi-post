# Highlite Design Tokens（SNS / OGP用 抜粋）

OGPやサムネ画像をHLブランドカラーで作る時に参照する最小トークンセット。
正本は `Highlite inc./design-system.html`。**ここはその抜粋兼SNS用ガイド**。

> ⚠️ 値の食い違いがあった時は **design-system.html が正**。差分が出たらこのファイルを更新する責任は最初に気づいた人。

---

## 1. カラーパレット（Background / Text / Crystal）

HLのデザインシステムは Background / Text / Crystal の3軸構成。SNS画像で使う基本は以下：

| トークン名 | 用途 | HEX | 備考 |
|---|---|---|---|
| `--bg-primary` | 画像の主背景 | **`#0A0A0F`** （TBD: 確認） | 黒寄りの濃紺〜グラフェン色 |
| `--bg-secondary` | 副背景・カード面 | **`#1A1A24`** （TBD: 確認） | 主背景より一段明るい |
| `--text-primary` | メインテキスト | **`#FFFFFF`** | OGP画像の見出し |
| `--text-secondary` | 補助テキスト | **`#B8B8C8`** （TBD: 確認） | サブコピー・補足 |
| `--crystal-primary` | アクセント・ロゴ | **`#7DD3FC`** （TBD: 確認） | 「Crystal」=ダイヤ的なアクセント |
| `--crystal-accent` | CTA・装飾 | **`#A78BFA`** （TBD: 確認） | 紫寄りのクリスタル |

> 🔧 **担当者向け**: 上記 TBD 印が付いているHEXは `Highlite inc./design-system.html` を開いて DevTools の Computed Style から正確な値をコピペし、置き換えてください。**初回セットアップ時の必須タスク**。

### コントラストルール

- `--bg-primary` × `--text-primary` は WCAG AA 以上を満たすこと
- 文字を `--crystal-*` 単色で乗せるのはNG（視認性低下）

---

## 2. タイポグラフィ

| 用途 | フォント | サイズ目安 | ウェイト |
|---|---|---|---|
| 見出し（OGP上） | **Roboto** + フォールバック **Noto Sans JP** | 64–96px | 700 / 900 |
| サブコピー | Noto Sans JP | 32–40px | 400 / 500 |
| 本文（投稿テキストには適用外） | Noto Sans JP | — | 400 |

### 日英混在ルール

- 数字・英単語は Roboto、それ以外は Noto Sans JP（CSS の font-family で英語フォントを先に書く）
- 英字記号 `&` `:` `→` などは Roboto 採用

### Webフォント参照（OGPジェネレータ内で使用）

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
```

---

## 3. レイアウト原則（OGP / サムネ）

### サイズ

- **OGP（Facebook / LinkedIn / X 用）**: `1200 × 630px`
- **正方形（YouTrust / X カード代替 / Instagram連携用）**: `1080 × 1080px`
- **縦型（Story / Reels用 / 将来用）**: `1080 × 1920px`

### 余白

- 外周セーフエリア: 上下左右 80px（OGP）／ 60px（正方形）
- 見出しと副コピーの行間: 1.4〜1.6
- ロゴは右下 or 左下に固定（**右下推奨**）

### 構図テンプレ

```
+-----------------------------+
|                             |
|   見出し（最大2行）         |
|   Bold / 64-96px            |
|                             |
|   サブコピー（最大1行）     |
|   Regular / 32-40px         |
|                             |
|                       [HL] |
+-----------------------------+
```

---

## 4. ロゴ運用

- 単色版（白 / `--crystal-primary`）を背景色によって使い分け
- 高さ: OGPで 48〜72px / 正方形で 56〜80px
- セーフゾーン: ロゴ周囲にロゴの高さ × 0.5 以上の余白を確保

---

## 5. 投稿本文の装飾（テキストのみ）

SNSの本文ではフォントは媒体側で固定されるが、**改行と記号で擬似装飾**ができる。

- 段落は1行空行で区切る
- 強調は `■` `▼` `→` を使う（`★`は推奨しか使わない）
- 引用は `>` ではなく `「」` で。プラットフォームによって `>` が表示されない

NG: `「**強調**」のような Markdown 記法 → SNSは Markdown 不可

---

## 6. 画像化の最終チェック

- [ ] テキストが画像の50%以上を占めていない（FB広告ガイドライン準拠）
- [ ] 余白セーフエリアを侵していない
- [ ] ロゴが入っている（右下 or 左下）
- [ ] HLカラーパレットの範囲内
- [ ] スマホで文字が読めるサイズ感（96pxの見出しが基準）
