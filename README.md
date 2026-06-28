# クミカン — 組み漢字パズル

漢字パーツ（へん・つくり・かまえ等）を合体させて漢字を完成させる、家族向けのブラウザゲームです。同じ LAN 内の端末同士を **WebRTC で直接つないで対戦**でき、外部のゲームサーバーを必要としません（完全 P2P）。

🔗 **遊ぶ**: https://ypsilonmeister.github.io/kumikan/

---

## 特徴

- **完全ローカル P2P** — WebRTC DataChannel で端末同士を直接接続。ゲーム用サーバー不要。
- **3 つの遊び方**
  - 1 台でみんなで回しながら遊ぶ（ホットシート）
  - ホストになって 2 台で対戦
  - 別の端末から参加
- **QR / コピペで接続** — シグナリング情報を QR コードで渡すか、文字列をコピペして接続。
- **PWA** — ホーム画面に追加でき、一度開けばオフラインでも起動。
- **タッチ操作対応** — 手札を場札へドラッグ、またはタップで提示（Pointer Events）。

## 遊び方（ゲームルール）

1. 各プレイヤーに漢字パーツが配られ、残りは「山札」になります。
2. 手番の開始時、山札から 1 枚めくられて「場」に出ます。
3. 手番のプレイヤーは、場札と合体できるパーツを手札から出します。
   - **成立** → 漢字が完成して得点。続けて同じ人が行動。
   - **不成立 / パス** → 次の人へ。
4. だれかの手札が 0 枚になったら終了。完成漢字が最も多い人の勝ち。

## 接続のしかた（2 台対戦）

1. ホスト側で「ホストになる」を選び、表示された QR / 文字列を相手に渡す。
2. 参加側で「参加する」を選び、ホストの QR を読み取る（または貼り付け）。
3. 参加側に出た「アンサー」をホストへ渡す。
4. 接続が確立するとゲームが始まります。

> カメラでの QR スキャンは HTTPS（公開版）でのみ動作します。ローカルの HTTP 接続では文字列のコピペをご利用ください。

## 技術スタック

| 領域 | 採用 |
| --- | --- |
| UI | React 18 + TypeScript |
| ビルド | Vite |
| 通信 | WebRTC DataChannel（ホスト権威モデル / Star トポロジ） |
| シグナリング | SDP Munging（必須要素抽出 + 再構築）→ Base64 → QR |
| QR | `qrcode`（生成） / `jsQR`（読み取り） |
| PWA | `vite-plugin-pwa` |
| テスト | Vitest |

設計の詳細は [docs/design.md](docs/design.md)、仕様は [docs/spec.md](docs/spec.md) を参照。

## 開発

```bash
npm install        # 依存をインストール
npm run dev        # 開発サーバー（http://localhost:5173/kumikan/）
npm run build      # 型チェック + 本番ビルド
npm run preview    # ビルド結果をローカル配信
npm test           # ユニットテスト（Vitest）
npm run gen-icons  # public/favicon.svg から PWA アイコンを再生成
```

### プロジェクト構成

```
src/
├─ domain/   ゲームの純粋ロジック（レシピ判定・山札・状態遷移）
├─ net/      接続層（Transport 抽象・WebRTC・SDP・QR シグナリング）
├─ app/      結合層（ホスト権威コントローラ / 子機コントローラ）
├─ ui/       画面・コンポーネント・スタイル
└─ test/     ユニットテスト
```

## デプロイ

`main` ブランチへ push すると GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が
ビルドして GitHub Pages へ公開します。Pages の Source は **GitHub Actions** に設定してください。
配信パスは `/kumikan/`（[vite.config.ts](vite.config.ts) の `base`）です。

## ライセンス

MIT
