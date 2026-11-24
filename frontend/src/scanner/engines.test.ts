import { describe, expect, it } from 'vitest';
import type { Fmt } from '../formats';
import type { Pt } from '../geometry';
import { normalizeCode, planEngines, toCodes } from './engines';
import type { RawCode } from './types';

const RETAIL: Fmt[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const MAC_CHROME: Fmt[] = ['qr_code', 'ean_13', 'ean_8', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'data_matrix', 'pdf417', 'aztec']; // Codabar・UPC-A が無い

describe('planEngines', () => {
  it('自動: 内蔵が読めない種類だけ zxing', () => {
    const p = planEngines(['qr_code', 'codabar'], MAC_CHROME, 'auto');
    expect(p).toMatchObject({ native: ['qr_code'], zxing: ['codabar'], unreadable: [] });
  });
  it('UPC-A は内蔵の EAN-13 で読む (zxing に回さない)', () => {
    const p = planEngines(RETAIL, MAC_CHROME, 'auto');
    expect(p.zxing).toEqual([]);
    expect(p.native).toContain('upc_a');
    expect(p.detectorFormats).not.toContain('upc_a');
    expect(p.detectorFormats.filter((f) => f === 'ean_13')).toHaveLength(1);
  });
  it('内蔵だけ: 読めない種類は unreadable', () => {
    expect(planEngines(['qr_code', 'codabar'], MAC_CHROME, 'native')).toMatchObject({ native: ['qr_code'], zxing: [], unreadable: ['codabar'] });
  });
  it('内蔵が無い環境では、方式によらず全部 zxing', () => {
    expect(planEngines(['qr_code'], [], 'native')).toMatchObject({ native: [], zxing: ['qr_code'], detectorFormats: [] });
  });
});

describe('normalizeCode', () => {
  it('UPC-A を読む時は、13 桁の EAN-13 (先頭 0) を 12 桁の UPC-A にする', () => {
    expect(normalizeCode('ean_13', '0012345678905', RETAIL)).toEqual({ format: 'upc_a', text: '012345678905' });
    expect(normalizeCode('UPC-A', '0012345678905', RETAIL)).toEqual({ format: 'upc_a', text: '012345678905' });
  });
  it('UPC-A のためだけに EAN-13 を読んでいる時、本物の EAN-13 は捨てる', () => {
    expect(normalizeCode('ean_13', '4901234567894', ['upc_a'])).toBeNull();
  });
  it('読む種類でないもの・知らない種類は捨てる', () => {
    expect(normalizeCode('codabar', 'A123B', ['qr_code'])).toBeNull();
    expect(normalizeCode('MicroQRCode', 'x', ['qr_code'])).toBeNull();
  });
});

it('toCodes は座標をカメラ映像の座標に直す', () => {
  const raw: RawCode[] = [{ format: 'QRCode', text: 'hi', points: [[1, 2]] }];
  expect(toCodes(raw, ([x, y]): Pt => [x * 2, y * 2], 'zxing', ['qr_code'])).toEqual([{ format: 'qr_code', text: 'hi', points: [[2, 4]], engine: 'zxing' }]);
});
