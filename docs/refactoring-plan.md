# リファクタリング計画書

| 項目 | 内容 |
| --- | --- |
| 対象 | `src/` 全体（scripts/ はビルド時ツールのため対象外、現状維持で問題なし） |
| 分析日 | 2026-07-02 |
| 前提 | [design.md](./design.md) が定める依存方向の原則 `ui → app → net / domain`（domain は無依存） |
| 方針 | **コード変更なし。分析と提案のみ。** |
| **実施状況** | **全 5 フェーズ完了（2026-07-02）。** tsc / 57 テスト / build 緑、ローカルモードの実機スモークテスト済み。 |

## 実施結果メモ（計画からの逸脱）

- フェーズ 4 の想定を超えて、**オンラインモードにも結果通知と行動音（成功/失敗/パス）を対称に配信**する形になった（新設 `ACTION_RESULT` メッセージ）。成功音が元々全端末で鳴っていたことと整合する統一であり、採用。
- `ActionResult` 型はワイヤ型 `ActionResultMessage`（net/messages.ts）を単一の真実とし、app/events.ts はエイリアスにした（二重定義ドリフト防止）。
- `SfxBinding` はモードを `reset(mode)` で事前確定する API にした（セッション生成中に同期発火するイベントへ正しいモードを適用するため）。
- 許容した等価差: ローカルで「場札なし / 手札に無い partId」の提出が手番交代でなく無視になる（UI の canAct ガードにより到達不能）。ホスト接続直後の state 配信順を「初期→接続反映」に修正（旧実装の潜在バグ解消）。

---

## 1. 現状の依存関係と構造的ボトルネック

### 1.1 依存グラフ（import の実測）

```
main.tsx ──▶ App.tsx ──▶ ui/styles/global.css
                │
                ├─▶ domain/deck ───────▶ domain/recipes
                ├─▶ domain/engine ─────▶ domain/{recipes, deck, types}
                ├─▶ domain/types
                ├─▶ app/hostController ─▶ domain/{engine,types}, net/{transport,messages}
                ├─▶ app/guestController ▶ domain/types, net/{transport,messages},
                │                         app/hostController (FusionEvent 型) ← ★兄弟結合
                ├─▶ net/hub ────────────▶ net/{messages, rtcConnection, transport}
                ├─▶ net/rtcConnection ──▶ net/{messages, inbox}
                ├─▶ audio/sfx           （独立・localStorage 副作用あり）
                │
                ├─▶ ui/screens/LobbyScreen   （依存なし）
                ├─▶ ui/screens/ConnectScreen ▶ net/rtcConnection, net/sdp ← ★ui→net 直結
                │        └─▶ ui/components/{QrDisplay(qrcode), QrScanner(jsqr)}
                └─▶ ui/screens/GameScreen ──▶ domain/types,
                         ui/components/{FieldCard, FuseAnimation, Hand}
                              ├─ Hand ─▶ Card ─▶ domain/types, ui/partImage
                              ├─ FieldCard ────▶ domain/types, ui/partImage
                              └─ FuseAnimation ▶ domain/types,
                                                domain/recipes (partReading) ← ★ui→domain内部

net/messages ──▶ domain/types (PublicGameState)   ← net→domain の横断（後述）
net/transport ─▶ net/messages
net/sdp        （独立・純粋）
domain/types   （独立・純粋）
domain/recipes （独立だが「データ+ロジック+表示情報」が混在）
```

**良い点（維持すべき資産）**:
- `domain/` は UI・通信に依存しない純粋関数群で、テストも充実している（design.md の原則どおり）。
- `Transport` インターフェースによる接続層の抽象化と、ホスト権威モデル自体は健全。
- `net/sdp`・`net/inbox` は単一責務で完結しており、テストも十分。

### 1.2 循環依存

**真の import 循環（実行時サイクル）は存在しない。** ただし循環の一歩手前にある結合が 1 箇所ある:

- `app/guestController.ts` → `app/hostController.ts`（`FusionEvent` 型の輸入）
  対等であるべき兄弟モジュール同士の結合。将来 hostController が guest 側の型を参照した瞬間に循環が成立する構造。`FusionEvent` は「合体演出イベント」というモード共通の概念であり、hostController が所有するのは責務の誤配置。

### 1.3 God Object: `App.tsx`（最大のボトルネック）

380 行の `App.tsx` に **6 つの異質な責務**が同居している:

