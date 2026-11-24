// 読んだ内容の記録 (画面とは別の、データだけの入れ物)。同じコードは 1 つにまとめて回数を数える。

import { codeKey, type Code } from './scanner/types';

/** 同じコードを読み続けている間 (前に読んでからこの時間 ms 以内) は、知らせ (振動・音・目立たせる) を繰り返さない */
export const REPEAT_MS = 3000;

export interface HistoryEntry {
  readonly key: string;
  readonly code: Code;
  readonly count: number;
  /** 最後に読んだ時刻 (Date.now()) */
  readonly last: number;
}
export interface Recorded {
  entry: HistoryEntry;
  /** 知らせるか (初めて、または前に読んでから REPEAT_MS より空いた) */
  fresh: boolean;
}

export class History {
  private readonly entries = new Map<string, HistoryEntry>();

  record(code: Code, now: number): Recorded {
    const key = codeKey(code);
    const old = this.entries.get(key);
    const entry: HistoryEntry = { key, code, count: (old?.count ?? 0) + 1, last: now };
    this.entries.set(key, entry);
    return { entry, fresh: !old || now - old.last > REPEAT_MS };
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}
