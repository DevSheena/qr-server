// どの種類を、内蔵 (BarcodeDetector) と zxing のどちらで読むかを決める (純粋関数)。
//
// 方式「自動」: 内蔵が読める種類は内蔵で、読めない種類 (例: Mac の Chrome の Codabar) だけを zxing で読む。
//   zxing は読む種類を絞るほど速いので、内蔵が読めない種類だけに絞って並べて走らせる。
// 内蔵が無い環境 (iPhone の Safari・Firefox など) では、方式によらず全部を zxing で読む。

import type { Fmt } from '../formats';

export type EngineMode = 'auto' | 'native' | 'zxing';
export const ENGINE_MODES: readonly EngineMode[] = ['auto', 'native', 'zxing'];

export interface EnginePlan {
  /** 内蔵で読む種類 */
  native: Fmt[];
  /** zxing で読む種類 */
  zxing: Fmt[];
  /** どちらでも読まない種類 (方式「内蔵だけ」で、内蔵が読めないもの) */
  unreadable: Fmt[];
  /** BarcodeDetector に渡す種類 (UPC-A を EAN-13 として読む時は ean_13 に置き換わる) */
  detectorFormats: Fmt[];
}

type Split = Pick<EnginePlan, 'native' | 'zxing' | 'unreadable'>;
/** 方式ごとの分け方。inNative = 内蔵が読める種類、notNative = 読めない種類 */
const SPLIT: Record<EngineMode, (want: Fmt[], inNative: Fmt[], notNative: Fmt[]) => Split> = {
  auto: (_, inNative, notNative) => ({ native: inNative, zxing: notNative, unreadable: [] }),
  native: (_, inNative, notNative) => ({ native: inNative, zxing: [], unreadable: notNative }),
  zxing: (want) => ({ native: [], zxing: want, unreadable: [] }),
};

/**
 * @param want 読む種類
 * @param supported この環境の内蔵が読める種類 (内蔵が無ければ空)
 */
export function planEngines(want: readonly Fmt[], supported: readonly Fmt[], mode: EngineMode): EnginePlan {
  // UPC-A: Mac の Chrome の内蔵は対応一覧に UPC-A を載せないが、UPC-A を「先頭に 0 を付けた EAN-13」として読む。
  // そういう環境では UPC-A を zxing に回さず、内蔵の EAN-13 で読んで UPC-A に直す (同じコードを 2 回読まない・zxing を走らせない)
  const upcViaEan = want.includes('upc_a') && !supported.includes('upc_a') && supported.includes('ean_13');
  const nativeCan = (f: Fmt) => supported.includes(f) || (f === 'upc_a' && upcViaEan);
  const effective: EngineMode = supported.length === 0 ? 'zxing' : mode;
  const split = SPLIT[effective]([...want], want.filter(nativeCan), want.filter((f) => !nativeCan(f)));
  const detectorFormats = [...new Set(split.native.map((f): Fmt => (f === 'upc_a' && upcViaEan ? 'ean_13' : f)))];
  return { ...split, detectorFormats };
}
