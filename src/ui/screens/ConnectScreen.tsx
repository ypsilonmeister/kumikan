import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialSignalingState,
  SignalingController,
  type SignalingConnection,
} from '../../app/signaling';
import { QrDisplay } from '../components/QrDisplay';
import { QrScanner } from '../components/QrScanner';

export type ConnectRole = 'host' | 'guest';

interface ConnectScreenProps {
  role: ConnectRole;
  /** 接続が open したら、確立済み接続を引き渡す。 */
  onConnected: (conn: SignalingConnection) => void;
  onCancel: () => void;
}

export function ConnectScreen({ role, onConnected, onCancel }: ConnectScreenProps) {
  const signalingRef = useRef<SignalingController | null>(null);
  const [signaling, setSignaling] = useState(createInitialSignalingState);
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleScan = useCallback((text: string) => {
    signalingRef.current?.setIncoming(text);
    setScanning(false);
  }, []);

  // マウント時に接続を 1 つ用意。ホストは即 offer 生成を始める。
  useEffect(() => {
    const controller = new SignalingController(role, setSignaling, onConnected);
    signalingRef.current = controller;
    controller.start();

    return () => {
      controller.closeIfPending();
      if (signalingRef.current === controller) {
        signalingRef.current = null;
      }
    };
    // role 固定。onConnected は安定参照前提（App 側で useCallback）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function copyOutgoing() {
    try {
      await navigator.clipboard.writeText(signaling.outgoing);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setSignaling((current) => ({
        ...current,
        error: 'クリップボードにコピーできませんでした。手動で選択してください。',
      }));
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

        {signaling.error && <div className="notice notice--fail">{signaling.error}</div>}

        {role === 'host' && (
          <>
            <ConnectField
              label="① この「オファー」を相手に渡す（QR をスキャンしてもらう）"
              value={signaling.busy && !signaling.outgoing ? '生成中…' : signaling.outgoing}
              readOnly
              onCopy={signaling.outgoing ? copyOutgoing : undefined}
              copied={copied}
            />
            {signaling.outgoing && <QrDisplay value={signaling.outgoing} />}

            {scanning ? (
              <QrScanner onResult={handleScan} onCancel={() => setScanning(false)} />
            ) : (
              <ConnectField
                label="② 相手の「アンサー」を読み取り or 貼り付け"
                value={signaling.incoming}
                onChange={(value) => signalingRef.current?.setIncoming(value)}
                placeholder="相手の画面の文字列を貼り付け"
                onScan={() => setScanning(true)}
              />
            )}
            <button
              className="primary-action"
              type="button"
              disabled={signaling.busy || !signaling.incoming.trim()}
              onClick={() => signalingRef.current?.hostAcceptAnswer()}
            >
              接続する
            </button>
          </>
        )}

        {role === 'guest' && signaling.step === 'offer' && (
          <>
            {scanning ? (
              <QrScanner onResult={handleScan} onCancel={() => setScanning(false)} />
            ) : (
              <ConnectField
                label="① ホストの「オファー」を読み取り or 貼り付け"
                value={signaling.incoming}
                onChange={(value) => signalingRef.current?.setIncoming(value)}
                placeholder="ホストの画面の文字列を貼り付け"
                onScan={() => setScanning(true)}
              />
            )}
            <button
              className="primary-action"
              type="button"
              disabled={signaling.busy || !signaling.incoming.trim()}
              onClick={() => signalingRef.current?.guestMakeAnswer()}
            >
              アンサーを作る
            </button>
          </>
        )}

        {role === 'guest' && signaling.step === 'answer' && (
          <>
            <ConnectField
              label="② この「アンサー」をホストに渡す（QR をスキャンしてもらう）"
              value={signaling.outgoing}
              readOnly
              onCopy={signaling.outgoing ? copyOutgoing : undefined}
              copied={copied}
            />
            {signaling.outgoing && <QrDisplay value={signaling.outgoing} />}
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
