import { useCallback, useEffect, useRef, useState } from 'react';
import { RtcConnection } from '../../net/rtcConnection';
import { decodeSignal, encodeSignal } from '../../net/sdp';
import { QrDisplay } from '../components/QrDisplay';
import { QrScanner } from '../components/QrScanner';

export type ConnectRole = 'host' | 'guest';

interface ConnectScreenProps {
  role: ConnectRole;
  /** 接続が open したら、確立済み接続を引き渡す。 */
  onConnected: (conn: RtcConnection) => void;
  onCancel: () => void;
}

type HostStep = 'offer' | 'answer';
type GuestStep = 'offer' | 'answer';

export function ConnectScreen({ role, onConnected, onCancel }: ConnectScreenProps) {
  const connRef = useRef<RtcConnection | null>(null);
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [step, setStep] = useState<HostStep | GuestStep>('offer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleScan = useCallback((text: string) => {
    setIncoming(text);
    setScanning(false);
    setError(null);
  }, []);

  // マウント時に接続を 1 つ用意。ホストは即 offer 生成を始める。
  useEffect(() => {
    const conn = new RtcConnection();
    connRef.current = conn;
    conn.onOpen(() => onConnected(conn));

    if (role === 'host') {
      setBusy(true);
      conn
        .createOffer()
        .then((offer) => setOutgoing(encodeSignal(offer)))
        .catch(() => setError('オファーの生成に失敗しました。'))
        .finally(() => setBusy(false));
    }

    return () => {
      // open 済みで onConnected 済みなら閉じない。未確立なら破棄。
      if (!conn.isOpen) {
        conn.close();
      }
    };
    // role 固定。onConnected は安定参照前提（App 側で useCallback）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function copyOutgoing() {
    try {
      await navigator.clipboard.writeText(outgoing);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('クリップボードにコピーできませんでした。手動で選択してください。');
    }
  }

  // 子機: 受け取った offer から answer を生成。
  async function guestMakeAnswer() {
    const conn = connRef.current;
    if (!conn) return;
    setError(null);
    setBusy(true);
    try {
      const answer = await conn.createAnswer(decodeSignal(incoming));
      setOutgoing(encodeSignal(answer));
      setIncoming('');
      setStep('answer');
    } catch {
      setError('オファーの読み取りに失敗しました。文字列を確認してください。');
    } finally {
      setBusy(false);
    }
  }

  // ホスト: 子機から返ってきた answer を適用。
  async function hostAcceptAnswer() {
    const conn = connRef.current;
    if (!conn) return;
    setError(null);
    setBusy(true);
    try {
      await conn.acceptAnswer(decodeSignal(incoming));
      // 以降は onOpen → onConnected で画面遷移。
    } catch {
      setError('アンサーの読み取りに失敗しました。文字列を確認してください。');
    } finally {
      setBusy(false);
    }
  }

  const heading = role === 'host' ? 'ホストとして接続' : '参加して接続';

  return (
    <main className="app-shell">
      <section className="setup-panel" aria-label="接続">
        <div className="brand-block">
          <p className="eyebrow">手動コピペ接続（同一 LAN）</p>
          <h1>{heading}</h1>
        </div>

        {error && <div className="notice notice--fail">{error}</div>}

        {role === 'host' && (
          <>
            <ConnectField
              label="① この「オファー」を相手に渡す（QR をスキャンしてもらう）"
              value={busy && !outgoing ? '生成中…' : outgoing}
              readOnly
              onCopy={outgoing ? copyOutgoing : undefined}
              copied={copied}
            />
            {outgoing && <QrDisplay value={outgoing} />}

            {scanning ? (
              <QrScanner onResult={handleScan} onCancel={() => setScanning(false)} />
            ) : (
              <ConnectField
                label="② 相手の「アンサー」を読み取り or 貼り付け"
                value={incoming}
                onChange={setIncoming}
                placeholder="相手の画面の文字列を貼り付け"
                onScan={() => setScanning(true)}
              />
            )}
            <button
              className="primary-action"
              type="button"
              disabled={busy || !incoming.trim()}
              onClick={hostAcceptAnswer}
            >
              接続する
            </button>
          </>
        )}

        {role === 'guest' && step === 'offer' && (
          <>
            {scanning ? (
              <QrScanner onResult={handleScan} onCancel={() => setScanning(false)} />
            ) : (
              <ConnectField
                label="① ホストの「オファー」を読み取り or 貼り付け"
                value={incoming}
                onChange={setIncoming}
                placeholder="ホストの画面の文字列を貼り付け"
                onScan={() => setScanning(true)}
              />
            )}
            <button
              className="primary-action"
              type="button"
              disabled={busy || !incoming.trim()}
              onClick={guestMakeAnswer}
            >
              アンサーを作る
            </button>
          </>
        )}

        {role === 'guest' && step === 'answer' && (
          <>
            <ConnectField
              label="② この「アンサー」をホストに渡す（QR をスキャンしてもらう）"
              value={outgoing}
              readOnly
              onCopy={outgoing ? copyOutgoing : undefined}
              copied={copied}
            />
            {outgoing && <QrDisplay value={outgoing} />}
            <div className="notice notice--neutral">ホストが接続するのを待っています…</div>
          </>
        )}

        <button className="ghost-action" type="button" onClick={onCancel}>
          戻る
        </button>
      </section>
    </main>
  );
}

interface ConnectFieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  copied?: boolean;
  onChange?: (value: string) => void;
  onCopy?: () => void;
  onScan?: () => void;
}

function ConnectField({
  label,
  value,
  readOnly = false,
  placeholder,
  copied = false,
  onChange,
  onCopy,
  onScan,
}: ConnectFieldProps) {
  return (
    <label className="connect-field">
      <span>{label}</span>
      <textarea
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        rows={4}
      />
      <div className="connect-field__actions">
        {onScan && (
          <button type="button" className="secondary-action" onClick={onScan}>
            QR をスキャン
          </button>
        )}
        {onCopy && (
          <button type="button" className="secondary-action" onClick={onCopy}>
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        )}
      </div>
    </label>
  );
}
