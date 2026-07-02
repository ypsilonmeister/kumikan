import { describe, expect, it } from 'vitest';
import { GuestController } from '../app/guestController';
import type { ActionResult, FusionEvent } from '../app/events';
import type { PublicGameState } from '../domain/types';
import { netMessage, type NetMessage } from '../net/messages';
import type { MessageHandler, PeerChangeHandler, Transport } from '../net/transport';

class FakeGuestTransport implements Transport {
  sent: NetMessage[] = [];
  closed = false;
  private messageHandler: MessageHandler | null = null;

  send(msg: NetMessage): void {
    this.sent.push(msg);
  }
  sendTo(_peerId: number, msg: NetMessage): void {
    this.sent.push(msg);
  }
  onMessage(cb: MessageHandler): void {
    this.messageHandler = cb;
  }
  onPeerChange(_cb: PeerChangeHandler): void {}
  close(): void {
    this.closed = true;
  }

  receive(msg: NetMessage): void {
    this.messageHandler?.(msg, 0);
  }
}

function publicState(): PublicGameState {
  return {
    phase: 'playing',
    players: [],
    turnOrder: [],
    currentPlayerId: null,
    field: [],
    hand: [],
    deckCount: 0,
    handSize: 6,
    winnerId: null,
  };
}

function setup() {
  const transport = new FakeGuestTransport();
  const states: PublicGameState[] = [];
  const welcomes: number[] = [];
  const fusions: FusionEvent[] = [];
  const actionResults: ActionResult[] = [];
  const controller = new GuestController(
    transport,
    {
      onState: (state) => states.push(state),
      onWelcome: (playerId) => welcomes.push(playerId),
      onFusion: (event) => fusions.push(event),
      onActionResult: (result) => actionResults.push(result),
    },
    'こども',
  );
  return { actionResults, controller, fusions, states, transport, welcomes };
}

describe('GuestController', () => {
  it('sends HELLO on start, then JOIN after WELCOME and state delivery', () => {
    const { controller, states, transport, welcomes } = setup();

    controller.start();
    transport.receive(netMessage({ type: 'WELCOME', payload: { playerId: 1, state: publicState() } }));

    expect(transport.sent.map((msg) => msg.type)).toEqual(['HELLO', 'JOIN']);
    expect(welcomes).toEqual([1]);
    expect(states).toHaveLength(1);
    expect(controller.myPlayerId).toBe(1);
  });

  it('blocks sends and callbacks after close', () => {
    const { controller, states, transport } = setup();

    controller.close();
    controller.start();
    controller.submit('part_1_目');
    controller.pass();
    transport.receive(netMessage({ type: 'STATE_SYNC', payload: publicState() }));

    expect(transport.closed).toBe(true);
    expect(transport.sent).toEqual([]);
    expect(states).toEqual([]);
  });

  it('forwards fusion and action-result messages to callbacks', () => {
    const { actionResults, fusions, transport } = setup();

    transport.receive(
      netMessage({
        type: 'SUBMIT_RESULT',
        payload: { playerId: 0, field: '木', part: '目', result: '相' },
      }),
    );
    transport.receive(
      netMessage({
        type: 'ACTION_RESULT',
        payload: { kind: 'submit-failed', playerId: 1, playerName: 'こども', drew: true },
      }),
    );

    expect(fusions).toEqual([{ playerId: 0, char: '相', from: ['木', '目'] }]);
    expect(actionResults).toEqual([{ kind: 'submit-failed', playerId: 1, playerName: 'こども', drew: true }]);
  });
});
