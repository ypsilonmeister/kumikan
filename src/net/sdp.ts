/**
 * シグナリングデータ（SDP）の軽量化と文字列化（仕様 3.1 / 3.2）。
 *
 * 完全な SDP は 3〜6KB あり QR に載らないため、接続確立に必要な要素だけを抽出して
 * 1 文字キーのオブジェクトにし、Base64 化する。受信側は同じ構造から最小の有効な
 * SDP を再構築して `setRemoteDescription` に渡す。
 *
 * 抽出する要素:
 *   - ice-ufrag / ice-pwd … ICE 認証（仕様 3.1）
 *   - fingerprint          … DTLS 証明書ハッシュ（仕様 3.1）
 *   - candidate            … 最優先のローカル IPv4 ホスト経路のみ（仕様 3.1 / 3.2 注記）
 *   - setup / mid          … DTLS ロールと m= セクション ID（再構築に必須の構造情報）
 *   - type                 … offer / answer
 *
 * メディアセクションは作らない（`createDataChannel` のみ）前提なので、再構築する
 * SDP は application/DTLS/SCTP の 1 セクションだけで固定できる。
 */

/** 抽出した最小シグナル。キーは QR ペイロード短縮のため 1 文字。 */
export interface MinimalSignal {
  /** type: 'o'=offer / 'a'=answer */
  t: 'o' | 'a';
  /** ice-ufrag */
  u: string;
  /** ice-pwd */
  p: string;
  /** fingerprint（"sha-256 AB:CD:..." の値部分） */
  f: string;
  /** DTLS setup: 'a'=active / 'p'=passive / 'A'=actpass */
  s: 'a' | 'p' | 'A';
  /** mid（m= セクション識別子） */
  m: string;
  /** 最優先の candidate（"candidate:..." の形式、先頭の "a=" のみ除去）。無ければ空。 */
  c: string;
}

const SETUP_TO_CODE: Record<string, MinimalSignal['s']> = {
  active: 'a',
  passive: 'p',
  actpass: 'A',
};
const CODE_TO_SETUP: Record<MinimalSignal['s'], string> = {
  a: 'active',
  p: 'passive',
  A: 'actpass',
};

function firstMatch(sdp: string, re: RegExp): string {
  const m = sdp.match(re);
  return m ? m[1] : '';
}

/**
 * candidate 行から、LAN 接続に最適な 1 本を選ぶ。
 * 優先順位: IPv4 の host typ > その他 host > 最初の candidate。
 * mDNS（.local）候補は相手から名前解決できないため避ける。
 */
function pickCandidate(sdp: string): string {
  const lines = sdp
    .split(/\r?\n/)
    .filter((line) => line.startsWith('a=candidate:'))
    .map((line) => line.slice('a='.length).trim()); // "candidate:..." を残す

  const isIpv4 = (c: string) => /\s\d{1,3}(\.\d{1,3}){3}\s/.test(c);
  const isHost = (c: string) => /\btyp host\b/.test(c);
  const isMdns = (c: string) => /\.local\b/.test(c);

  // 優先順位:
  //   1. 生 IPv4 の host（LAN で最も確実）
  //   2. その他の host（IPv6 等）
  //   3. mDNS host（.local。相手が名前解決できれば LAN で繋がる）
  //   4. 何かしらの candidate
  // mDNS を完全に捨てると、ローカル IP を mDNS 化して返すブラウザで
  // candidate が空になり接続不能になるため、最終フォールバックとして残す。
  const nonMdns = lines.filter((c) => !isMdns(c));
  return (
    nonMdns.find((c) => isHost(c) && isIpv4(c)) ??
    nonMdns.find((c) => isHost(c)) ??
    lines.find((c) => isHost(c)) ?? // mDNS host を許可
    lines[0] ??
    ''
  );
}

/** 完全な SDP から最小シグナルを抽出する（SDP Munging）。 */
export function extractSignal(desc: RTCSessionDescriptionInit): MinimalSignal {
  const sdp = desc.sdp ?? '';
  const setupRaw = firstMatch(sdp, /a=setup:(\w+)/);
  return {
    t: desc.type === 'answer' ? 'a' : 'o',
    u: firstMatch(sdp, /a=ice-ufrag:(.+)/),
    p: firstMatch(sdp, /a=ice-pwd:(.+)/),
    f: firstMatch(sdp, /a=fingerprint:sha-256\s+(.+)/),
    s: SETUP_TO_CODE[setupRaw] ?? 'A',
    m: firstMatch(sdp, /a=mid:(.+)/) || '0',
    c: pickCandidate(sdp),
  };
}

/** 最小シグナルから、有効な data-only SDP を再構築する。 */
export function rebuildSdp(sig: MinimalSignal): string {
  const candidateLine = sig.c ? `a=${sig.c}\r\n` : '';
  // data-only（application/DTLS/SCTP）の標準的な 1 セクション SDP。
  return (
    'v=0\r\n' +
    'o=- 0 0 IN IP4 127.0.0.1\r\n' +
    's=-\r\n' +
    't=0 0\r\n' +
    'a=group:BUNDLE ' + sig.m + '\r\n' +
    'a=extmap-allow-mixed\r\n' +
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
    'c=IN IP4 0.0.0.0\r\n' +
    candidateLine +
    'a=ice-ufrag:' + sig.u + '\r\n' +
    'a=ice-pwd:' + sig.p + '\r\n' +
    'a=ice-options:trickle\r\n' +
    'a=fingerprint:sha-256 ' + sig.f + '\r\n' +
    'a=setup:' + CODE_TO_SETUP[sig.s] + '\r\n' +
    'a=mid:' + sig.m + '\r\n' +
    'a=sctp-port:5000\r\n' +
    'a=max-message-size:262144\r\n'
  );
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * QR / コピペ用の短い文字列にする。
 * 最小シグナル JSON（1 文字キー）→ Base64。
 */
export function encodeSignal(desc: RTCSessionDescriptionInit): string {
  return toBase64(JSON.stringify(extractSignal(desc)));
}

export function decodeSignal(text: string): RTCSessionDescriptionInit {
  const sig = JSON.parse(fromBase64(text)) as MinimalSignal;
  return {
    type: sig.t === 'a' ? 'answer' : 'offer',
    sdp: rebuildSdp(sig),
  };
}
