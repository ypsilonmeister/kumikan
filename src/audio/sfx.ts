// Web Audio による軽量効果音。
// 効果音ファイルを持たず波形を合成するので、アセット追加ゼロ・オフライン/PWA でも確実に鳴る。
// 将来ファイル差し替えする場合は playTones を AudioBuffer 再生に置き換えればよい。

const MUTE_KEY = 'kumikan.muted';

let ctx: AudioContext | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // localStorage 不可環境では保存しないだけ（音のオン/オフ自体は効く）。
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/** AudioContext を取得（無ければ生成）。suspended なら resume を試みる。 */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

/**
 * 最初のユーザー操作で AudioContext を起こしておく（ブラウザの自動再生ポリシー対策）。
 * 操作ハンドラ内から一度呼べばよい。
 */
export function primeAudio(): void {
  audio();
}

interface ToneSpec {
  /** 周波数（Hz）。 */
  freq: number;
  /** 鳴り始めのオフセット（秒）。和音やアルペジオに使う。 */
  start: number;
  /** 長さ（秒）。 */
  dur: number;
  type?: OscillatorType;
  /** ピーク音量（0〜1）。 */
  gain?: number;
}

function playTones(tones: ToneSpec[]): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime;
  for (const tone of tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;

    const peak = tone.gain ?? 0.18;
    const startAt = now + tone.start;
    const endAt = startAt + tone.dur;
    // クリックノイズを避けるため、立ち上がり/減衰を指数カーブで付ける。
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.connect(gain).connect(ac.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

/** 合体成功・漢字完成: 上昇アルペジオ（ド・ミ・ソ）。 */
export function playSuccess(): void {
  playTones([
    { freq: 523.25, start: 0, dur: 0.12, type: 'triangle' },
    { freq: 659.25, start: 0.08, dur: 0.12, type: 'triangle' },
    { freq: 783.99, start: 0.16, dur: 0.18, type: 'triangle' },
  ]);
}

/** 合体失敗: 低めの下降2音。 */
export function playFail(): void {
  playTones([
    { freq: 196.0, start: 0, dur: 0.12, type: 'sawtooth', gain: 0.12 },
    { freq: 146.83, start: 0.1, dur: 0.16, type: 'sawtooth', gain: 0.12 },
  ]);
}

/** パス（場札が1枚増える）: 中庸な単発ブリップ。 */
export function playPass(): void {
  playTones([{ freq: 392.0, start: 0, dur: 0.1, type: 'square', gain: 0.1 }]);
}

/** 自分の手番が回ってきた: やわらかい上昇2音の通知。 */
export function playTurn(): void {
  playTones([
    { freq: 587.33, start: 0, dur: 0.1, type: 'sine' },
    { freq: 880.0, start: 0.1, dur: 0.15, type: 'sine' },
  ]);
}

/** ゲーム終了・勝利: 4音のファンファーレ（ド・ミ・ソ・ド）。 */
export function playWin(): void {
  playTones([
    { freq: 523.25, start: 0, dur: 0.14, type: 'triangle' },
    { freq: 659.25, start: 0.14, dur: 0.14, type: 'triangle' },
    { freq: 783.99, start: 0.28, dur: 0.14, type: 'triangle' },
    { freq: 1046.5, start: 0.42, dur: 0.3, type: 'triangle', gain: 0.2 },
  ]);
}
