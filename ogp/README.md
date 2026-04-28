# OGP / サムネ画像ジェネレータ

ブラウザだけで完結するHL公式SNSの画像生成ツール。
`generator.html` をダブルクリックするだけで使える（ローカルで動く）。

---

## 使い方

1. このフォルダの `generator.html` をダブルクリックでブラウザで開く
   - もしくは Cowork から `[generator.html を開く](computer:///Users/daikihayakawa/Documents/Claude/Projects/Marketing-リードマーケ/sns-multi-post/ogp/generator.html)` をクリック
2. 左パネルでサイズプリセットを選ぶ
   - **OGP 1200×630**: LinkedIn / Facebook / X カード用
   - **Square 1080×1080**: YouTrust / X 単独画像 / Instagram連携用
   - **Vertical 1080×1920**: Reels / Story / TikTok等の縦型用
3. 見出し・サブコピー・右下メタ（日付やカテゴリ）を入力
4. ブランドカラーは初期値が入っているが、必要に応じて変更
5. 「PNG ダウンロード」 or 「画像コピー」ボタンで書き出し

---

## ブランドトークンとの関係

`generator.html` の冒頭 CSS に `:root { ... }` で定義されている色は、`brand/design-tokens.md` と同期しています。

> 🔧 **重要**: `brand/design-tokens.md` の TBD マーカー付きHEXを正しい値に更新したら、**この `generator.html` の `:root` 値も書き換える**こと。両方更新が必要。

---

## 推奨ワークフロー

`sns-multi-post` スキルが Phase 4 で出してくる「OGP用キャッチコピー2案」をそのまま見出しに貼って、サブコピーをClaude生成のものに合わせて、PNG書き出し → 各SNSにアップ。

---

## トラブル

- **フォントが表示されない** → ネット接続を確認（Google Fonts を CDN 経由で取得）
- **画像コピーが動かない** → ブラウザの権限を確認。動かなければダウンロード使用
- **書き出しPNGの色が画面と違う** → ブラウザのカラープロファイル設定。Chrome 推奨
- **見出しが切れる** → 文字数を減らすか、フォントサイズを `--head-size` で調整（HTMLを編集）

---

## 将来拡張のメモ

- ロゴ画像のアップロード対応
- 複数案を並列で見比べるサムネ一覧モード
- HLの「ダイヤモンドボタン」モチーフをアクセントとして配置するバリエーション
- ブランドガイドラインの正規HEX値をfetchして自動同期（design-system.html がGitHub Pagesに上がっているなら）
