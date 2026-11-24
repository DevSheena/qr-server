// 座標と数の小さな計算 (純粋関数)。点は [x, y]。単位 (カメラ映像の画素・画面の画素) は使う側で決まる。

export type Pt = [number, number];
export interface Size {
  w: number;
  h: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** x を lo〜hi に収める */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 測り値をならす: 前の値 prev に、新しい値 x を割合 k だけ混ぜる */
export const smooth = (prev: number, x: number, k = 0.2) => prev + (x - prev) * k;

/** p + v × k */
export const addScaled = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];

/** a から b への変化を k で割ったもの ((b − a) ÷ k。k が時間なら速さ) */
export const diffPer = (a: Pt, b: Pt, k: number): Pt => [(b[0] - a[0]) / k, (b[1] - a[1]) / k];

/** a と b を混ぜる (t = 0 で a、1 で b) */
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 中央の、幅と高さが割合 frac の範囲 (frac = 1 で全体) */
export function centerRect(size: Size, frac: number): Rect {
  const w = Math.round(size.w * frac);
  const h = Math.round(size.h * frac);
  return { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
}

/** 四隅 (左上から時計回り) */
export const rectCorners = (r: Rect): Pt[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];

/**
 * 映像を object-fit: cover (はみ出す分を切り取って埋める) で表示した時に、映像の画素を表示先 (view) の画素に写す関数。
 * mirror は左右反転の表示。
 */
export function coverTransform(view: Size, video: Size, mirror: boolean): (p: Pt) => Pt {
  const k = Math.max(view.w / video.w, view.h / video.h);
  const ox = (view.w - video.w * k) / 2;
  const oy = (view.h - video.h * k) / 2;
  return ([x, y]) => {
    const sx = ox + x * k;
    return [mirror ? view.w - sx : sx, oy + y * k];
  };
}