1. **画面ルーティング**（lobby / connect / game）
2. **ローカルモードのゲーム進行ロジック**（`localSubmit` / `localPass` / `localHint`）
3. **ホスト/ゲストの結線（コンポジションルート）**（`Hub`・`HostController`・`GuestController` の生成、ゲスト用 Transport アダプタのインライン定義）
4. **通知（notice）のライフサイクル管理**（`noticeScopeKey` / `scopeKeyForState` による寿命制御）
5. **効果音のオーケストレーション**（`prevPhaseRef` / `prevCurrentRef` による状態差分検知 useEffect ×3 ＋ ハンドラ内直接呼び出し）
6. **モード分岐ディスパッチ**（`modeRef` による `onSubmit` / `onPass` / `onHint` の三分岐）

派生する具体的な問題:

- **ロジック重複**: `localSubmit`（[App.tsx:162](../src/App.tsx)）は「成功→手番維持、失敗→`passTurn`」という判定フローを `HostController.applySubmit`（[hostController.ts:105](../src/app/hostController.ts)）と二重実装している。ローカルモードは本質的に「子機ゼロのホスト」なのに別系統で書かれており、ルール変更のたびに 2 箇所の同期修正が必要（直近コミット「合体失敗時もパスと同様に…」でも両方に手が入っている）。
- **ヒント重複**: `localHint` と `onHint` がほぼ同一のコード。
- **効果音トリガの経路が二重**: 成功/勝利/手番は「gameView の差分監視 useEffect」、失敗/パスは「ハンドラ内の直接呼び出し」と 2 系統に割れている。その結果 **ホスト/ゲストモードでは合体失敗音が一切鳴らない**（`sfx.playFail()` はローカル分岐にしかない）という機能非対称が既に発生している。これは「ドメインイベントの単一チャネルが無い」ことの症状。
- **ref 逃がしの多用**: `modeRef` / `handSizeRef` / `hostNameRef` / `guestNameRef` は stale closure 回避のための応急処置であり、セッション状態が React の外に正規の置き場を持たないことを示す。
- **テスト不能**: 上記ロジックはすべて React コンポーネント内にあり、vitest の単体テスト対象にできない（実際 `src/test/` には App 相当のテストが皆無。`GuestController` も未テスト）。

### 1.4 レイヤー越え

design.md の原則 `ui → app → net / domain` に対する違反:

| 違反箇所 | 内容 | 影響 |
| --- | --- | --- |
| `ui/screens/ConnectScreen.tsx` → `net/rtcConnection`, `net/sdp` | UI が WebRTC 接続確立のステートマシン（offer/answer 手順、`RtcConnection` の生成と生存管理）を直接所有。`onConnected(conn: RtcConnection)` で生コネクションを App に引き渡す | 接続方式の変更（例: 自動シグナリング追加）が UI 改修になる。接続手順の単体テストが不可能 |
| `App.tsx` 内のゲスト用 Transport アダプタ（[App.tsx:257](../src/App.tsx)） | `Transport` 契約の匿名再実装が UI ルートに埋め込まれている。ホスト側の `Hub` は `net/` にあるのに、ゲスト側の対応物が `net/` に存在しない非対称 | `Transport` 契約変更時に型エラーで検出されにくい（構造的部分型のため） |
| `ui/components/FuseAnimation.tsx` → `domain/recipes.partReading` | 表示用の「よみ」解決を UI が domain のデータ関数を直接叩いて行う | `Kanji.from` が kind 文字列のまま UI に届くのが根因。表示情報がデータに載っていない |
| `net/messages.ts` → `domain/types` | ワイヤフォーマットがドメイン内部型 `PublicGameState` をそのまま直列化 | 現状 2 台 MVP では許容可。ただし protocol にバージョン番号が無く、片側だけ更新された端末間で無言の非互換が起きる |

### 1.5 `domain/recipes.ts` の責務混在

1 ファイルに 3 種の異なる関心が同居:

1. **辞書データ**: 300 行の `RAW_KANJI_RECIPES` リテラル（scripts/ の生成パイプラインが提案 → 人手で TS ソースへ転記、という不自然なデータフロー）
2. **判定ロジック**: `recipeKey` / `checkCombination` / `pickRecipeParts`
3. **表示情報**: `PART_READINGS`（よみ）と `PART_IMAGES`（**`public/parts/` の SVG ファイル名**）— 後者は明確にプレゼンテーション層の知識であり、domain が静的アセットのファイル名を知っているのはレイヤー違反

