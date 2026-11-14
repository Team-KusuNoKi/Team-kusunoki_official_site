# Team.KusuNoKi 公式サイト

京都を拠点に活動する謎解き制作チーム **Team.KusuNoKi** の公式サイトです。

**https://team-kusunoki.com**

## 概要

ビルド不要の静的サイトです。リポジトリの中身がそのまま Cloudflare Pages から配信されます。

## 構成

- `index.html` — トップページ（お知らせ・概要・作品・メンバー・お問い合わせ）
- `works/` — 作品詳細ページ
- `contact/` — お問い合わせページ
- `11月の救祭/` — 謎解きアプリ『11月の救祭』
- `css/` `js/` `images/` — 共通アセット
- `functions/` — Cloudflare Pages Functions（アプリのセーブAPI）

## ローカルで確認する

パスを絶対指定しているため、ファイルを直接開くのではなく簡易サーバー経由で開いてください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

## 技術スタック

- HTML / CSS / JavaScript（フレームワーク・ビルドツールなし）
- Cloudflare Pages（ホスティング）
- Cloudflare Pages Functions + D1（セーブAPI）

サイトのデザインルールは [DESIGN.md](DESIGN.md) にまとめています。
