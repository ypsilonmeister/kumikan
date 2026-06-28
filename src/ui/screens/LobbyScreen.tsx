import { useState } from 'react';

export type LobbyMode = 'local' | 'host' | 'guest';

interface LobbyScreenProps {
  notice: {
    kind: string;
    text: string;
  };
  /** ローカル単独プレイ（1 画面で全員）。 */
  onStartLocal: (names: string[], handSize: number) => void;
  /** ホストとして 2 人対戦を開始（自分=プレイヤー1、相手=プレイヤー2）。 */
  onStartHost: (hostName: string, handSize: number) => void;
  /** 子機として参加。 */
  onStartGuest: (guestName: string) => void;
}

const defaultNames = ['おとうさん', 'おかあさん', 'こども'];

export function LobbyScreen({ notice, onStartLocal, onStartHost, onStartGuest }: LobbyScreenProps) {
  const [mode, setMode] = useState<LobbyMode>('local');
  const [playerCount, setPlayerCount] = useState(3);
  const [handSize, setHandSize] = useState(5);
  const [names, setNames] = useState(defaultNames);
  const [myName, setMyName] = useState('');

  const activeNames = Array.from(
    { length: playerCount },
    (_, index) => names[index] ?? `プレイヤー${index + 1}`,
  );

  function updateName(index: number, value: string) {
    const next = [...names];
    next[index] = value;
    setNames(next);
  }

  return (
    <main className="app-shell">
      <section className="setup-panel" aria-label="ゲーム設定">
        <div className="brand-block">
          <p className="eyebrow">クミカン - 組み漢字パズル</p>
          <h1>あそびかたを選ぶ</h1>
        </div>

        <div className={`notice notice--${notice.kind}`}>{notice.text}</div>

        <div className="mode-tabs" role="tablist" aria-label="モード">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'local'}
            className={`mode-tab${mode === 'local' ? ' is-active' : ''}`}
            onClick={() => setMode('local')}
          >
            1台であそぶ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'host'}
            className={`mode-tab${mode === 'host' ? ' is-active' : ''}`}
            onClick={() => setMode('host')}
          >
            ホストになる
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'guest'}
            className={`mode-tab${mode === 'guest' ? ' is-active' : ''}`}
            onClick={() => setMode('guest')}
          >
            参加する
          </button>
        </div>

        {mode === 'local' && (
          <>
            <div className="control-grid">
              <label>
                <span>人数</span>
                <select value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))}>
                  <option value={2}>2人</option>
                  <option value={3}>3人</option>
                  <option value={4}>4人</option>
                </select>
              </label>
              <label>
                <span>手札</span>
                <select value={handSize} onChange={(event) => setHandSize(Number(event.target.value))}>
                  <option value={3}>3枚</option>
                  <option value={4}>4枚</option>
                  <option value={5}>5枚</option>
                  <option value={6}>6枚</option>
                </select>
              </label>
            </div>
            <div className="name-list">
              {activeNames.map((name, index) => (
                <label key={index}>
                  <span>{index + 1}人目</span>
                  <input value={name} onChange={(event) => updateName(index, event.target.value)} />
                </label>
              ))}
            </div>
            <button className="primary-action" type="button" onClick={() => onStartLocal(activeNames, handSize)}>
              はじめる
            </button>
          </>
        )}

        {mode === 'host' && (
          <>
            <p className="mode-help">2 台で対戦します。次の画面で接続コードを相手に渡してください。</p>
            <div className="control-grid">
              <label>
                <span>手札</span>
                <select value={handSize} onChange={(event) => setHandSize(Number(event.target.value))}>
                  <option value={3}>3枚</option>
                  <option value={4}>4枚</option>
                  <option value={5}>5枚</option>
                  <option value={6}>6枚</option>
                </select>
              </label>
            </div>
            <div className="name-list">
              <label>
                <span>あなたの名前</span>
                <input
                  value={myName}
                  placeholder="おとうさん"
                  onChange={(event) => setMyName(event.target.value)}
                />
              </label>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => onStartHost(myName || 'ホスト', handSize)}
            >
              接続を作る
            </button>
          </>
        )}

        {mode === 'guest' && (
          <>
            <p className="mode-help">ホストの接続コードを次の画面で貼り付けます。</p>
            <div className="name-list">
              <label>
                <span>あなたの名前</span>
                <input
                  value={myName}
                  placeholder="こども"
                  onChange={(event) => setMyName(event.target.value)}
                />
              </label>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => onStartGuest(myName || 'ゲスト')}
            >
              参加する
            </button>
          </>
        )}
      </section>
    </main>
  );
}
