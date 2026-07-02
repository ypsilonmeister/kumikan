import { describe, expect, it } from 'vitest';
import {
  SignalingController,
  type SignalingPeer,
  type SignalingState,
} from '../app/signaling';

class FakePeer implements SignalingPeer {
  isOpen = false;
  closed = false;
  accepted: RTCSessionDescriptionInit[] = [];
  private openHandler: (() => void) | null = null;

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'offer-sdp' };
  }

  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: `answer-for-${offer.sdp}` };
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.accepted.push(answer);
  }

  onOpen(cb: () => void): void {
    this.openHandler = cb;
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.isOpen = true;
    this.openHandler?.();
  }
}

function codec() {
  return {
    encode: (desc: RTCSessionDescriptionInit) => `${desc.type}:${desc.sdp}`,
    decode: (text: string): RTCSessionDescriptionInit => {
      const [type, sdp] = text.split(':');
      if (type !== 'offer' && type !== 'answer') {
        throw new Error('bad signal');
      }
      return { type, sdp };
    },
  };
}

function setup(role: 'host' | 'guest') {
  const peer = new FakePeer();
  const states: SignalingState[] = [];
  const connected: FakePeer[] = [];
  const controller = new SignalingController(
    role,
    (state) => states.push({ ...state }),
    (conn) => connected.push(conn),
    { createConnection: () => peer, ...codec() },
  );
  return { connected, controller, peer, states };
}

describe('SignalingController', () => {
  it('creates and exposes a host offer on start', async () => {
    const { controller, states } = setup('host');

    controller.start();
    await Promise.resolve();

    expect(states.at(-1)?.outgoing).toBe('offer:offer-sdp');
    expect(states.at(-1)?.busy).toBe(false);
  });

  it('creates a guest answer from an incoming offer', async () => {
    const { controller, states } = setup('guest');

    controller.start();
    controller.setIncoming('offer:host-sdp');
    await controller.guestMakeAnswer();

    expect(states.at(-1)).toMatchObject({
      outgoing: 'answer:answer-for-host-sdp',
      incoming: '',
      step: 'answer',
      busy: false,
    });
  });

  it('accepts a host answer and reports open connections', async () => {
    const { connected, controller, peer } = setup('host');

    controller.start();
    controller.setIncoming('answer:guest-sdp');
    await controller.hostAcceptAnswer();
    peer.open();

    expect(peer.accepted).toEqual([{ type: 'answer', sdp: 'guest-sdp' }]);
    expect(connected).toEqual([peer]);
  });

  it('closes only pending connections on teardown', () => {
    const pending = setup('guest');
    pending.controller.start();
    pending.controller.closeIfPending();
    expect(pending.peer.closed).toBe(true);

    const open = setup('guest');
    open.controller.start();
    open.peer.open();
    open.controller.closeIfPending();
    expect(open.peer.closed).toBe(false);
  });
});
