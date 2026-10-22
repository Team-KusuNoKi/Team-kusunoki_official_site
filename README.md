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
works/november-kyusai/            『11月の救祭』作品詳細
  ├ index.html                     作品ページ
  ├ site.css / favicon.svg         作品ページ用
app/index.html                     謎解きアプリ
app/assets/                        アプリの JavaScript / CSS / アイコン
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
『11月の救祭』は `/works/november-kyusai/`、アプリは `/app/` です。

## 公開

`main` ブランチへの push で Cloudflare Pages が自動的に配信します。
ビルドコマンドはなく、リポジトリの中身がそのまま公開されます。

『11月の救祭』アプリの元データは別の作業フォルダにあります。
アプリを更新したときは、`app/assets/` のファイルを元データの `webapp/dist/` から反映してください。
問題・会話は N1〜N4.5.1 まで反映しています。考察カードは動作確認用データです。
アプリの配信ファイルは `app/assets/release-日付-ハッシュ/` にまとめ、`app/index.html` から読み込みます。
JavaScript の相対 import、CSS の背景画像、問題画像・人物画像の参照を配信先に合わせて反映してください。

### CSS / JS を変えたとき

HTML はすぐ差し替わりますが、CSS と JS はブラウザに 4 時間キャッシュされます。
そのままだと、直したのに古い見た目のままに見えてしまいます。

`css/style.css` か `js/main.js` を変えたら、全 HTML の読み込み行にある
`?v=` の数字（日付）を上げてください。

```html
<link rel="stylesheet" href="/css/style.css?v=20260815">
<script src="/js/main.js?v=20260815"></script>
```

一括で置き換える場合：

```sh
sed -i '' 's/?v=[0-9]\{8\}/?v=20260901/g' *.html works/*.html
```

## 差し替えが必要な箇所

`TODO` コメントで印をつけてあります。

- お問い合わせフォームの URL（`index.html` の `#contact`）
- メンバー紹介（`index.html` の `#members`。写真は `images/members/` に置く想定）
- 『クスノキが枯れた日』の頒布開始日（お知らせの 2 件目）

## 画像について

`images/logo.png` は円の外側を透明にした表示用のロゴ。ヘッダー・フッター・
ローディング・ファビコンで使っています。`images/logo.jpg` は OGP 用の正方形版です。
どちらも `logo.jpg`（原本）から中心をそろえて書き出しています。
