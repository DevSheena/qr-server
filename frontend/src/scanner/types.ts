// 読み取りで使う型と、zxing の Worker とのやりとりの形。
// 読み取りの中身 (scanner.ts) や Worker を読み込まずに使えるよう、型だけをここに置く。

import type { Fmt } from '../formats';
import type { Pt } from '../geometry';

export type Engine = 'native' | 'zxing';

/** 読めたコード */
export interface Code {
  format: Fmt;
  text: string;
  /** 四隅 (カメラ映像の画素) */
  points: Pt[];
  /** どちらで読んだか (内蔵 / zxing) */
  engine: Engine;
}

/** 同じコードを見分ける鍵 (種類と内容) */
export const codeKey = (c: Pick<Code, 'format' | 'text'>) => `${c.format}:${c.text}`;

/** どちらのライブラリの結果も、まずこの形にしてから揃える (種類の名前はライブラリのまま) */
export interface RawCode {
  format: string;
  text: string;
  points: Pt[];
}

/** 解析する画像と、その画像の座標をカメラ映像の座標に直す関数 */
export interface Source<T> {
  src: T;
  toVideo: (p: Pt) => Pt;
}

/** 1 回分の解析する画像。画像は要る時だけ作るので、関数で渡す */
export interface FrameSources {
  native: () => Source<ImageBitmapSource>;
  zxing: () => Source<ImageData>;
}

// ---------- zxing の Worker とのやりとり (要求には番号 id を付け、返事は同じ番号で返す) ----------

/** zxing-wasm の読み取りの指定 (使う項目だけ。組み立てるのは scanner.ts の zxingOptions) */
export interface ZxingOptions {
  /** zxing-wasm の名前 (FORMAT_INFO の zxing) */
  formats: string[];
  tryHarder: boolean;
  tryRotate: boolean;
  tryInvert: boolean;
  tryDownscale: boolean;
  maxNumberOfSymbols: number;
}

/** 画面 → Worker */
export type ToWorker = { id: number; type: 'config'; options: ZxingOptions } | { id: number; type: 'scan'; image: ImageData };

/** Worker → 画面 */
export type FromWorker = { id: number; type: 'ready' } | { id: number; type: 'result'; codes: RawCode[] } | { id: number; type: 'error'; message: string };
