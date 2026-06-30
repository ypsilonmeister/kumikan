import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPlayers } from './domain/deck';
import {
  findPlayablePart,
  passTurn,
  startGame,
  submitPart,
  toPublicGameState,
} from './domain/engine';
import type { GameState, Kanji, Part, PublicGameState } from './domain/types';
import { GuestController } from './app/guestController';
import { HostController, type FusionEvent } from './app/hostController';
import { Hub } from './net/hub';
import type { RtcConnection } from './net/rtcConnection';
import { ConnectScreen, type ConnectRole } from './ui/screens/ConnectScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';

type Screen =
  | { name: 'lobby' }
  | { name: 'connect'; role: ConnectRole }
  | { name: 'game' };

type NoticeKind = 'neutral' | 'success' | 'fail';
interface Notice {
  kind: NoticeKind;
  text: string;
  scopeKey?: string;
}

const GUEST_PEER_ID = 1; // 2 台 MVP: ホスト=0、子機=1。

function noticeScopeKey(view: PublicGameState): string {
  const handKey = view.hand.map((part) => part.id).join('|');
  const fieldKey = view.field.map((part) => part.id).join('|') || 'no-field';
  return `${view.currentPlayerId ?? 'none'}:${fieldKey}:${handKey}`;
}

/** GameState から、現在の手番プレイヤー視点の通知スコープキーを作る。 */
function scopeKeyForState(state: GameState): string {
  const currentId = state.turnOrder[state.currentTurnIndex] ?? 0;
  return noticeScopeKey(toPublicGameState(state, currentId));
}

