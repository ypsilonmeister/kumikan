import { useCallback, useEffect, useRef, useState } from 'react';
import type { Part, PublicGameState } from './domain/types';
import type { GameSession } from './app/session';
import type { SessionEvent } from './app/events';
import { createLocalSession } from './app/localSession';
import { createHostSession } from './app/hostSession';
import { createGuestSession } from './app/guestSession';
import { SfxBinding } from './app/sfxBinding';
import type { SignalingConnection } from './app/signaling';
import * as sfx from './audio/sfx';
import { ConnectScreen, type ConnectRole } from './ui/screens/ConnectScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import type { FusionDisplay } from './ui/components/FuseAnimation';
import { partDisplay, partReading } from './ui/partAssets';
import { noticeForActionResult, noticeScopeKey, useNotice } from './ui/useNotice';

type Screen =
  | { name: 'lobby' }
  | { name: 'connect'; role: ConnectRole }
  | { name: 'game' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'lobby' });
  const [fusion, setFusion] = useState<FusionDisplay | null>(null);

  // 描画する公開状態と自分の viewerId（全モード共通）。
  const [view, setView] = useState<PublicGameState | null>(null);
  const [viewerId, setViewerId] = useState(0);

  // 効果音のミュート状態（localStorage に永続化）。
  const [muted, setMutedState] = useState(sfx.isMuted());

  const sessionRef = useRef<GameSession | null>(null);
  const sfxBindingRef = useRef(new SfxBinding());
  /** action-result の scopeKey 計算用。state イベントで同期更新する（setState は非同期のため）。 */
  const viewRef = useRef<PublicGameState | null>(null);
  /** connect 画面へ渡る前に選んだ設定。接続確立時にセッション生成へ使う。 */
  const pendingRef = useRef<
    { role: 'host'; name: string; handSize: number } | { role: 'guest'; name: string } | null
  >(null);
  const { notice, setNotice } = useNotice(view, {
    kind: 'neutral',
    text: 'あそびかたを選んでください。',
  });

  useEffect(() => {
    if (!fusion) return;
    const timeout = window.setTimeout(() => setFusion(null), 900);
    return () => window.clearTimeout(timeout);
  }, [fusion]);

  // 最初のユーザー操作で AudioContext を起こす（自動再生ポリシー対策）。
  useEffect(() => {
    const prime = () => sfx.primeAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);

  const handleSessionEvent = useCallback((event: SessionEvent) => {
    sfxBindingRef.current.handle(event);
    switch (event.type) {
      case 'state':
        viewRef.current = event.view;
        setView(event.view);
        setViewerId(event.viewerId);
        break;
      case 'fusion':
        setFusion({
          char: event.event.char,
          parts: event.event.from.map((kind) => partReading(kind) ?? kind),
        });
        break;
      case 'action-result': {
        const scopeKey = viewRef.current ? noticeScopeKey(viewRef.current) : undefined;
        setNotice(noticeForActionResult(event.result, scopeKey));
        break;
      }
    }
  }, []);

  // ---- 開始・接続ハンドラ ------------------------------------------------
  function startLocal(names: string[], handSize: number) {
    sessionRef.current?.close();
    sfxBindingRef.current.reset('local');
    sessionRef.current = createLocalSession(names, handSize, handleSessionEvent);
    setNotice({ kind: 'neutral', text: '場札に合うパーツを選んでください。' });
    setFusion(null);
    setScreen({ name: 'game' });
  }

  function startHost(hostName: string, handSize: number) {
    pendingRef.current = { role: 'host', name: hostName, handSize };
    setViewerId(0);
    setNotice({ kind: 'neutral', text: '相手の接続を待っています…' });
    setScreen({ name: 'connect', role: 'host' });
  }

  function startGuest(guestName: string) {
    pendingRef.current = { role: 'guest', name: guestName };
    setNotice({ kind: 'neutral', text: 'ホストの接続コードを貼り付けてください。' });
    setScreen({ name: 'connect', role: 'guest' });
  }

  const handleHostConnected = useCallback((conn: SignalingConnection) => {
    const pending = pendingRef.current;
    const name = pending?.role === 'host' ? pending.name : 'ホスト';
    const handSize = pending?.role === 'host' ? pending.handSize : 6;
    sfxBindingRef.current.reset('host');
    sessionRef.current = createHostSession(name, handSize, conn, handleSessionEvent);
    setNotice({ kind: 'neutral', text: '接続しました。ゲーム開始です。' });
    setScreen({ name: 'game' });
  }, [handleSessionEvent]);

  const handleGuestConnected = useCallback((conn: SignalingConnection) => {
    const pending = pendingRef.current;
    const name = pending?.role === 'guest' ? pending.name : 'ゲスト';
    sfxBindingRef.current.reset('guest');
    sessionRef.current = createGuestSession(name, conn, handleSessionEvent);
    setNotice({ kind: 'neutral', text: '接続しました。ホストの状態を待っています…' });
    setScreen({ name: 'game' });
  }, [handleSessionEvent]);

  // ---- 操作ハンドラ（モード分岐なし） ----------------------------------
  // fieldPartId 省略時は合体できる場札を自動選択（タップ操作）。指定時はドラッグ先。
  function onSubmit(part: Part, fieldPartId?: string) {
    sessionRef.current?.submit(part.id, fieldPartId);
  }

  function onPass() {
    sessionRef.current?.pass();
  }

  function toggleMute() {
    setMutedState(sfx.toggleMuted());
  }

  function onHint() {
    const session = sessionRef.current;
    if (!session || !view) return;
    const playable = session.hint();
    const scopeKey = noticeScopeKey(view);
    setNotice(
      playable
        ? { kind: 'neutral', text: `ヒント: 「${partDisplay(playable.kind).label}」が合いそうです。`, scopeKey }
        : { kind: 'neutral', text: '今の手札では成立する組み合わせがありません。', scopeKey },
    );
  }

  function teardown() {
    sessionRef.current?.close();
    sfxBindingRef.current.reset();
    sessionRef.current = null;
    pendingRef.current = null;
    viewRef.current = null;
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

  if (!view) {
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

  return (
    <GameScreen
      view={view}
      viewerId={viewerId}
      notice={notice}
      fusion={fusion}
      onSubmit={onSubmit}
      onPass={onPass}
      onHint={onHint}
      onRestart={teardown}
      muted={muted}
      onToggleMute={toggleMute}
    />
  );
}
