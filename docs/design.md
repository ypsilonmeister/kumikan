# 漢字パーツ合わせ P2P アプリケーション 詳細設計書（中粒度）

| 項目 | 内容 |
| --- | --- |
| 対象仕様 | [spec.md](./spec.md) |
| 技術スタック | React 18 + Vite + TypeScript |
| 接続方式（初版） | 手動コピペ接続（SDP テキスト交換）→ 将来 QR/SDP 圧縮へ拡張 |
| 通信 | WebRTC DataChannel（完全 P2P、サーバーレス） |
| 対象環境 | 同一 LAN のモダンブラウザ（スマホ/タブレット/PC） |

---

## 1. 設計方針

仕様書の「完全ローカル P2P」「サーバーレス」「LAN 内」という制約を最優先する。
そのうえで、実装リスクの高い QR シグナリングを後回しにし、**接続層をインターフェースで抽象化**して MVP を素早く成立させる。

設計上の 3 つの分離：

1. **接続層（Transport）と ゲームロジックの分離**
   - ゲームは「メッセージを送る / 受け取る」という抽象 API のみに依存する。
   - 接続方式（手動コピペ → QR）が変わっても、ゲームコードは無変更で済む。
2. **ホスト権威モデル（Host-authoritative）**
   - 山札・ターン順・得点などの「真実の状態」は**ホスト 1 台のみが保持**する。
   - 子機は入力（アクション）を送り、ホストが確定した状態を受け取って描画する。
   - これにより P2P でありながら状態の不整合を防ぐ（フルメッシュ同期の複雑さを回避）。
3. **トポロジは Star（ホスト中心）**
   - 子機同士は直接つながず、全員がホストと 1:1 で接続する。
   - 仕様の `GAME_START` が「親機から全子機へ」とある記述と一致。

```
        ┌─────────┐
        │  Host   │  ← 唯一の権威（山札・状態）
        │ (親機)  │
        └────┬────┘
     ┌───────┼───────┐
  DataCh   DataCh   DataCh
     │        │        │
 ┌───▼──┐ ┌──▼───┐ ┌──▼───┐
 │子機 1│ │子機 2│ │子機 3│
 └──────┘ └──────┘ └──────┘
```

---

## 2. ディレクトリ構成

```
kanji-puzzle/
├─ docs/
│  ├─ spec.md
│  └─ design.md
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.tsx                  # エントリ
   ├─ App.tsx                   # 画面ルーティング（ロビー/接続/ゲーム）
   │
   ├─ domain/                   # ゲームの純粋ロジック（UI・通信に非依存）
   │  ├─ types.ts               # ドメイン型（Part, Player, GameState ...）
   │  ├─ recipes.ts             # KANJI_RECIPES と checkCombination
   │  ├─ deck.ts                # 山札生成・シャッフル・配札
   │  └─ engine.ts              # 状態遷移（reducer 的な純粋関数群）
   │
   ├─ net/                      # 接続層（Transport 抽象）
   │  ├─ transport.ts           # Transport インターフェース定義
   │  ├─ messages.ts            # P2P メッセージ型（GAME_START 等）
   │  ├─ rtcConnection.ts       # WebRTC DataChannel の薄いラッパ
   │  ├─ sdp.ts                 # SDP の encode/decode（初版=Base64、将来=Munging）
   │  └─ hub.ts                 # ホスト側の複数接続束ね（Star トポロジ管理）
   │
   ├─ app/                      # アプリ状態の結合層
   │  ├─ store.ts               # React 状態（useReducer / zustand 等）
   │  ├─ hostController.ts      # ホスト：アクション受信→engine→状態配信
   │  └─ guestController.ts     # 子機：入力送信／状態受信
   │
   ├─ ui/                       # プレゼンテーション
   │  ├─ screens/
   │  │  ├─ LobbyScreen.tsx     # ホスト or 参加の選択
   │  │  ├─ ConnectScreen.tsx   # SDP コピペ交換 UI（将来 QR）
   │  │  └─ GameScreen.tsx      # 場札・手札・得点表示
   │  ├─ components/
   │  │  ├─ Card.tsx            # パーツ 1 枚
   │  │  ├─ Hand.tsx            # 手札一覧
   │  │  ├─ FieldCard.tsx       # 場札
   │  │  └─ FuseAnimation.tsx   # 合体演出
   │  └─ styles/
   │
   └─ test/
      └─ domain.test.ts         # ドメインロジックの単体テスト
```

