# コードレビュー結果（P4: UI 仕上げ・合体演出）

| 項目 | 内容 |
| --- | --- |
| 対象 | Codex による P4 実装（ドラッグ&ドロップ、合体演出強化、レスポンシブ、通知の自動リセット） |
| 基準 | [spec.md](./spec.md) 5 章 / [design.md](./design.md) 8 章 |
| ビルド | ✅ `npm run build` 成功（型チェック含む） |
| テスト | ✅ `npm test` 22 件すべてパス |
| 確認日 | 2026-06-28 |

全体として完成度が高い。仕様 5 の「タップ&ドラッグ」「合体演出」「大きく太いフォント・余白」をいずれも満たしており、`prefers-reduced-motion` 対応や 44px タップ領域などアクセシビリティ配慮も入っている。**重大なバグはなし**。以下は中〜軽微の指摘。

---

## 🟡 改善推奨

### #1 タッチ端末でドラッグが効かない（タップは効く）
- **場所**: [src/ui/components/Card.tsx:28](../src/ui/components/Card.tsx#L28), [src/ui/screens/GameScreen.tsx:48](../src/ui/screens/GameScreen.tsx#L48)-[97](../src/ui/screens/GameScreen.tsx#L97)
- **内容**: HTML5 Drag and Drop API（`draggable` / `onDragStart` / `onDrop`）は、ほとんどのモバイルブラウザでタッチ操作では発火しない。実装はドラッグできない端末でも `onClick`（タップ提出）が残っているため**プレイ不能にはならない**が、仕様 5 が主戦場とする「スマホ/タブレット」では**ドラッグ演出が体験できない**。
- **影響**: 機能退行ではなく、演出の到達率が下がる。PC では完全動作。
- **修正案（任意・将来）**:
  - Pointer Events ベースの自前ドラッグ（`onPointerDown/Move/Up` + `setPointerCapture`）に置き換えると、マウス/タッチ/ペンで統一動作する。
  - 当面はタップ提出が主操作として成立しているので、優先度は低い。コメントで「ドラッグは pointer 環境向けの拡張」と明記しておくと誤解が減る。

### #2 通知 `scopeKey` の自動リセットが成功/失敗メッセージには効かない
- **場所**: [src/App.tsx:88](../src/App.tsx#L88)-[96](../src/App.tsx#L96), [App.tsx:140](../src/App.tsx#L140)-[145](../src/App.tsx#L145), [App.tsx:231](../src/App.tsx#L231)-[236](../src/App.tsx#L236)
- **内容**: `scopeKey`（手番/場札/手札のハッシュ）が変わると通知をデフォルト文言へ戻す仕組みは、**ヒント通知にのみ** `scopeKey` を付与している。`localSubmit` の success/fail 通知は `scopeKey` 無しのため、盤面が変わっても残り続ける。
- **影響**: 例えば「○○が成立しませんでした。次の番です。」が、次プレイヤーの手番表示になっても残る。意図的（行動結果を残す）なら問題ないが、**仕様/設計には記述がなく挙動が非対称**。
- **修正案**:
  - 仕様として「結果通知は次アクションまで残す／ヒントは盤面変化で消す」を design.md に明記する。
  - もしくは success/fail 通知にも `scopeKey` を付け、盤面変化でデフォルトへ戻して一貫させる。

### #3 オンライン対戦時の通知文言がローカル前提
- **場所**: [src/App.tsx:212](../src/App.tsx#L212)-[237](../src/App.tsx#L237), [src/app/guestController.ts](../src/app/guestController.ts)
- **内容**: host/guest モードでは `onSubmit` が controller にアクションを委譲するだけで、success/fail の通知文言を出していない。結果は `STATE_SYNC` 再描画と `FuseAnimation`（SUBMIT_RESULT）で伝わるが、**「○○が成立しませんでした」等のテキストフィードバックがオンラインでは出ない**（ローカルのみ）。
- **影響**: オンライン時、失敗時のテキスト説明が弱い。合体演出は出るので致命的ではない。
- **修正案**: controller のコールバック（`onFusion` に加えて `onResult(outcome)` 等）で、オンラインでも結果通知を出せるようにすると体験が揃う。P5 と一緒で良い。

---

## 🟢 軽微 / 任意

### #4 `FuseAnimation` が `from` 2 要素前提
- **場所**: [src/ui/components/FuseAnimation.tsx:14](../src/ui/components/FuseAnimation.tsx#L16)
- **内容**: `kanji.from[0]` / `from[1]` 固定参照。現状レシピはすべて 2 パーツなので問題ないが、`Kanji.from` 型は `string[]`。3 パーツ以上のレシピを将来足すと表示が崩れる。
- **修正案**: 当面コメントで 2 パーツ前提を明記。将来 `from.map(...)` 化。

### #5 `aria-live="assertive"` は合体ごとに割り込み読み上げ
- **場所**: [src/ui/components/FuseAnimation.tsx:13](../src/ui/components/FuseAnimation.tsx#L13)
- **内容**: 演出のたびにスクリーンリーダーが即時割り込み読み上げ。完成漢字の通知としては妥当だが、`polite` でも十分かもしれない。好みの範囲。

---

## ✅ 良い点

- 仕様 5 をよく満たしている: タップ&ドラッグ、合体演出（パーツが中央へ寄ってフラッシュ＋リング）、大きく太いフォント、余白の多いクリーンなレイアウト。
- `dropDepth` カウンタで `dragenter`/`dragleave` の子要素バブリングを正しく相殺しており、ドロップ領域のハイライトがちらつかない。
- `dropOnField` が `getData(MIME) || draggingPartId` でフォールバックしており、データ転送が取れない環境でも state から復元できる。
- `canAct`（手番＋場札あり）で submit/drag/drop/hint/pass を一貫してガード。非手番のドラッグは `beginDrag` で `preventDefault`。
- `prefers-reduced-motion: reduce` でアニメーションを一律抑制。
- タップ提出（onClick）を残したままドラッグを追加しており、ドラッグ非対応環境でも操作可能。
- 既存のドメイン/接続テスト 22 件を維持（退行なし）。

---

## 対応サマリ

| # | 重大度 | 内容 | 状態 |
| --- | --- | --- | --- |
| 1 | 🟡 | タッチ端末でドラッグ不可（タップは可） | 先送り（Pointer Events 化は別タスク。タップ提出で操作は成立） |
| 2 | 🟡 | 通知自動リセットが結果通知に非対称 | ✅ 修正済（success/fail/pass 通知にも `scopeKey` 付与。盤面変化でデフォルトへ戻す） |
| 3 | 🟡 | オンライン時に結果テキスト通知が出ない | 先送り（controller 結果コールバックは P5 と合わせて対応） |
| 4 | 🟢 | FuseAnimation が 2 パーツ前提 | ✅ 修正済（`from` の要素数に依存せず undefined ガード） |
| 5 | 🟢 | aria-live assertive の割り込み | ✅ 修正済（`polite` に変更） |

> 重大バグなし。P4 の完了条件「仕様 5 の見た目/演出を満たす」は達成。

---

## 修正後メモ（#2 / #4 / #5）

- **#2**: [src/App.tsx](../src/App.tsx) — `scopeKeyForState(state)` ヘルパーを追加し、`localSubmit`（success/fail）と `localPass` の通知にも `scopeKey` を付与。これで「結果通知は次のアクションまで残し、盤面が変化したらデフォルト文言へ自動で戻る」挙動に統一。ヒント通知との非対称を解消。
- **#4 / #5**: [src/ui/components/FuseAnimation.tsx](../src/ui/components/FuseAnimation.tsx) — `from[0]/[1]` 固定参照をやめ、`left`/`right` を取り出して `undefined` の場合は描画しないガードに変更（2 パーツ前提を緩和）。あわせて `aria-live` を `assertive` → `polite` に変更。
- ビルド・型チェック ✅ / テスト 22 件パス（退行なし）。
- 先送りの #1 / #3 は P5（QR/圧縮）作業とまとめて扱う想定。