さらに `domain/deck.ts` の `makePart` が `label` / `reading` / `image` という**表示専用フィールド**を Part に焼き込んでおり、ドメイン型 `Part` 自体が UI 関心で汚染されている（照合に使うのは `kind` のみ）。

### 1.6 ボトルネックまとめ

| # | 分類 | 箇所 | 深刻度 |
| --- | --- | --- | --- |
| B1 | God Object | `App.tsx`（6 責務・ロジック重複・テスト不能） | 高 |
| B2 | レイヤー越え | `ConnectScreen` → net 直結、生 `RtcConnection` の受け渡し | 高 |
| B3 | 兄弟結合 | `guestController` → `hostController`（`FusionEvent`） | 中 |
| B4 | 責務混在 | `recipes.ts`（データ+ロジック+表示）、`Part` 型の表示フィールド | 中 |
| B5 | 契約の非対称 | ゲスト側 Transport 実装が net/ に無い（匿名アダプタ） | 中 |
| B6 | イベント経路の分裂 | 効果音・通知が「状態差分監視」と「直接呼び出し」の 2 系統（ホスト/ゲストで失敗音が鳴らないバグの温床） | 中 |
| B7 | テスト欠落 | `GuestController`・notice 寿命・モード分岐が未テスト | 中 |
| B8 | プロトコル | `NetMessage` にバージョンが無い | 低（2 台 MVP のうちは） |

---

## 2. アーキテクチャ方針

### 2.1 中心となる考え方: 「モード」を Strategy として第一級に

現状の `modeRef` 三分岐を廃し、**3 モードを同一インターフェースの実装として統一**する。

```
┌────────────────────────────────────────────────┐
│ ui/ （画面とコンポーネント。GameSession だけを知る）│
└───────────────┬────────────────────────────────┘
                │ GameSession（新設・app/ が所有）
                │   submit(partId, fieldPartId?) / pass() / hint() / close()
                │   onEvent(cb: (e: SessionEvent) => void)   ← 状態も演出もここに一本化
                ▼
┌──────────────────────────────────────────────────────────┐
│ app/                                                      │
│  LocalSession   = HostController を transport なしで再利用 │
│  HostSession    = HostController + Hub                    │
│  GuestSession   = GuestController + GuestTransport        │
│  events.ts      = SessionEvent / FusionEvent の定義       │
└──────┬──────────────────────────────┬────────────────────┘
       ▼                              ▼
   domain/（純粋・現状維持）      net/（Transport 契約・現状維持＋GuestTransport 追加）
```

- **LocalSession は HostController の再利用**で実現する。「ローカル＝子機ゼロのホスト」と捉えれば、`localSubmit` / `localPass` の重複実装（B1）は丸ごと削除できる。transport には何も送らない Null 実装を渡すだけでよい。
- `App.tsx` は「画面ルーティング＋現在のセッションの保持」だけになる（目標: 100 行前後）。

### 2.2 イベントの単一チャネル化

効果音・通知・演出のトリガを **SessionEvent ストリーム**（`state-changed` / `fusion` / `submit-failed` / `pass` / `turn-changed` / `game-over`）に一本化する。

- `audio/sfx` はイベント購読アダプタ（`app/sfxBinding.ts` 等）経由で鳴らす。App の差分監視 useEffect ×3 と `prevPhaseRef` / `prevCurrentRef` は不要になる。
- ホスト/ゲストモードで失敗音が鳴らない非対称（B6）は、イベント発生源が engine 判定の直後（HostController 内）に一本化されることで自然に解消する。
- notice の寿命管理（scopeKey）は `useNotice` フックとして抽出し、イベントを入力に取る。

### 2.3 接続確立の UI からの分離

- `net/guestTransport.ts` を新設し、匿名アダプタ（B5）を正式な `Transport` 実装に昇格。
- offer/answer の手順（ステートマシン）を `app/signaling.ts`（または `useSignaling` フック）に抽出し、`ConnectScreen` は「文字列の表示・入力・QR」という純粋なプレゼンテーションに落とす。UI が受け渡すのは生の `RtcConnection` ではなく、確立済みの `Transport`（あるいはセッションファクトリ）にする。

### 2.4 データ・ロジック・表示の分離（domain の純化）