**依存方向の原則**: `ui → app → net / domain`。`domain` はどこにも依存しない（純粋）。
`domain` を純粋に保つことで、ゲームルールだけを単体テストで検証できる。

---

## 3. ドメインモデル（src/domain/types.ts）

```ts
/** 漢字パーツ。id で同一性を判定し、label を表示する */
export interface Part {
  id: string;        // 例: "p_ki_001"（手札内でユニーク）
  kind: string;      // 例: "木" / "さんずい"（レシピ照合キー）
  label: string;     // 表示用（kind と同じこともある）
}

export interface Player {
  id: number;        // 0..N-1。turnOrder と同じ ID 空間
  name: string;
  hand: Part[];      // 手札（ホストのみ全員分を保持。子機は自分のみ確定保持）
  score: Kanji[];    // 完成させた漢字（得点）
  connected: boolean;
}

export interface Kanji {
  char: string;      // 完成漢字 "相"
  from: string[];    // 構成パーツ ["木","目"]
}

export type Phase = 'lobby' | 'connecting' | 'playing' | 'finished';

export interface GameState {
  phase: Phase;
  players: Player[];
  turnOrder: number[];     // プレイ順
  currentTurnIndex: number;// turnOrder のインデックス
  deck: Part[];            // 山札（ホストのみ実体を持つ）
  field: Part | null;      // 現在の場札
  handSize: number;        // 初期手札枚数 N
  winnerId: number | null;
}
```

> 子機に配る状態は **ビュー専用に間引いた `PublicGameState`** を別途定義する（他人の手札の中身や山札の順序は送らない）。情報リークと帯域の両方を抑える。

---

## 4. レシピと判定（src/domain/recipes.ts）

仕様 4.1 をそのまま採用。順序非依存のためキーはソート。

```ts
export const KANJI_RECIPES: Record<string, string> = {
  "木,目": "相",
  "さんずい,可": "河",
  "言,吾": "語",
  "木,月": "棚",
  // ... データは別ファイル化も検討
};

/** kind 同士で照合（Part ではなく kind 文字列を渡す） */
export function checkCombination(kindA: string, kindB: string): string | null {
  const key = [kindA, kindB].sort().join(',');
  return KANJI_RECIPES[key] ?? null;
}
```

設計補足：仕様の例は `partA, partB` を直接 sort していたが、本設計では **Part オブジェクトではなく `kind`（照合キー）でソート**する。表示ラベルと照合キーを分離しておくと、同じ「木」でも複数枚を別 id で扱える。

**辞書の拡充（298 レシピ）と 1 ゲーム抽選**:
- 辞書は教育漢字ベースで 298 語まで拡充（IDS データ由来。`scripts/filter-recipes.mjs` で「両パーツが教育漢字 1026 字／既存パーツ／よみ部首」のものだけを選別。サロゲートや字形断片は除外）。
- 全 298 語ぶんのパーツを山札にすると 1000 枚超に膨らみ「合わない」体験が増えるため、**1 ゲーム開始時に `pickRecipeParts` でランダムに `RECIPES_PER_GAME`（=40）レシピを抽選**し、そのパーツだけで山札を作る。語彙は豊富に保ちつつ山札を適量（≈160 枚）にし、毎ゲーム異なる出題でリプレイ性も上げる。
- 山札は抽選レシピのパーツのみで構成されるため、場・手札に出るパーツは必ず辞書内で相方が存在し、組み合わせが成立しうる。

---

## 5. ゲームエンジン（src/domain/engine.ts）

