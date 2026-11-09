# SNS別の操作指示

先に [HARNESS.md](HARNESS.md) を読む。画面は変わるため現在の表示を読み、見えている操作対象から進む。`schedule` を即時投稿へ変更しない。有料API・外部予約サービス・有料プランは利用しない。

## X

- `destination.url` を開き、投稿主体を `destination.username` と照合する。本文は `text` または各 `parts[].text` のまま使い、連投番号を付けない。画像は指定された部分にだけ添付する。
- **予約**：通常の投稿作成画面で全 `parts` を順番に追加し、予約日時を設定する。全件を一つの連投として予約できることを現在の画面で確認する。予約一覧でも全件・日時・順序・返信関係を確認する。2026-11-09の画面では2件の連投に同じ日時を設定できる表示を確認したが、自動公開結果の実証ではない。表示変更や制限で全件確認できない場合は止める。独立投稿への分割や一部だけの予約へ置き換えない。
- 予約管理URLは実際に開いた `/compose/post/unsent/scheduled` または `/compose/tweet/unsent/scheduled` を記録する。
- **今すぐ公開**：親は通常の投稿欄、続きは記録済み `replyTo` への自己返信。公開後は観測した `https://x.com/<指定ユーザー名>/status/<投稿ID>` を記録する。
- **予約後の確認**：全件の正式URLと返信関係を確認する。親だけのURLで連投全体を公開済みとしない。

## LinkedIn会社ページ

- 会社ページで投稿を作成し、個人名義ではないことを確認する。本文・画像・リンクカードの表示を照合する。
- **予約**：投稿作成画面の予約機能で日本時間と照合する。公式条件は1時間以上先・3か月以内、会社ページの複数画像投稿は予約対象外。現在のSNS画面でも実行可能か確認し、日時を勝手にずらさない。
- 予約一覧で本文・画像・日時・会社を確認し、実際に開いた `/company/<指定会社ID>/admin/…` の管理画面URLを記録する。
- 公開後の正式URLは `/feed/update/urn:li:activity:…`、`/feed/update/urn:li:share:…` または `/posts/…-activity-…`。コロンが `%3A` の形式も使える。会社トップURLは公開証拠にならない。
- 条件の根拠：[LinkedIn公式ヘルプ：Schedule a post for a LinkedIn Page](https://www.linkedin.com/help/linkedin/answer/a1419179/schedule-a-post-for-a-linkedin-page?lang=en)（2026-11-09確認）。

## Facebookページ

- `destination.url` で指定ページと投稿主体を照合する。個人プロフィール・別ページ・グループへ投稿しない。
- **予約**：ページの投稿作成画面やMeta Business Suiteの予約機能を使用する。現在表示される予約可能期間・形式・タイムゾーンを確認する。アプリで検証していない期間制限を推測しない。希望日時を選べなければ止める。
- 予約一覧で本文・画像・日時・ページを確認する。実際に開いた公式Facebookの `/professional_dashboard…` または `/latest…` の管理画面URLを記録する。Business Suiteの内部asset IDとページIDを同一と仮定しない。
- 公開後は投稿の日時やメニューから投稿詳細を開き、指定ページIDを含む `/permalink.php?story_fbid=…&id=…` または `/<指定ページID>/posts/<投稿ID>` を記録する。
- `/share/p/…` の共有短縮URLやページトップでは記録しない。正式URLを観測できない場合は推測せず結果確認に残す。
