// 読み取りの繰り返し: 映像の新しい画面ごとに (使えなければ描画ごとに) 1 回読む。
// 前の解析が終わるまで次は読まない (溜めない)。頻度の上限があれば間を空ける。

import { smooth } from './geometry';

/** 次の解析を始めてよいか。hz = 1 秒あたりの上限 (0 = 上限なし) */
export const shouldStart = (now: number, lastStart: number, hz: number) => hz <= 0 || now - lastStart >= 1000 / hz;

export interface ScanLoopDeps {
  video: HTMLVideoElement;
  /** 1 回読む。tFrame は解析する画面が表示される時刻 (枠の先読みの基準) */
  step: (tFrame: number) => Promise<void>;
  /** 今読んでよいか (準備中・一時停止中は false) */
  canScan: () => boolean;
  /** 1 秒あたりの上限 (0 = 上限なし) */
  hz: () => number;
}

export class ScanLoop {
  private running = false;
  private busy = false;
  private lastStart = -Infinity;
  /** 予約してある次の呼び出しを取り消す関数 (予約が 2 重にならないように) */
  private cancel: (() => void) | null = null;

  constructor(private readonly d: ScanLoopDeps) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    this.cancel?.();
    this.cancel = null;
  }

  /** 画面が裏から戻った時に呼ぶ (裏にある間は映像の画面の知らせが止まることがあるので、予約し直す) */
  resume() {
    if (this.running) this.schedule();
  }

  private schedule() {
    this.cancel?.();
    this.cancel = null;
    if (!this.running) return;
    const v = this.d.video;
    if ('requestVideoFrameCallback' in v) {
      const id = v.requestVideoFrameCallback(this.tick);
      this.cancel = () => v.cancelVideoFrameCallback(id);
    } else {
      const id = requestAnimationFrame(() => this.tick());
      this.cancel = () => cancelAnimationFrame(id);
    }
  }

  private readonly tick = (_now?: number, meta?: VideoFrameCallbackMetadata) => {
    this.cancel = null;
    this.schedule();
    const now = performance.now();
    if (this.busy || !this.d.canScan() || !shouldStart(now, this.lastStart, this.d.hz())) return;
    this.lastStart = now;
    this.busy = true;
    // 映像の新しい画面ごとに呼ばれる時は、その画面が表示される時刻を基準にする
    this.d
      .step(meta?.expectedDisplayTime ?? now)
      .catch((e) => console.error(e))
      .finally(() => (this.busy = false));
  };
}

/** 解析にかかった時間 (ならした値) と、1 秒あたりの回数 */
export class ScanStats {
  ms = 0;
  rate = 0;
  private count = 0;

  constructor(private since: number) {}

  /** 1 回分を足す。回数/秒を計算し直した時 (1 秒ごと) は true */
  add(duration: number, now: number): boolean {
    this.ms = this.ms ? smooth(this.ms, duration) : duration;
    this.count++;
    if (now - this.since <= 1000) return false;
    this.rate = (this.count * 1000) / (now - this.since);
    this.count = 0;
    this.since = now;
    return true;
  }
}