UI・通信に非依存の**純粋関数**として状態遷移を実装する。例外は投げず、結果オブジェクトを返す。

主要関数（シグネチャ）：

```ts
// 開始：配札・山札確定・場札 1 枚めくり
export function startGame(players: Player[], handSize: number): GameState;

// 手番開始時に山札を 1 枚めくって場に出す
export function drawField(s: GameState): GameState;

// 手番プレイヤーが手札を 1 枚提示
export interface SubmitResult {
  state: GameState;
  outcome: 'success' | 'fail';
  kanji?: Kanji;        // success のとき完成漢字
}
export function submitPart(s: GameState, playerId: number, partId: string): SubmitResult;

// 手番を次へ
export function nextTurn(s: GameState): GameState;

// 終了判定: 「手札 0 のプレイヤーが出た」または「山札切れで場札も出せない」
export function checkGameEnd(s: GameState): GameState; // phase/winnerId を確定
```

**場札は複数枚（`field: Part[]`、最大 `FIELD_SIZE = 3`）**。実機テストで「毎ターン 1 枚だけの場札が手札と合わずパスばかりになる」問題が出たため、場に常時 3 枚を並べてマッチ率を上げた。初期手札は 6 枚、レシピは 72 種。

判定フロー（`submitPart(state, playerId, handPartId, fieldPartId?)` 内部）:

1. `playerId` が手番か・場札があるか検証（不正なら `fail`）。
2. 合体相手の場札を決める。`fieldPartId` 指定があればそれ、無ければ手札パーツと成立する最初の場札を自動選択（タップ操作向け）。
3. **成功**: 漢字を `score` に追加、手札から該当 Part を除去、**使った場札 1 枚だけ**を場から除去 → `refillField` で山札から補充。同じプレイヤーが続けて行動。
4. **失敗（合体不成立）**: 呼び出し側が `nextTurn`（場札は持ち越し、不足分のみ補充）。

> 補給ルールは「手札への補給なし」で確定。場札のみ常時 3 枚に補充。正解時は同じプレイヤーが続けて行動する。
> **終了条件（確定）**: 次のいずれかで `finished`。得点最多が勝者、タイブレークは手札の少なさ。
> 1. いずれかのプレイヤーの手札が 0 枚（仕様 2 の本来条件）。
> 2. 山札が空かつ場札も空（`deck.length === 0 && field.length === 0`）。

**接続ハンドシェイク（実機修正）**: 子機は接続確立後に `HELLO` を送り、ホストは受信して `WELCOME`（＋公開状態）を返す。これにより DataChannel の open イベントと受信ハンドラ登録の前後関係に依存せず、初期同期を確実にする（実機で「ゲストが接続中のまま」だった不具合の対策）。

---

## 6. 接続層（src/net）

### 6.1 Transport 抽象（transport.ts）

ゲームロジックが依存する唯一の通信契約。手動コピペでも QR でも、この実装を差し替えるだけにする。

```ts
export interface Transport {
  send(msg: NetMessage): void;              // 自分→相手（子機は host へ、host は hub 経由で全員へ）
  onMessage(cb: (msg: NetMessage, from: number) => void): void;
  onPeerChange(cb: (peerId: number, connected: boolean) => void): void;
  close(): void;
}
```

### 6.2 メッセージ型（messages.ts）

仕様 4.2 を型化し、双方向に拡張する。

```ts
export type NetMessage =
  // Host → Guest（状態配信）
  | { type: 'GAME_START';   payload: { turnOrder: number[]; handSize: number } }
  | { type: 'STATE_SYNC';   payload: PublicGameState }   // 追加：確定状態の配信
  | { type: 'DRAW_FIELD';   payload: { part: Part } }
  | { type: 'SUBMIT_RESULT';payload: { playerId: number; result: string | null } }
  | { type: 'NEXT_TURN';    payload: { nextPlayerId: number } }
  | { type: 'GAME_OVER';    payload: { winnerId: number } }
  // Guest → Host（入力）
  | { type: 'JOIN';         payload: { name: string } }
  | { type: 'ACTION_SUBMIT';payload: { partId: string } };
```

