import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal, extractSignal, rebuildSdp } from '../net/sdp';
import { deserialize, netMessage, serialize, type NetMessage } from '../net/messages';
import { Inbox } from '../net/inbox';

/** ブラウザが生成する典型的な data-only オファー SDP（複数 candidate 入り）。 */
function sampleOfferSdp(): string {
  return [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS',
    'm=application 51234 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 192.168.1.20',
    'a=candidate:1 1 udp 2113937151 9a1b.local 51234 typ host',
    'a=candidate:2 1 udp 2113937151 192.168.1.20 51234 typ host',
    'a=candidate:3 1 udp 1677729535 203.0.113.7 51234 typ srflx',
    'a=ice-ufrag:Xy9Q',
    'a=ice-pwd:abcdefABCDEF0123456789zz',
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
    'a=setup:actpass',
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    '',
  ].join('\r\n');
}

describe('sdp munging (仕様 3.1 / 3.2)', () => {
  it('extracts the four essential fields plus structural info', () => {
    const sig = extractSignal({ type: 'offer', sdp: sampleOfferSdp() });
    expect(sig.t).toBe('o');
    expect(sig.u).toBe('Xy9Q');
    expect(sig.p).toBe('abcdefABCDEF0123456789zz');
    expect(sig.f).toMatch(/^AB:CD:EF:/);
    expect(sig.s).toBe('A'); // actpass
    expect(sig.m).toBe('0');
  });

  it('prefers the IPv4 host candidate and skips mDNS/srflx', () => {
    const sig = extractSignal({ type: 'offer', sdp: sampleOfferSdp() });
    expect(sig.c).toContain('192.168.1.20');
    expect(sig.c).toContain('typ host');
    expect(sig.c).not.toContain('.local');
    expect(sig.c).not.toContain('srflx');
  });

  it('falls back to an mDNS host candidate when no raw IPv4 host exists', () => {
    // ローカル IP を mDNS 化して返すブラウザ（IPv4 host 行が無い）を再現。
    const mdnsOnly = [
      'v=0',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'a=candidate:1 1 udp 2113937151 9a1b2c3d-4e5f.local 51234 typ host',
      'a=candidate:2 1 udp 1677729535 203.0.113.7 51234 typ srflx',
      'a=ice-ufrag:Mdns',
      'a=ice-pwd:pwdpwdpwdpwdpwdpwdpwdp',
      'a=fingerprint:sha-256 11:22:33:44',
      'a=setup:actpass',
      'a=mid:0',
      '',
    ].join('\r\n');
    const sig = extractSignal({ type: 'offer', sdp: mdnsOnly });
    // 空にせず mDNS host を保持する（接続不能を防ぐ）。
    expect(sig.c).not.toBe('');
    expect(sig.c).toContain('.local');
    expect(sig.c).toContain('typ host');
  });

  it('round-trips type and rebuilds a valid data-only SDP', () => {
    const decoded = decodeSignal(encodeSignal({ type: 'offer', sdp: sampleOfferSdp() }));
    expect(decoded.type).toBe('offer');
    // 再構築 SDP に接続必須要素が残っていること。
    expect(decoded.sdp).toContain('a=ice-ufrag:Xy9Q');
    expect(decoded.sdp).toContain('a=ice-pwd:abcdefABCDEF0123456789zz');
    expect(decoded.sdp).toContain('a=fingerprint:sha-256 AB:CD:EF:');
    expect(decoded.sdp).toContain('a=setup:actpass');
    expect(decoded.sdp).toContain('UDP/DTLS/SCTP webrtc-datachannel');
    expect(decoded.sdp).toContain('192.168.1.20');
  });

  it('maps the answer setup role (active) correctly', () => {
    const answer = sampleOfferSdp().replace('a=setup:actpass', 'a=setup:active');
    const decoded = decodeSignal(encodeSignal({ type: 'answer', sdp: answer }));
    expect(decoded.type).toBe('answer');
    expect(decoded.sdp).toContain('a=setup:active');
  });

  it('produces a compact payload (QR-friendly)', () => {
    const payload = encodeSignal({ type: 'offer', sdp: sampleOfferSdp() });
    // 元 SDP より十分小さく、QR バージョン 5〜7 圏内（〜500 文字弱）。
    expect(payload.length).toBeLessThan(sampleOfferSdp().length);
    expect(payload.length).toBeLessThan(500);
  });

  it('tolerates a missing candidate (rebuild omits the line)', () => {
    const noCand = sampleOfferSdp()
      .split('\r\n')
      .filter((line) => !line.startsWith('a=candidate:'))
      .join('\r\n');
    const sig = extractSignal({ type: 'offer', sdp: noCand });
    expect(sig.c).toBe('');
    expect(rebuildSdp(sig)).not.toContain('a=candidate:');
  });
});

describe('net message serialization', () => {
  it('round-trips a guest action', () => {
    const msg: NetMessage = netMessage({ type: 'ACTION_SUBMIT', payload: { partId: 'part_1_目' } });
    expect(deserialize(serialize(msg))).toEqual(msg);
  });

  it('round-trips a submit result event', () => {
    const msg: NetMessage = netMessage({
      type: 'SUBMIT_RESULT',
      payload: { playerId: 1, field: '木', part: '目', result: '相' },
    });
    expect(deserialize(serialize(msg))).toEqual(msg);
  });

  it('rejects messages from a different protocol version', () => {
    expect(() =>
      deserialize(JSON.stringify({ v: 999, type: 'ACTION_PASS', payload: {} })),
    ).toThrow(/Unsupported protocol version/);
  });
});

describe('Inbox (handler 登録前の取りこぼし防止)', () => {
  const publicState = {
    phase: 'playing' as const,
    players: [],
    turnOrder: [],
    currentPlayerId: null,
    field: [],
    hand: [],
    deckCount: 0,
    handSize: 6,
    winnerId: null,
  };
  const welcome: NetMessage = netMessage({
    type: 'WELCOME',
    payload: { playerId: 1, state: publicState },
  });

  it('flushes messages that arrived before a handler was registered', () => {
    const inbox = new Inbox();
    // handler 登録前に WELCOME が到着するレースを再現。
    inbox.deliver(welcome);

    const received: NetMessage[] = [];
    inbox.setHandler((msg) => received.push(msg));

    expect(received).toEqual([welcome]); // 取りこぼさず flush される。
  });

  it('preserves arrival order across the handler boundary', () => {
    const inbox = new Inbox();
    const a: NetMessage = netMessage({ type: 'STATE_SYNC', payload: publicState });
    inbox.deliver(welcome); // 登録前
    const received: NetMessage[] = [];
    inbox.setHandler((msg) => received.push(msg));
    inbox.deliver(a); // 登録後

    expect(received.map((m) => m.type)).toEqual(['WELCOME', 'STATE_SYNC']);
  });

  it('drops queued messages after clear (teardown)', () => {
    const inbox = new Inbox();
    inbox.deliver(welcome);
    inbox.clear();

    const received: NetMessage[] = [];
    inbox.setHandler((msg) => received.push(msg));

    expect(received).toEqual([]);
  });
});
