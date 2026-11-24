// 数の小さな計算 (純粋関数)。

/** x を lo〜hi に収める */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 測り値をならす: 前の値 prev に、新しい値 x を割合 k だけ混ぜる */
export const smooth = (prev: number, x: number, k = 0.2) => prev + (x - prev) * k;