> 仕様表の 4 種は Host→Guest の通知系。これに **Guest→Host の入力系（JOIN / ACTION_SUBMIT）** と、信頼性のための **STATE_SYNC（全体スナップショット）** を加える。差分同期ではなく確定スナップショット配信にすることで、パケット欠落時の自己修復が容易になる。

### 6.3 RTC ラッパ（rtcConnection.ts）

`RTCPeerConnection` + 1 本の `DataChannel` を扱う薄いクラス。1 接続 = 1 ペア。

- ホスト側: 子機ごとに 1 インスタンス生成（hub が束ねる）。
- 役割: `createOffer/createAnswer`、`setLocal/RemoteDescription`、ICE 収集完了待ち、DataChannel の open/message/close をイベント化。
- メディアセクションは作らず `createDataChannel` のみ（仕様 3.1）。

### 6.4 SDP エンコード（sdp.ts）

初版は **手動コピペ前提**で実装をシンプルに：

```ts
export function encodeSignal(desc: RTCSessionDescriptionInit): string; // 初版: JSON→Base64
export function decodeSignal(text: string): RTCSessionDescriptionInit;
```

**P5 実装済み**（仕様 3.1/3.2）: 完全 SDP を持ち回らず、`extractSignal` で必須要素のみ抽出 → 1 文字キーの `MinimalSignal` → Base64。受信側は `rebuildSdp` で **最小の data-only SDP を再構築**して `setRemoteDescription` に渡す。`encodeSignal`/`decodeSignal` のシグネチャは P3 から不変なので、`rtcConnection` / `ConnectScreen` は無改修。

抽出要素（仕様 3.1 の 4 要素 + 再構築に必須の構造情報）:

- `u` ice-ufrag / `p` ice-pwd / `f` fingerprint(sha-256) … 仕様 3.1 の必須 4 要素のうち 3 つ。
- `c` candidate … 最優先のローカル IPv4 ホスト経路のみ（mDNS `.local` と srflx は除外）。仕様 3.1/3.2 注記。
- `s` setup(active/passive/actpass) / `m` mid … DTLS ロールと m= セクション ID。再構築 SDP を有効にするため保持。
- `t` type(offer/answer)。

LZMA は導入せず、抽出+再構築で十分小さく（サンプル SDP で 500 文字未満、QR バージョン 5〜7 圏内）なるため Base64 のみとした。さらなる短縮が必要なら同インターフェースのまま圧縮を差し込める。

QR: 生成は `qrcode`（[QrDisplay](../src/ui/components/QrDisplay.tsx)）、カメラ読取は `jsQR`（[QrScanner](../src/ui/components/QrScanner.tsx)）。いずれもオフライン動作で外部送信なし。ConnectScreen はコピペと QR を併用でき、どちらでも接続できる。

### 6.5 ホストハブ（hub.ts）

Star トポロジでの複数子機を一元管理。ゲームから見れば「全員へブロードキャスト / 特定子機へ送信」だけ。

```ts
export class Hub implements Transport {
  addGuest(peerId: number, conn: RtcConnection): void;
  broadcast(msg: NetMessage): void;
  sendTo(peerId: number, msg: NetMessage): void;
}
```

---

## 7. 結合層（src/app）

### 7.1 hostController.ts（権威ロジック）

```
[guest action 受信]
      │
      ▼
 engine.submitPart / drawField / nextTurn （純粋関数で状態更新）
      │
      ▼
 checkGameEnd
      │
      ▼
 hub.broadcast(STATE_SYNC + イベント通知)  → 全子機 & 自分の UI 更新
```

ホストもプレイヤーの 1 人。自分の入力は内部で直接 engine に流す（ループバック）。

### 7.2 guestController.ts

- UI のタップ → `transport.send({ type:'ACTION_SUBMIT', ... })`。
- `STATE_SYNC` 受信 → store を上書き → 再描画。
- 子機は engine を**呼ばない**（権威はホスト）。演出トリガ（SUBMIT_RESULT 等）だけ受け取る。

