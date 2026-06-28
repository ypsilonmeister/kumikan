# コードレビュー結果（P4/P5 追加実装レビュー）

| 項目 | 内容 |
| --- | --- |
| 対象 | P4 UI 仕上げ・ドラッグ操作 / P5 QR + SDP Munging |
| 基準 | [spec.md](./spec.md) / [design.md](./design.md) |
| ビルド | ✅ `npm run build` 成功（型チェック含む） |
| テスト | ✅ `npm test` 26 件すべてパス |
| 確認日 | 2026-06-28 |

## 結論

ビルドと既存テストは通っており、前回の通知 scope 修正も実装済みです。一方で、P5 の実機接続に関わる候補抽出と QR スキャンのフォールバック、P4 のスマホ向けドラッグ操作にまだリスクがあります。

> **対応状況（追記）**: 本レビューの全 5 件を対応完了。ビルド・型チェック ✅ / テスト 29 件パス。
> - High（mDNS 候補で接続不能）: `pickCandidate` を IPv4 host → host → **mDNS host フォールバック** → 任意、の順に変更。mDNS のみケースのテスト追加。
> - Medium（QR スキャン空画面）: `navigator.mediaDevices?.getUserMedia` 不在を先に判定し、明示エラー＋貼り付け誘導。
> - Medium（スマホのドラッグ）: HTML5 DnD を撤去し **Pointer Events** で再実装（タッチ/マウス/ペン統一、追従ゴースト、タップ/ドラッグしきい値判定）。
> - Low（ドロップハイライト残り）: `dropDepth` カウンタを廃止、`relatedTarget` 包含判定＋盤面変化リセットに変更。
> - Low（コメント不整合）: scopeKey 重複コメント削除、`MinimalSignal.c` のコメントを実装に一致。

---

## Findings

### High: mDNS 候補しか出ないブラウザで接続候補が空になり、P5 接続が成立しない

