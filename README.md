# sns-multi-post

> Highlite 公式 SNS（YouTrust / LinkedIn / Facebook / X）に、1ネタから同時投稿するためのスキル + テンプレ + ガイドライン一式。

3人の投稿担当が、誰がやっても同じ品質で投稿できることを目指したリポジトリです。

---

## 🚀 30秒で理解する

1. テーマを Claude に渡す（メモでも対話でも）
2. **4媒体 × 3案 = 12案** のブレストが出る
3. 媒体ごとに気に入った1案を選ぶ
4. **コピペで投稿可能な4本の下書き** が完成する
5. OGP画像が必要なら `ogp/generator.html` で生成
6. 各媒体の投稿画面に貼って、**投稿ボタンを押すだけ**

---

## 📁 ファイル構成

```
sns-multi-post/
├── README.md                       ← このファイル（人間用説明書）
├── SKILL.md                        ← Claudeが読む脳みそ（マスタープロンプト）
│
├── brand/                          ← Highlite ブランド定義（3人で共通）
│   ├── voice-tone.md               ← 語り口・推奨/NG表現  ← 一番重要
│   ├── messaging-pillars.md        ← 訴求の核（4ピラー）
│   └── design-tokens.md            ← OGP/サムネ用カラー・フォント
│
├── platforms/                      ← 各SNS仕様
│   ├── youtrust.md
│   ├── linkedin.md
│   ├── facebook.md
│   └── x.md
│
├── templates/
│   ├── input-memo.md               ← 担当者が事前に埋める入力テンプレ
│   └── output-format.md            ← Claudeの出力フォーマット定義
│
├── ogp/
│   ├── generator.html              ← ブラウザでHL公式OGPを作るツール
│   └── README.md
│
└── examples/                       ← 過去投稿の蓄積（learning material）
    ├── good/
    └── bad/
```

---

## 🔧 初回セットアップ（10分・1回だけ）

### 0. リモートリポジトリ

正規リポジトリ: **https://github.com/daiki-highlite/sns-multi-post** （public）

### 1. リポジトリを取得（2人目以降）

```bash
cd ~/Documents/Claude/Projects/Marketing-リードマーケ
git clone https://github.com/daiki-highlite/sns-multi-post.git
# もしくは SSH
# git clone git@github.com:daiki-highlite/sns-multi-post.git
```

### 2. デザイントークンの正しいHEXを埋める

`brand/design-tokens.md` を開くと **TBD** マーカー付きのHEX値が並んでいます。`Highlite inc./design-system.html` を開いて DevTools で正しい値を取得し、置き換えてください。

同時に `ogp/generator.html` の `:root { ... }` も同じ値に書き換えます（**両方**更新が必要）。

### 3. ボイス・トーンのレビュー

`brand/voice-tone.md` を3人で読み合わせて、認識合わせ。違和感あったらPRで修正。

### 4. Claude (Cowork) で起動できるか確認

Cowork で「sns-multi-post で投稿作りたい」と話しかけて、SKILL.md が起動することを確認。

---

## 🎯 投稿フロー（毎回 / 担当者向け）

### ステップ 1: 入力を準備（任意）

`templates/input-memo.md` をコピーして `templates/input-memo-2026-04-28.md` のように保存し、テーマ・要点・ターゲット等を埋める。

> **埋めなくてもOK**: Claudeに直接話しかければ、対話形式で1問ずつ聞いてくれます。

### ステップ 2: Claude に投げる

Cowork で次のように言う：

```
sns-multi-post スキルで投稿案を作って。
（事前メモ使う場合）templates/input-memo-2026-04-28.md を元に。
```

### ステップ 3: 12案を確認 → 1案ずつ選ぶ

Claudeが媒体ごとに3案ずつ（合計12案）出してくる。**★ Recommended** マーク付きの推奨案あり。

```
YouTrust: A / B / ★C →  あなたの選択
LinkedIn: A / B / ★C →  あなたの選択
Facebook: A / B / ★C →  あなたの選択
X:        A / B / ★C →  あなたの選択
```

