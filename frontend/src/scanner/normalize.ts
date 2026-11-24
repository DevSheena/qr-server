// 読んだ結果を揃える (純粋関数): 種類の名前を FORMATS に揃え、UPC-A の表記を揃え、読む種類でないものを捨てる。

import { normFormat, type Fmt } from '../formats';
import type { Pt } from '../geometry';
import type { Code, Engine, RawCode } from './types';

/**
 * 1 つの結果の種類と内容を揃える。読む種類 want に入らないものは null (捨てる)。
 *
 * UPC-A は「先頭が 0 の EAN-13」と同じもので、BarcodeDetector (Mac) も、EAN-13 と UPC-A を両方読む設定の zxing も、
 * UPC-A を 13 桁の EAN-13 として返す。UPC-A を読む設定の時は、どちらから来ても 12 桁の UPC-A にする。
 */
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
