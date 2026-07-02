import { useEffect, useState } from 'react';
import type { ActionResult } from '../app/events';
import type { PublicGameState } from '../domain/types';

export type NoticeKind = 'neutral' | 'success' | 'fail';

export interface Notice {
  kind: NoticeKind;
  text: string;
  scopeKey?: string;
}

export function noticeScopeKey(view: PublicGameState): string {
  const handKey = view.hand.map((part) => part.id).join('|');
  const fieldKey = view.field.map((part) => part.id).join('|') || 'no-field';
  return `${view.currentPlayerId ?? 'none'}:${fieldKey}:${handKey}`;
}

export function defaultGameNotice(view: PublicGameState): string {
  if (view.phase === 'finished') {
    return 'ゲーム終了です。';
  }
  if (view.field.length === 0) {
    return '場札がありません。';
  }
  return '場札に合うパーツを選んでください。';
}

export function noticeForActionResult(result: ActionResult, scopeKey?: string): Notice {
  if (result.kind === 'fused') {
    return {
      kind: 'success',
      text: `${result.playerName} が「${result.char}」を完成。続けて同じ人の番です。`,
      scopeKey,
    };
  }

  if (result.kind === 'submit-failed') {
    return {
      kind: 'fail',
      text: `${result.playerName} の組み合わせは成立しませんでした。${result.drew ? '手札を1枚引いて' : ''}次の番です。`,
      scopeKey,
    };
  }

  return {
    kind: 'neutral',
    text: `${result.playerName} はパスしました。${result.drew ? '手札を1枚引きました。' : ''}`,
    scopeKey,
  };
}

export function useNotice(view: PublicGameState | null, initial: Notice) {
  const [notice, setNotice] = useState<Notice>(initial);

  useEffect(() => {
    if (!notice.scopeKey || !view) {
      return;
    }

    if (notice.scopeKey !== noticeScopeKey(view)) {
      setNotice({ kind: 'neutral', text: defaultGameNotice(view) });
    }
  }, [view, notice.scopeKey]);

  return { notice, setNotice };
}