function defaultGameNotice(view: PublicGameState): string {
  if (view.phase === 'finished') {
    return 'ゲーム終了です。';
  }
  if (view.field.length === 0) {
    return '場札がありません。';
  }
  return '場札に合うパーツを選んでください。';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'lobby' });
  const [notice, setNotice] = useState<Notice>({
    kind: 'neutral',
    text: 'あそびかたを選んでください。',
  });
  const [fusion, setFusion] = useState<Kanji | null>(null);

  // ローカルモード: 正準 GameState を直接持つ。
  const [localGame, setLocalGame] = useState<GameState | null>(null);

  // オンライン共通: 描画する公開状態と自分の playerId。
  const [view, setView] = useState<PublicGameState | null>(null);
  const [viewerId, setViewerId] = useState(0);

  const hostRef = useRef<HostController | null>(null);
  const hubRef = useRef<Hub | null>(null);
  const guestRef = useRef<GuestController | null>(null);
  const modeRef = useRef<'local' | 'host' | 'guest'>('local');
  const handSizeRef = useRef(6);
  const hostNameRef = useRef('ホスト');
  const guestNameRef = useRef('ゲスト');

  const localCurrentId = localGame?.turnOrder[localGame.currentTurnIndex] ?? 0;

  const gameView: PublicGameState | null = useMemo(() => {
    if (modeRef.current === 'local') {
      return localGame ? toPublicGameState(localGame, localCurrentId) : null;
    }
    return view;
  }, [localGame, localCurrentId, view]);

  useEffect(() => {
    if (!fusion) return;
    const timeout = window.setTimeout(() => setFusion(null), 900);
    return () => window.clearTimeout(timeout);
  }, [fusion]);

  useEffect(() => {
    if (!notice.scopeKey || !gameView) {
      return;
    }

    if (notice.scopeKey !== noticeScopeKey(gameView)) {
      setNotice({ kind: 'neutral', text: defaultGameNotice(gameView) });
    }
  }, [gameView, notice.scopeKey]);

  const showFusion = useCallback((event: FusionEvent) => {
    setFusion({ char: event.char, from: event.from });
  }, []);

  // ---- ローカルモード ----------------------------------------------------
  function startLocal(names: string[], handSize: number) {
    modeRef.current = 'local';
    const game = startGame(createPlayers(names), handSize);
    setLocalGame(game);
    setNotice({ kind: 'neutral', text: '場札に合うパーツを選んでください。' });
    setFusion(null);
    setScreen({ name: 'game' });
  }

  function localSubmit(part: Part, fieldPartId?: string) {
    if (!localGame) return;
    const result = submitPart(localGame, localCurrentId, part.id, fieldPartId);
    const currentName = localGame.players.find((p) => p.id === localCurrentId)?.name ?? '';

    if (result.outcome === 'success' && result.kanji) {
      // submitPart が補充済み。同じプレイヤーが続けて行動する。
      const updated = result.state;
      setLocalGame(updated);
      setFusion(result.kanji);
      // 結果通知も盤面（updated）が変わったらデフォルトへ戻すため scopeKey を付与。
      setNotice({
        kind: 'success',
        text: `${currentName} が「${result.kanji.char}」を完成。続けて同じ人の番です。`,
        scopeKey: scopeKeyForState(updated),
      });
      return;
    }
    // 失敗もパスと同様に場札を1枚増やして手番交代。
    const updated = result.state.phase === 'finished' ? result.state : passTurn(result.state);
    setLocalGame(updated);
    // 山札が空のときは場札が増えないので、増えた場合だけその旨を添える。
    const grew = updated.field.length > result.state.field.length;
    setNotice({
      kind: 'fail',
      text: `${currentName} の組み合わせは成立しませんでした。${grew ? '場札が1枚増えて' : ''}次の番です。`,
      scopeKey: scopeKeyForState(updated),
    });
  }

  function localPass() {
    if (!localGame) return;
    const currentName = localGame.players.find((p) => p.id === localCurrentId)?.name ?? '';
    const updated = passTurn(localGame);
    setLocalGame(updated);
    setNotice({ kind: 'neutral', text: `${currentName} はパスしました。`, scopeKey: scopeKeyForState(updated) });
  }

  function localHint() {
    if (!localGame) return;
    const hand = localGame.players.find((p) => p.id === localCurrentId)?.hand ?? [];
    const playable = findPlayablePart(localGame.field, hand);
    const scopeKey = gameView ? noticeScopeKey(gameView) : undefined;
    setNotice(
      playable
        ? { kind: 'neutral', text: `ヒント: 「${playable.label}」が合いそうです。`, scopeKey }
        : { kind: 'neutral', text: '今の手札では成立する組み合わせがありません。', scopeKey },
    );
  }

  // ---- ホストモード ------------------------------------------------------
  function startHost(hostName: string, handSize: number) {
    modeRef.current = 'host';
    handSizeRef.current = handSize;
    hostNameRef.current = hostName;
    setViewerId(0);
    setNotice({ kind: 'neutral', text: '相手の接続を待っています…' });
    setScreen({ name: 'connect', role: 'host' });
  }

  const handleHostConnected = useCallback((conn: RtcConnection) => {
    // 2 人ぶんのゲームを生成（ホスト=0、子機=1）。
    const players = createPlayers([hostNameRef.current, '相手']);
    const game = startGame(players, handSizeRef.current);

    const hub = new Hub();
    hubRef.current = hub;
    const host = new HostController(game, hub, {
      onState: (state) => setView(toPublicGameState(state, 0)),
      onFusion: showFusion,
    });
    hostRef.current = host;

    hub.addGuest(GUEST_PEER_ID, conn);
    setView(toPublicGameState(game, 0));
    setNotice({ kind: 'neutral', text: '接続しました。ゲーム開始です。' });
    setScreen({ name: 'game' });
  }, [showFusion]);

  // ---- ゲストモード ------------------------------------------------------
  function startGuest(guestName: string) {
    modeRef.current = 'guest';
    guestNameRef.current = guestName;
    setNotice({ kind: 'neutral', text: 'ホストの接続コードを貼り付けてください。' });
    setScreen({ name: 'connect', role: 'guest' });
  }

  const handleGuestConnected = useCallback((conn: RtcConnection) => {
    // RtcConnection を直接 Transport として包む薄いアダプタ。
    const guestTransport = {
      send: (msg: Parameters<RtcConnection['send']>[0]) => conn.send(msg),
      sendTo: (_peerId: number, msg: Parameters<RtcConnection['send']>[0]) => conn.send(msg),
      onMessage: (cb: (msg: Parameters<RtcConnection['send']>[0], from: number) => void) =>
        conn.onMessage((msg) => cb(msg, 0)),
      onPeerChange: () => undefined,
      close: () => conn.close(),
    };

    const guest = new GuestController(
      guestTransport,
      {
        onState: (state) => setView(state),
        onWelcome: (playerId) => setViewerId(playerId),
        onFusion: showFusion,
      },
      guestNameRef.current,
    );
    guestRef.current = guest;
    guest.start(); // HELLO を送り、ホストに WELCOME を促す（JOIN は WELCOME 後に自動送信）。
    setNotice({ kind: 'neutral', text: '接続しました。ホストの状態を待っています…' });
    setScreen({ name: 'game' });
  }, [showFusion]);

  // ---- 操作ハンドラ（モードで振り分け） --------------------------------
  // fieldPartId 省略時は合体できる場札を自動選択（タップ操作）。指定時はドラッグ先。
  function onSubmit(part: Part, fieldPartId?: string) {
    if (modeRef.current === 'local') localSubmit(part, fieldPartId);
    else if (modeRef.current === 'host') hostRef.current?.submit(part.id, fieldPartId);
    else guestRef.current?.submit(part.id, fieldPartId);
  }

  function onPass() {
    if (modeRef.current === 'local') localPass();
    else if (modeRef.current === 'host') hostRef.current?.pass();
    else guestRef.current?.pass();
  }

  function onHint() {
    if (modeRef.current === 'local') {
      localHint();
      return;
    }
    if (!view) return;
    const playable = findPlayablePart(view.field, view.hand);
    const scopeKey = gameView ? noticeScopeKey(gameView) : undefined;
    setNotice(
      playable
        ? { kind: 'neutral', text: `ヒント: 「${playable.label}」が合いそうです。`, scopeKey }
        : { kind: 'neutral', text: '今の手札では成立する組み合わせがありません。', scopeKey },
    );
  }

  function teardown() {
    hubRef.current?.close(); // ホスト側の全 DataChannel を閉じる。
    guestRef.current?.close(); // 子機側の DataChannel を閉じ、以降のコールバックを止める。
    hubRef.current = null;
    hostRef.current = null;
    guestRef.current = null;
    setLocalGame(null);
    setView(null);
    setViewerId(0);
    setFusion(null);
    setNotice({ kind: 'neutral', text: 'あそびかたを選んでください。' });
    setScreen({ name: 'lobby' });
  }

  if (screen.name === 'lobby') {
    return (
      <LobbyScreen
        notice={notice}
        onStartLocal={startLocal}
        onStartHost={startHost}
        onStartGuest={startGuest}
      />
    );
  }

  if (screen.name === 'connect') {
    return (
      <ConnectScreen
        role={screen.role}
        onConnected={screen.role === 'host' ? handleHostConnected : handleGuestConnected}
        onCancel={teardown}
      />
    );
  }

  if (!gameView) {
    return (
      <main className="app-shell">
        <section className="setup-panel">
          <div className="notice notice--neutral">接続中です…</div>
          <button className="ghost-action" type="button" onClick={teardown}>
            戻る
          </button>
        </section>
      </main>
    );
  }

  // ローカルは手番プレイヤーが操作主体。オンラインは自分。
  const effectiveViewerId = modeRef.current === 'local' ? localCurrentId : viewerId;

  return (
    <GameScreen
      view={gameView}
      viewerId={effectiveViewerId}
      notice={notice}
      fusion={fusion}
      onSubmit={onSubmit}
      onPass={onPass}
      onHint={onHint}
      onRestart={teardown}
    />
  );
}