# Team.KusuNoKi 公式サイト

京都発の謎解き制作チーム Team.KusuNoKi の公式サイト。ビルド不要の静的サイトです。

## 構成

```
index.html                        トップ（1ページ完結）
  ├ ヒーロー
  ├ #news      お知らせ
  ├ #about     概要
  ├ #works     作品
  ├ #members   メンバー
  └ #contact   お問い合わせ
works/kusunoki-ga-kareta-hi.html  作品詳細
404.html                          存在しないページ
css/style.css                     全ページ共通のスタイル
js/main.js                        演出とページ内スクロール
images/                           ロゴ・写真
```

ヘッダーとフッターのナビゲーションは、すべてトップページ内のアンカーです。

## ローカルで確認する

パスを絶対指定（`/css/style.css` など）しているため、ファイルを直接開くのではなく
簡易サーバー越しに見てください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

作品詳細へのリンクは、Cloudflare Pages に合わせて拡張子なし
（`/works/kusunoki-ga-kareta-hi`）にしてあります。
`python3 -m http.server` は拡張子の補完をしないため、ローカルではこのリンクだけ
404 になります。ローカルで開くときは `.html` を付けてください。本番では 200 です。

## 公開

`main` ブランチへの push で Cloudflare Pages が自動的に配信します。
ビルドコマンドはなく、リポジトリの中身がそのまま公開されます。

## 差し替えが必要な箇所

`TODO` コメントで印をつけてあります。

- お問い合わせフォームの URL（`index.html` の `#contact`）
- メンバー紹介（`index.html` の `#members`。写真は `images/members/` に置く想定）
- 『クスノキが枯れた日』の頒布開始日（お知らせの 2 件目）

## 画像について

`images/logo.png` は円の外側を透明にした表示用のロゴ。ヘッダー・フッター・
ローディング・ファビコンで使っています。`images/logo.jpg` は OGP 用の正方形版です。
どちらも `logo.jpg`（原本）から中心をそろえて書き出しています。
