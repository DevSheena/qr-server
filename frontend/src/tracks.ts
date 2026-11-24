// 枠の追跡と先読み (計算は純粋関数。Tracker はそれを使う小さな入れ物)。
//
// 枠が遅れる理由: 結果が出るのは、解析した画面 (フレーム) が表示されてから解析の時間が経った後。
//   しかも次の結果まで同じ位置に描くので、動かすと枠が後ろに付いてきて、結果が来るたびに飛ぶ。
// 先読み: 同じコードの続けての結果から四隅の速さを求め、毎回の描画で「解析した画面の時刻から今まで」の分だけ先へ進めて描く。
//   先へ進める最大の時間は「画面から結果が出るまで + 結果の間隔」(その端末で測った値)。それより先へは進めない (止めた時に行き過ぎないように)。

import { addScaled, clamp, diffPer, lerpPt, smooth, type Pt } from './geometry';
import { codeKey, type Code } from './scanner/types';

export const TRACKING = {
  /** 読めない回が挟まっても、最後に読めてからこの時間 (ms) は枠を出す (ちらつかないように) */
  holdMs: 250,
  /** 消える前のこの時間 (ms) で薄くする */
  fadeMs: 100,
  /** 前の結果からこれより空いたら (ms)、速さを 0 からやり直す */
  velocityGapMs: 300,
  /** 角の位置の揺れで速さがぶれないよう、前の速さをこの割合で残す */
  velocityKeep: 0.4,
  /** 先へ進める時間の下限・上限 (ms) */
  aheadMinMs: 50,
  aheadMaxMs: 250,
} as const;

export interface Track {
  key: string;
  code: Code;
  /** 四隅 (カメラ映像の画素) */
  pts: Pt[];
  /** 四隅の速さ (画素 / ms) */
  vel: Pt[];
  /** その結果の画面が表示された時刻 */
  t: number;
}

/** 画面から結果が出るまで (lat)・結果の間隔 (gap)。ms、ならした値 */
export interface Timing {
  lat: number;
  gap: number;
}
export const INITIAL_TIMING: Timing = { lat: 30, gap: 33 };

const zeros = (n: number): Pt[] => Array.from({ length: n }, (): Pt => [0, 0]);

/** 前の枠と今回の結果を結び付けられる時の時間差 (ms)。結び付けられなければ null */
function linkGap(prev: Track | undefined, pts: readonly Pt[], tFrame: number): number | null {
  if (!prev || prev.pts.length !== pts.length) return null;
  const dt = tFrame - prev.t;
  return dt > 0 && dt < TRACKING.velocityGapMs ? dt : null;
}

/** 新しい結果で枠を更新する。今回読めなかったコードの枠も残す (消すのは時間で: visibleBoxes)。gaps は結び付いた結果の間隔 */
export function nextTracks(prev: readonly Track[], codes: readonly Code[], tFrame: number): { tracks: Track[]; gaps: number[] } {
  const prevByKey = new Map(prev.map((t) => [t.key, t]));
  const seen = new Set<string>();
  const gaps: number[] = [];
  const updated = codes.map((code): Track => {
    const key = codeKey(code);
    // 同じ画面に同じコードが 2 つある時、前の枠と結び付けるのは 1 つ目だけ
    const old = seen.has(key) ? undefined : prevByKey.get(key);
    seen.add(key);
    const dt = linkGap(old, code.points, tFrame);
    if (dt !== null) gaps.push(dt);
    const vel =
      old && dt !== null
        ? code.points.map((p, i) => lerpPt(old.vel[i], diffPer(old.pts[i], p, dt), 1 - TRACKING.velocityKeep))
        : zeros(code.points.length);
    return { key, code, pts: code.points, vel, t: tFrame };
  });
  return { tracks: [...updated, ...prev.filter((t) => !seen.has(t.key))], gaps };
}

/** 時間の測り値を更新する。latency = 画面が表示されてから結果が出るまで */
export const nextTiming = (t: Timing, latency: number, gaps: readonly number[]): Timing => ({
  lat: smooth(t.lat, latency),
  gap: gaps.reduce((g, x) => smooth(g, x), t.gap),
});

/** 先へ進める最大の時間 (ms) */
export const maxAhead = (t: Timing) => clamp(t.lat + t.gap * 1.2, TRACKING.aheadMinMs, TRACKING.aheadMaxMs);

/** 今描く四隅: 速さ × 経った時間 (最大 maxAheadMs) だけ先へ進める */
export const predictedCorners = (t: Track, now: number, maxAheadMs: number): Pt[] => {
  const ahead = clamp(now - t.t, 0, maxAheadMs);
  return t.pts.map((p, i) => addScaled(p, t.vel[i], ahead));
};

/** 最後に読めてから age ms 経った枠の濃さ (消える前の fadeMs で薄くする) */
export const fadeAlpha = (age: number) => clamp((TRACKING.holdMs - age) / TRACKING.fadeMs, 0, 1);

export interface TrackedBox {
  code: Code;
  /** 今描く四隅 (カメラ映像の画素) */
  pts: Pt[];
  alpha: number;
}

/** 読んだ結果を受け取り、今描く枠を返す */
export class Tracker {
  private tracks: Track[] = [];
  private time: Timing = { ...INITIAL_TIMING };

  /** tFrame = 解析した画面が表示された時刻、now = 結果が出た時刻 */
  update(codes: readonly Code[], tFrame: number, now: number) {
    const { tracks, gaps } = nextTracks(this.tracks, codes, tFrame);
    this.tracks = tracks;
    this.time = nextTiming(this.time, now - tFrame, gaps);
  }

  /** 今描く枠。predict が true なら先読みした位置。古くなった枠はここで捨てる */
  boxes(now: number, predict: boolean): TrackedBox[] {
    this.tracks = this.tracks.filter((t) => now - t.t <= TRACKING.holdMs);
    const ahead = predict ? maxAhead(this.time) : 0;
    return this.tracks.map((t) => ({ code: t.code, pts: predictedCorners(t, now, ahead), alpha: fadeAlpha(now - t.t) }));
  }

  clear() {
    this.tracks = [];
  }

  /** 確認用: 時間の測り値と、先へ進める最大の時間 */
  get timing() {
    return { ...this.time, max: maxAhead(this.time) };
  }
}