「全部推奨でOK」と言えば全部 ★ 採用。気に入らない媒体だけ「Bでもう一度作り直して」と言ってもよい。

### ステップ 4: 最終下書きを受け取る

Claudeが4媒体ぶんの**コピペ可能な投稿本文 + チェックリスト + 投稿先URL**を出してくれます。

### ステップ 5: OGP画像が必要なら生成

`ogp/generator.html` を開いて、Claudeが提案したキャッチコピーを貼って、PNG書き出し。

### ステップ 6: 各SNSで投稿ボタンを押す

下書きの末尾に各媒体の投稿画面リンクがあるので、クリック → 本文をペースト → 画像添付 → 投稿。

### ステップ 7: アーカイブ（推奨）

3〜7日後、リアクション数を `examples/good/{投稿日}-{slug}.md` にメモする。
**これをサボらないと、Claudeの出力品質が回を追うごとに上がる**。

---

## 👥 役割分担（3人運用の推奨）

| 役割 | 主な責任 |
|---|---|
| **企画担当** | 投稿ネタを発掘 → input-memo を埋める |
| **生成・選定担当** | Claudeを叩いて12案出させ、1案ずつ選定 |
| **投稿実行担当** | OGP生成 → 各SNSで投稿ボタンを押す → アーカイブ記入 |

3人とも同じ人がやってもOKだが、特に「ボイス・トーンの逸脱」は他人の目の方が気付きやすい。**生成と投稿は別の人**が推奨。

---

## ✏️ ファイル更新ルール

| ファイル | 誰が更新できるか | 方法 |
|---|---|---|
| `brand/voice-tone.md` | マーケ責任者の承認後 | PR必須 |
| `brand/messaging-pillars.md` | マーケ責任者の承認後 | PR必須 |
| `brand/design-tokens.md` | デザイン担当 | PR必須（HEX変更時） |
| `platforms/*.md` | 投稿担当全員 | PR推奨（小規模ならdirect commit可） |
| `templates/*.md` | 全員 | direct commit可 |
| `examples/good/`, `bad/` | 投稿担当 | direct commit可（積極的に追加） |
| `SKILL.md` | マーケ責任者の承認後 | PR必須 |
| `ogp/generator.html` | デザイン担当 | PR必須 |

---

## 🛠 トラブルシュート

### Claudeがブランドガイドラインを無視する
→ `SKILL.md` の冒頭に書いてある「起動時に必ず読むファイル」が読み込まれていない可能性。「voice-tone.md と messaging-pillars.md を必ず読み込んで」と明示。

### 出力が抽象的・スローガン的
→ `brand/voice-tone.md` の NG 表現が機能していない。Claudeに「voice-tone.md の NG 表現を再チェックして書き直して」と指示。

### 12案の方向性が似通っている
→ Phase 2の3案構造（A結論ファースト / Bストーリー / C問いかけ）を再指定。

### 文字数オーバーする
→ Claudeに「{媒体名}は {字数}字以内に厳密に収めて」と指示。

### OGP画像のフォントが反映されない
→ ネット接続を確認（Google Fonts のCDN必要）。オフライン運用したい場合はWebフォントをローカルに同梱する必要あり。

---

## 🔐 セキュリティ・コンプライアンス

- **顧客名・社外秘・未公開数値の混入チェック**は投稿前に必ず行う（`voice-tone.md` 参照）
- **画像の人物が特定できる場合は本人承諾** を確認
- **APIキー・認証情報をこのリポジトリに置かない**（投稿は手動で行うので不要）

---

## 🔗 関連リンク

- [Highlite Design System (社内)](https://daiki-highlite.github.io/highlite-design-system/)
- [YouTrust 投稿画面](https://youtrust.jp/feeds)
- [LinkedIn 投稿画面](https://www.linkedin.com/feed/?shareActive=true)
- [Facebook ホーム](https://www.facebook.com/)
- [X 投稿画面](https://x.com/compose/post)

---

## 📝 ChangeLog

- 2026-04-28: 初版作成（Daiki + Claude）