- 対象: [src/net/sdp.ts:66](../src/net/sdp.ts#L66), [src/net/sdp.ts:68](../src/net/sdp.ts#L68), [src/net/sdp.ts:94](../src/net/sdp.ts#L94)
- `pickCandidate` が `.local` の mDNS host candidate を全て除外しているため、ブラウザがローカル IP を mDNS 化して返す環境では `sig.c === ''` になります。
- このプロジェクトは trickle ICE なしで SDP 文字列に candidate を内包する設計なので、candidate が空のまま `rebuildSdp` されると相手側に到達先が渡らず、QR / コピペ接続が失敗しやすいです。
- `src/test/net.test.ts` は「mDNS + IPv4 host」が混在するケースだけを見ており、mDNS のみの現実的なケースを検出できません。
- 推奨: IPv4 host を優先しつつ、代替がない場合は mDNS host candidate を残す。あわせて「mDNS のみでも candidate を保持する」テストを追加してください。

### Medium: 非 HTTPS の LAN アクセスでは QR スキャンが空画面になりうる

- 対象: [src/ui/components/QrScanner.tsx:54](../src/ui/components/QrScanner.tsx#L54)
- `navigator.mediaDevices?.getUserMedia(...)` が未提供の環境では、optional chaining により Promise チェーンが実行されず、`catch` も走りません。そのためエラー表示に切り替わらず、video 領域だけが残ります。
- スマホで同一 LAN の `http://192.168.x.x:5173` にアクセスする場合、カメラ API は secure context 制約で使えないことが多いです。P5 の QR スキャン導線では実機で踏みやすいです。
- 推奨: `if (!navigator.mediaDevices?.getUserMedia) { setError(...); return; }` を先に置き、文字列貼り付けへのフォールバックが明確に見えるようにしてください。

### Medium: P4 のドラッグ操作が HTML5 DragEvent 依存で、スマホ/タブレットの主操作になりにくい

- 対象: [src/ui/components/Card.tsx:28](../src/ui/components/Card.tsx#L28), [src/ui/screens/GameScreen.tsx:48](../src/ui/screens/GameScreen.tsx#L48)
- カードは `draggable` + `DragEvent` で実装されていますが、モバイル Safari / Chrome の指操作では HTML5 drag/drop が期待どおり発火しないことがあります。
- タップ操作は残っているのでゲームは遊べますが、P4 の「tap or drag」相当をスマホ/タブレットで満たすには、Pointer Events ベースのドラッグか、ドラッグはデスクトップ限定であることの設計調整が必要です。
- 推奨: `pointerdown` / `pointermove` / `pointerup` でカードを追従表示し、場札上で離したら submit する実装に寄せると、タッチ端末でも同じ操作感にできます。

### Low: ドロップ中ハイライトがキャンセル/入れ子要素で残る可能性がある

- 対象: [src/ui/screens/GameScreen.tsx:36](../src/ui/screens/GameScreen.tsx#L36), [src/ui/screens/GameScreen.tsx:73](../src/ui/screens/GameScreen.tsx#L73), [src/ui/screens/GameScreen.tsx:81](../src/ui/screens/GameScreen.tsx#L81)
- `dropDepth` は `dragenter` / `dragleave` のカウンタで管理されていますが、場札内の `span` / `strong` へ移動した時の入れ子イベントや、ドラッグ中にターン・場札・手札が変わるケースで状態が残る余地があります。
- 実害は主に見た目のハイライト残りですが、前回の「前のヒントが出っぱなし」と同じ系統の違和感になりやすいです。
- 推奨: `event.currentTarget.contains(event.relatedTarget as Node)` で内側移動を無視するか、`draggingPartId` / `canAct` / `view.field?.id` 変化時に `dropDepth` を 0 に戻してください。

### Low: コメント/ドキュメントの小さな不整合

- 対象: [src/App.tsx:127](../src/App.tsx#L127), [src/net/sdp.ts:33](../src/net/sdp.ts#L33), [src/net/sdp.ts:62](../src/net/sdp.ts#L62)
- `App.tsx` の scopeKey コメントが同じ行で重複しています。
- `MinimalSignal.c` のコメントは「`candidate:` を除いた値」と説明していますが、実装は `candidate:` を残して `a=${sig.c}` で再構築しています。
- 挙動には影響しませんが、次の実装者が SDP 形式を誤解しやすいので整えてください。

---

## 修正確認

| 項目 | 確認結果 |
| --- | --- |
| 通知の scopeKey | ✅ 成功/失敗/パス/ヒントに scopeKey が付与され、盤面変更でデフォルト文言へ戻る実装になっている。 |
| SDP Munging | ✅ `extractSignal` / `rebuildSdp` / `encodeSignal` / `decodeSignal` と単体テストが追加済み。 |
| QR 表示 | ✅ `qrcode` でローカル canvas 生成。外部 API 依存はない。 |
| QR 読み取り | ⚠️ `jsqr` + カメラ走査は実装済み。ただし secure context / mediaDevices 不在時の表示に課題あり。 |
| P4 ドラッグ | ⚠️ デスクトップ向け HTML5 drag/drop は実装済み。スマホの指操作としては未検証・未保証。 |

---

## 残リスク / 次に見るとよい点

- P5 は実ブラウザの ICE candidate 形式に依存します。Chrome/Safari/Firefox で「mDNS のみ」「IPv4 host あり」の両方を実機確認すると安心です。
- QR スキャンは HTTPS で配信するか、HTTP LAN では貼り付け導線を明確にする必要があります。
- P4 のドラッグと QR スキャンは UI/ブラウザ API のため、Vitest だけでは品質を担保しきれません。Playwright または手動チェック項目を追加すると次の回帰が見つけやすくなります。

---

## 検証ログ

```text
npm test
  Test Files  3 passed
  Tests       26 passed

npm run build
  tsc --noEmit && vite build
  98 modules transformed
  built successfully
```
