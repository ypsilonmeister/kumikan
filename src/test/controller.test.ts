import { describe, expect, it } from 'vitest';
import { makePart } from '../domain/deck';
import { HostController, type FusionEvent } from '../app/hostController';
import type { GameState } from '../domain/types';
import type { NetMessage } from '../net/messages';
import type { MessageHandler, PeerChangeHandler, Transport } from '../net/transport';

/** 送信を記録し、受信を手で注入できるテスト用 Transport。 */
class FakeTransport implements Transport {
  sent: Array<{ peerId: number | 'all'; msg: NetMessage }> = [];
  private messageHandler: MessageHandler | null = null;
  private peerChangeHandler: PeerChangeHandler | null = null;

  send(msg: NetMessage): void {
    this.sent.push({ peerId: 'all', msg });
  }
  sendTo(peerId: number, msg: NetMessage): void {
    this.sent.push({ peerId, msg });
  }
  onMessage(cb: MessageHandler): void {
    this.messageHandler = cb;
  }
  onPeerChange(cb: PeerChangeHandler): void {
    this.peerChangeHandler = cb;
  }
  close(): void {}

  // --- テスト操作 ---
  receive(msg: NetMessage, from: number): void {
    this.messageHandler?.(msg, from);
  }
  peerChange(peerId: number, connected: boolean): void {
    this.peerChangeHandler?.(peerId, connected);
  }
  lastStateSyncTo(peerId: number) {
    const entry = [...this.sent].reverse().find((e) => e.peerId === peerId && e.msg.type === 'STATE_SYNC');
    return entry?.msg.type === 'STATE_SYNC' ? entry.msg.payload : null;
  }
  typesSent() {
    return this.sent.map((e) => e.msg.type);
  }
}

/** ホスト=0、子機=1。手番はホスト(0)。場札「木」。 */
function hostState(): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 0, name: 'Host', hand: [makePart('目', 1), makePart('火', 2)], score: [], connected: true },
      { id: 1, name: '相手', hand: [makePart('月', 3)], score: [], connected: true },
    ],
    turnOrder: [0, 1],
    currentTurnIndex: 0,
    deck: [makePart('日', 4)],
    field: [makePart('木', 5)],
    handSize: 2,
    winnerId: null,
  };
}

function setup() {
  const transport = new FakeTransport();
  let lastHostState: GameState | null = null;
  const fusions: FusionEvent[] = [];
  const host = new HostController(hostState(), transport, {
    onState: (s) => {
      lastHostState = s;
    },
    onFusion: (e) => fusions.push(e),
  });
  return { transport, host, fusions, getState: () => lastHostState };
}

describe('HostController', () => {
  it('ignores ACTION_SUBMIT from a non-turn player and keeps the turn', () => {
    const { transport, getState } = setup();
    // 手番はプレイヤー0。プレイヤー1が提示しても無視されるべき。
    transport.receive({ type: 'ACTION_SUBMIT', payload: { partId: 'part_3_月' } }, 1);

    expect(getState()).toBeNull(); // broadcastState が呼ばれていない＝状態不変。
  });

  it('advances the turn only when the turn player submits a non-matching part', () => {
    const { host, getState } = setup();
    // 手番プレイヤー0が「火」を提示 → 木+火 は不成立 → 手番交代。
    host.submit('part_2_火');

    const state = getState();
    expect(state?.currentTurnIndex).toBe(1);
  });

  it('keeps the same player on success and draws a new field', () => {
    const { transport, host, getState, fusions } = setup();
    // 手番プレイヤー0が「目」を提示 → 木+目=相 成立 → 同じ手番のまま新場札。
    host.submit('part_1_目');

    const state = getState();
    expect(state?.currentTurnIndex).toBe(0);
    expect(state?.players[0].score).toHaveLength(1);
    // 使った場札 木 は消費され、山札 日 が補充される。
    expect(state?.field.map((p) => p.kind)).toEqual(['日']);
    expect(fusions).toHaveLength(1);
    expect(fusions[0].char).toBe('相');
    expect(transport.typesSent()).toContain('SUBMIT_RESULT');
  });

  it('ignores a stale/unknown partId without advancing the turn', () => {
    const { host, getState } = setup();
    host.submit('does_not_exist');
    expect(getState()).toBeNull(); // 何も起きない。
  });

  it('reflects a guest JOIN name in the broadcast state', () => {
    const { transport } = setup();
    transport.peerChange(1, true); // welcome + broadcast
    transport.receive({ type: 'JOIN', payload: { name: 'こども' } }, 1);

    const sync = transport.lastStateSyncTo(1);
    expect(sync?.players.find((p) => p.id === 1)?.name).toBe('こども');
  });

  it('ignores ACTION_PASS from a non-turn player', () => {
    const { transport, getState } = setup();
    transport.receive({ type: 'ACTION_PASS', payload: {} }, 1);
    expect(getState()).toBeNull();
  });

  it('replies to HELLO with a WELCOME (初期同期の保証)', () => {
    const { transport } = setup();
    transport.receive({ type: 'HELLO', payload: {} }, 1);

    const welcome = transport.sent.find((e) => e.peerId === 1 && e.msg.type === 'WELCOME');
    expect(welcome).toBeDefined();
    if (welcome?.msg.type === 'WELCOME') {
      expect(welcome.msg.payload.playerId).toBe(1);
    }
  });
});
