// zxing の Worker とのやりとりの形。要求には番号 (id) を付け、返事は同じ番号で返す。

import type { RawCode } from './types';

export interface ZxingConfig {
  /** zxing-wasm の名前 (ZXING_NAME) */
  formats: string[];
  /** 念入りに探す (回転・白黒反転したコードも探す。約 10 倍遅い) */
  tryHarder: boolean;
}

/** 画面 → Worker */
export type ToWorker = { id: number; type: 'config'; config: ZxingConfig } | { id: number; type: 'scan'; image: ImageData };

/** Worker → 画面 */
export type FromWorker = { id: number; type: 'ready' } | { id: number; type: 'result'; codes: RawCode[] } | { id: number; type: 'error'; message: string };