---

## 8. 画面遷移とデータフロー

```
LobbyScreen
  ├─[ホストを作る]→ ConnectScreen(host) ──接続確立──┐
  └─[参加する]   → ConnectScreen(guest)─接続確立──┤
                                                    ▼
                                              GameScreen
                                          (playing / finished)
```

ConnectScreen（初版・手動コピペ）の流れ：

```
Host                                Guest
 │ createOffer→encodeSignal          │
 │ [Offer文字列を表示]──コピー────────▶ [貼り付け]→decode→setRemote
 │                                    │ createAnswer→encodeSignal
 │ [貼り付け]◀──コピー─────[Answer文字列を表示]
 │ setRemote → DataChannel open ───── DataChannel open
 ▼                                    ▼
        両者 GameScreen へ
```

GameScreen の操作（仕様 5）：

- 場札に対して手札カードを**タップ or ドラッグ**して提示。
  - **Pointer Events で実装**（タッチ/マウス/ペンを統一）。`pointerdown` で起点を記録し、移動量がしきい値（8px）を超えたらドラッグ、超えなければタップとして扱う。どちらも提出に繋がる。
  - ドラッグ中は指/カーソルに追従するゴーストを `position: fixed` で表示し、場札の矩形（`getBoundingClientRect`）と当たり判定。`pointerup` 時に場札上ならその手札を提出。
  - HTML5 Drag and Drop はモバイルのタッチで発火しないため使わない。
- 成功時は `FuseAnimation`（中央へ吸い寄せ＋フラッシュ、CSS Transition）。
- 大きく太いフォント、余白多めのクリーンなレイアウト。

---

## 9. 状態管理

- ホスト: 正準 `GameState`（全実体）を保持。配信時に `PublicGameState` へ射影。
- 子機: 受信した `PublicGameState` のみ保持。
- React 側は `useReducer`（小規模なら十分）。アクションは「ネット受信」と「ローカル UI 操作」の 2 系統。

**通知（notice）の寿命ルール（P4 確定）**: 操作結果やヒントの通知は `scopeKey`（手番 ID + 場札 ID + 手札 ID 列のハッシュ）を持ち、盤面がそのキーから変化したらデフォルト文言へ自動で戻す。これにより「結果は次のアクションまで残し、盤面が動いたら消える」挙動を全通知で一貫させる。

---

## 10. 実装フェーズ（マイルストーン）

| Phase | 内容 | 完了条件 |
| --- | --- | --- |
| **P0** | プロジェクト雛形（Vite+TS+React） | `npm run dev` で空画面表示 |
| **P1** | domain 実装＋単体テスト | engine/recipes/deck がテスト緑 |
| **P2** | ローカル単独でゲーム成立（通信なし・1 画面で全操作） | 1 人で 1 ゲーム完走できる |
| **P3** ✅ | Transport 抽象＋手動コピペ接続（2 端末） | 別端末同士で状態同期して対戦できる |
| **P4** | UI 仕上げ・合体演出 | 仕様 5 の見た目/演出を満たす |
| **P5** ✅ | QR / SDP Munging（抽出+再構築）/ Base64 | QR スキャンで接続できる |

> P2 を先に作ることで、通信の難所と切り離してゲームルールを完成・検証できる（選択された「段階的にリスクを潰す」方針に対応）。

---

## 11. 主要な設計判断と理由（まとめ）

| 判断 | 理由 |
| --- | --- |
| ホスト権威モデル | P2P の状態不整合を回避。仕様の「親機→子機」通知と整合。 |
| Transport 抽象化 | QR 実装を後回しにしても上位コードを変えずに済む。 |
| domain を純粋関数に | ゲームルールを通信/UI なしで単体テスト可能。 |
| STATE_SYNC（全体配信） | 差分同期より単純で、パケット欠落に強い。 |
| PublicGameState 射影 | 他人の手札・山札順のリーク防止＆帯域削減。 |
