import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  /** QR を読み取れたら、その文字列を渡す。 */
  onResult: (text: string) => void;
  onCancel: () => void;
}

/**
 * カメラ映像から QR を読み取る。jsQR で各フレームを走査し、見つかったら停止する。
 * 完全ローカル動作（外部送信なし）。背面カメラ（environment）を優先。
 */
export function QrScanner({ onResult, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    }

    function scan() {
      const video = videoRef.current;
      if (stopped || !video || !ctx) {
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });
        if (found?.data) {
          stop();
          onResult(found.data);
          return;
        }
      }
      raf = requestAnimationFrame(scan);
    }

    // secure context（HTTPS / localhost）以外ではカメラ API 自体が無い。
    // optional chaining だけだと Promise が走らず catch も効かないため、明示的に弾く。
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('この環境ではカメラを使えません（HTTPS が必要）。文字列の貼り付けを使ってください。');
      return stop;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          void video.play();
          raf = requestAnimationFrame(scan);
        }
      })
      .catch(() => {
        setError('カメラを起動できませんでした。文字列の貼り付けを使ってください。');
      });

    return stop;
    // onResult は安定参照前提（呼び出し側で useCallback）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="qr-scanner">
      {error ? (
        <div className="notice notice--fail">{error}</div>
      ) : (
        <video ref={videoRef} className="qr-scanner__video" muted playsInline />
      )}
      <button type="button" className="secondary-action" onClick={onCancel}>
        スキャンをやめる
      </button>
    </div>
  );
}
