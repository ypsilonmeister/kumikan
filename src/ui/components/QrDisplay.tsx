import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QrDisplayProps {
  /** QR 化する文字列（エンコード済みシグナル）。 */
  value: string;
  size?: number;
}

/**
 * 文字列を QR コードとして canvas に描画する。
 * オフライン（同一 LAN）で完結するよう、外部 API は使わず qrcode で生成する。
 */
export function QrDisplay({ value, size = 224 }: QrDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;

    let cancelled = false;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
    }).then(
      () => {
        if (!cancelled) setError(null);
      },
      () => {
        // データが大きすぎて QR に収まらない等。コピペにフォールバックできる。
        if (!cancelled) setError('QR を生成できませんでした。文字列を使ってください。');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="qr-display">
      <canvas ref={canvasRef} aria-label="接続用 QR コード" />
      {error && <p className="qr-display__error">{error}</p>}
    </div>
  );
}