- `RAW_KANJI_RECIPES` を `domain/recipes.data.ts`（将来的には scripts が直接生成する JSON）に分離し、`recipes.ts` はロジックのみにする。scripts → 人手転記 → TS という現状のデータフローを「scripts が生成物を直接吐く」形に近づける下地。
- `PART_IMAGES`（SVG ファイル名）と `PART_READINGS` は表示関心なので `ui/partAssets.ts` へ移動。`Part` 型から `label` / `reading` / `image` を外し、UI 側で `kind → 表示情報` を解決する（`FuseAnimation` の domain 直叩き B4 も同時に解消）。
  - 注: `Part.label` は現在 net 経由でゲストにも送られているため、この変更は表示解決を受信側 UI に寄せることになり、**通信ペイロードの削減**という副次効果もある。

### 2.5 変えないもの

- `domain/engine` の純粋関数スタイルとホスト権威モデル。
- `Transport` 契約と `Hub` / `RtcConnection` / `Inbox` / `sdp` の分割。
- `NetMessage` のスナップショット同期方式（差分同期にはしない）。バージョンフィールドの追加のみ検討（B8、フェーズ 5）。

---

## 3. 段階的リファクタリング・ロードマップ

各フェーズは独立してマージ可能な粒度とし、**全フェーズで既存テスト（`npm run test`）が緑であること**を共通の完了条件とする。挙動変更は原則なし（フェーズ 4 の失敗音修正のみ意図的な挙動修正）。

### フェーズ 1: 依存の整流化（小さく安全な移動だけ）

- **目的**: 兄弟結合・契約の非対称・UI→domain 直叩きを、ロジックを変えずに解消する。B3・B5・B4(一部) に対応。
- **対象ファイル**:
  - 新設 `src/app/events.ts` — `FusionEvent`（将来 `SessionEvent` に拡張する置き場）を移設。`hostController` / `guestController` / `App` の import を張り替え。
  - 新設 `src/net/guestTransport.ts` — App 内の匿名アダプタを `Transport` 実装クラスとして移設（`implements Transport` で契約違反をコンパイル時検出可能に）。
  - `src/ui/components/FuseAnimation.tsx` — `partReading` の直接参照をやめ、表示文字列を props で受け取る形へ（呼び出し側 `GameScreen` / `App` で解決）。
- **完了条件**: `guestController.ts` から `hostController` への import が消える。`App.tsx` にオブジェクトリテラルの Transport が存在しない。`ui/` から `domain/recipes` への import が消える。全テスト緑・手動で 3 モード疎通確認。

### フェーズ 2: domain の純化（データ・表示情報の分離）

- **目的**: `recipes.ts` の責務混在と `Part` 型の表示フィールド汚染を解消する。B4 に対応。
- **対象ファイル**:
  - 新設 `src/domain/recipes.data.ts` — `RAW_KANJI_RECIPES` を分離（scripts の生成先として将来自動化できる形式に）。
  - 新設 `src/ui/partAssets.ts` — `PART_READINGS` / `PART_IMAGES` / `partImageUrl`（現 `ui/partImage.ts` を統合）を集約し、`kind → { label, reading, imageUrl }` の解決関数を提供。
  - `src/domain/recipes.ts` — ロジック（`recipeKey` / `checkCombination` / `pickRecipeParts`）のみ残す。
  - `src/domain/types.ts` / `src/domain/deck.ts` — `Part` から `label` / `reading` / `image` を除去し `makePart` を簡素化（`id` + `kind` のみ）。
  - 追随修正: `Card.tsx` / `FieldCard.tsx` / `Hand.tsx` / `GameScreen.tsx`（ghost 表示）/ `engine.ts`（`findPlayablePart` の返り値利用箇所）/ 各テスト。
- **完了条件**: `domain/` に表示専用の文字列（SVG ファイル名・よみ）が存在しない。`recipes.ts` が 100 行未満になる。ネットワークに流れる `Part` が `{id, kind}` に縮む。全テスト緑。

### フェーズ 3: GameSession 導入と App の解体（本丸）

- **目的**: God Object を解消し、ローカルモードの重複ロジックを HostController に統合する。B1 に対応。
- **対象ファイル**:
  - 新設 `src/app/session.ts` — `GameSession` インターフェースと `SessionEvent` 型。
  - 新設 `src/app/localSession.ts` — `HostController` + Null transport で実装（`localSubmit` / `localPass` / `localHint` 相当を吸収。ヒントは `findPlayablePart` を使う共通実装に一本化）。
  - 新設 `src/app/hostSession.ts` / `src/app/guestSession.ts` — 既存コントローラ + Hub / GuestTransport の結線を移設。
  - `src/App.tsx` — 画面ルーティングと「現在のセッション」保持のみに縮小。`modeRef` / `handSizeRef` / `hostNameRef` / `guestNameRef` を廃止し、セッション生成時の引数に置き換え。
  - 新設 `src/test/session.test.ts` — LocalSession の一連のプレイ（成功→継続、失敗→手番交代、パス、終了）を UI なしで検証。
