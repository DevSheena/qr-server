// 内蔵 (BarcodeDetector) と zxing の使い分けの決まり (純粋関数):
//   planEngines … どの種類を、どちらで読むか
//   toCodes     … 読んだ結果を揃える (種類の名前・UPC-A の表記・読まない種類を捨てる)
//
// 方式「自動」: 内蔵が読める種類は内蔵で、読めない種類 (例: Mac の Chrome の Codabar) だけを zxing で読む。
//   zxing は読む種類を絞るほど速いので、内蔵が読めない種類だけに絞って並べて走らせる。
// 内蔵が無い環境 (iPhone の Safari・Firefox など) では、方式によらず全部を zxing で読む。
//
// UPC-A は「先頭が 0 の 13 桁の EAN-13」と同じもの。Mac の Chrome の内蔵は対応一覧に UPC-A を載せないが EAN-13 として読み、
// zxing も EAN-13 と UPC-A を両方読む設定では EAN-13 として返す。そこで:
//   planEngines … UPC-A を zxing に回さず、内蔵の EAN-13 で読む (同じコードを 2 回読まない・zxing を走らせない)
//   toCodes     … UPC-A を読む設定の時は、どちらから来ても 12 桁の UPC-A に直す

import { normFormat, type Fmt } from '../formats';
import type { Pt } from '../geometry';
import type { Code, Engine, RawCode } from './types';

export type EngineMode = 'auto' | 'native' | 'zxing';

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
  const upcViaEan = want.includes('upc_a') && !supported.includes('upc_a') && supported.includes('ean_13');
  const nativeCan = (f: Fmt) => supported.includes(f) || (f === 'upc_a' && upcViaEan);
  const effective: EngineMode = supported.length === 0 ? 'zxing' : mode;
  const split = SPLIT[effective]([...want], want.filter(nativeCan), want.filter((f) => !nativeCan(f)));
  const detectorFormats = [...new Set(split.native.map((f): Fmt => (f === 'upc_a' && upcViaEan ? 'ean_13' : f)))];
  return { ...split, detectorFormats };
}

/** 1 つの結果の種類と内容を揃える。読む種類 want に入らないものは null (捨てる) */
export function normalizeCode(format: string, text: string, want: readonly Fmt[]): { format: Fmt; text: string } | null {
  const f = normFormat(format);
  if (!f) return null;
  const upcAsEan = (f === 'ean_13' || f === 'upc_a') && text.length === 13 && text[0] === '0';
  if (upcAsEan && want.includes('upc_a')) return { format: 'upc_a', text: text.slice(1) };
  // UPC-A のためだけに EAN-13 を読んでいる時の、本物の EAN-13 はここで捨てる
  return want.includes(f) ? { format: f, text } : null;
}

/** ライブラリの結果をまとめて Code に直す。座標は toVideo でカメラ映像の画素に直す */
export function toCodes(raw: readonly RawCode[], toVideo: (p: Pt) => Pt, engine: Engine, want: readonly Fmt[]): Code[] {
  return raw.flatMap((r) => {
    const n = normalizeCode(r.format, r.text, want);
    return n ? [{ ...n, points: r.points.map(toVideo), engine }] : [];
  });
}
