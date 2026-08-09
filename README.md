# ぽんぽこ もりの あそび

1〜2歳ごろの子どもが、たぬきと一緒に「色・形・1〜3の数」を楽しむiPad向け知育Webアプリです。正解まで何度でも試せる、減点・広告・外部リンクのない設計です。

## 遊び

- **いろ**: 見本と同じ色の木の実を選ぶ
- **かたち**: 見本と同じ形を選ぶ
- **かず**: たぬきに1〜3個のどんぐりを渡して数える
- **おまかせ**: 3つの遊びを順番に楽しむ

問題は日本語で読み上げられます。効果音・読み上げ・アニメーションは保護者メニューで調整できます。遊んだ記録は端末内にのみ保存され、外部へ送信されません。

## ローカルで動かす

Node.js 20以上とPython 3を使用します。外部パッケージのインストールは不要です。

```bash
npm test
npm run lint
npm run build
npm run dev
```

`http://localhost:4173` をSafariで開いてください。`npm run dev` はビルド後の静的ファイルを配信します。

## GitHub Pages

`main` ブランチへのpushで、GitHub Actionsがテストとビルドを実行し、`dist/` をGitHub Pagesへ公開します。リポジトリの **Settings → Pages → Build and deployment → Source** は **GitHub Actions** を選択してください。

iPadではSafariの共有ボタンから「ホーム画面に追加」を選ぶと、アプリに近い表示で起動できます。一度読み込んだ後は、主要画面をオフラインでも利用できます。

## 構成

```text
src/                 アプリ本体（HTML / CSS / JavaScript）
tests/               ゲームロジックの自動テスト
assets/              画像素材
public/              PWAマニフェスト、アイコン、Service Worker
scripts/             ビルドスクリプト
.github/workflows/   GitHub Pages自動公開
```

## 画像素材

`assets/tanuki-forest.png` は、このアプリ用にOpenAIの組み込み画像生成機能で作成したオリジナル素材です。

生成プロンプトの要旨: 「1〜2歳向け知育アプリ用。手を振る優しいたぬき1匹、絵本のガッシュと紙の質感、ミントとクリームの森、文字・ロゴ・怖い要素なし」。

## プライバシー

アカウント登録、解析タグ、広告、Cookie、外部API通信はありません。設定と正解数はブラウザの`localStorage`に保存され、保護者メニューから消去できます。