- **完了条件**: `App.tsx` から `domain/engine` の直接 import が消える（engine を呼ぶのは app/ 層のみ）。`App.tsx` が概ね 150 行以下。`onSubmit` / `onPass` / `onHint` にモード分岐が存在しない。ローカルモードのルール変更が HostController 1 箇所の修正で済むことをコードレビューで確認。全テスト緑＋新設テスト緑。

### フェーズ 4: イベント一本化（効果音・通知の購読化）

- **目的**: 効果音と notice のトリガ経路を SessionEvent ストリームに統一し、状態差分監視 useEffect を撤去する。B6 に対応。**ホスト/ゲストモードで失敗音が鳴らない非対称をここで解消（意図的な挙動修正）。**
- **対象ファイル**:
  - `src/app/session.ts` — `SessionEvent` に `submit-failed` / `pass` / `turn-changed` / `game-over` を追加し、各セッション実装から発火。
  - 新設 `src/app/sfxBinding.ts` — SessionEvent → `audio/sfx` のマッピング（純粋なテーブルとして単体テスト可能に）。
  - 新設 `src/ui/useNotice.ts` — scopeKey による寿命管理をフック化（`noticeScopeKey` / `defaultGameNotice` を移設）。
  - `src/App.tsx` — `prevPhaseRef` / `prevCurrentRef` と効果音 useEffect ×3 を削除。
  - `src/test/sfxBinding.test.ts` — イベント→音のマッピングを検証（「ゲストでも失敗音が鳴る」の回帰テスト）。
- **完了条件**: `sfx.play*` の呼び出し箇所が `sfxBinding` の 1 ファイルに集約される。3 モードすべてで 成功/失敗/パス/手番/勝利 の 5 音が同条件で鳴ることを手動確認。全テスト緑。

### フェーズ 5: 接続確立の分離とプロトコル整備（仕上げ）

- **目的**: UI から WebRTC 手順を追い出し、接続層を単体テスト可能にする。B2・B7・B8 に対応。
- **対象ファイル**:
  - 新設 `src/app/signaling.ts`（または `useSignaling.ts`）— offer 生成 / answer 生成 / answer 受理のステートマシンを抽出。成果物として確立済み `Transport`（ホストは `Hub` 投入可能な接続、ゲストは `GuestTransport`）を返す。
  - `src/ui/screens/ConnectScreen.tsx` — `RtcConnection` / `sdp` の import を除去し、signaling の状態（表示文字列・入力・busy・error）を描画するだけにする。
  - `src/net/messages.ts` — `NetMessage` に `v`（プロトコルバージョン）を追加し、`GuestController` / `HostController` で不一致時に安全に無視 or 通知。
  - 新設 `src/test/guestController.test.ts` — 未テストだった `GuestController`（WELCOME→JOIN 順序、disposed 後の遮断）を検証。
  - 新設 `src/test/signaling.test.ts` — ステートマシンの遷移を FakeConnection で検証。
- **完了条件**: `ui/` から `net/` への import が `QrDisplay` / `QrScanner`（外部ライブラリのみ使用）を除き消える。design.md の依存原則 `ui → app → net / domain` が import 実測レベルで成立。`GuestController` のテストカバレッジが `HostController` と同等。2 台実機で QR / コピペ両方の接続確認。

---

## 4. 補足

- **docs/design.md の更新**: フェーズ 3 完了時点でディレクトリ構成図（`app/store.ts` の記載は現状と乖離。実体は controller 2 つ）と依存原則の節を実態に合わせて改訂することを推奨。
- **scripts/ について**: 生成パイプライン（fetch → process → filter → 人手レビュー）は健全。フェーズ 2 で辞書データを分離した後、`filter-recipes.mjs` の出力を `recipes.data.ts` 形式で直接吐けるようにすると転記ミスがなくなる（任意）。
- **リスクの低い順序**: フェーズ 1→2 は型の移動が中心で低リスク。フェーズ 3 が最も大きいが、フェーズ 1 で結合を切ってあるため差分は結線の移設に留まる。フェーズ 4 の失敗音は唯一の挙動変更なので、リリースノートに明記すること。
