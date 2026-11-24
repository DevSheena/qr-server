import { describe, expect, it } from 'vitest';
import { FORMATS, FORMAT_INFO, PRESETS, formatNames, normFormat, presetFor } from './formats';

describe('normFormat', () => {
  it('BarcodeDetector の名前も zxing-wasm の名前も同じ種類に直す', () => {
    for (const f of FORMATS) {
      expect(normFormat(f)).toBe(f);
      expect(normFormat(FORMAT_INFO[f].zxing)).toBe(f);
    }
    expect(normFormat('EAN-13')).toBe('ean_13');
    expect(normFormat('UPC-A')).toBe('upc_a');
  });
  it('知らない種類は null', () => {
    expect(normFormat('MicroQRCode')).toBeNull();
  });
});

describe('presetFor', () => {
  it('並びが違っても同じ組み合わせならそのプリセット', () => {
    expect(presetFor(['upc_e', 'ean_13', 'upc_a', 'ean_8'])?.id).toBe('retail');
  });
  it('どれとも違えば undefined', () => {
    expect(presetFor(['qr_code', 'codabar'])).toBeUndefined();
  });
  it('プリセットの id は重ならない', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

it('formatNames は括弧の中を省く', () => {
  expect(formatNames(['ean_13', 'codabar', 'qr_code'])).toBe('EAN-13, Codabar, QR');
});
