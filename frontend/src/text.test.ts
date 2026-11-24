import { describe, expect, it } from 'vitest';
import { planEngines } from './scanner/engines';
import type { Code } from './scanner/types';
import { cameraErrorText, codeLabel, engineNote, engineSummary, formatsNote, isUrl, metaText } from './text';

const code = (text: string): Code => ({ format: 'qr_code', text, points: [], engine: 'native' });

it('URL かどうか (http と https だけ)', () => {
  expect(isUrl('https://example.com/a?b=1')).toBe(true);
  expect(isUrl('javascript:alert(1)')).toBe(false);
  expect(isUrl('https://example.com/a b')).toBe(false);
});

it('名札は長い内容を省く', () => {
  expect(codeLabel(code('x'.repeat(40)))).toBe(`QR: ${'x'.repeat(32)}…`);
});

it('説明は 2 回目から回数を付ける', () => {
  expect(metaText(code('A'), 1, '12:00')).toBe('QR · 12:00 · 内蔵');
  expect(metaText(code('A'), 3, '12:00')).toBe('QR · 12:00 · 内蔵 · 3 回');
});

describe('方式の表示', () => {
  it('状態の表示', () => {
    expect(engineSummary(planEngines(['qr_code', 'codabar'], ['qr_code'], 'auto'))).toBe('内蔵 + zxing (Codabar)');
    expect(engineSummary(planEngines(['qr_code'], [], 'auto'))).toBe('zxing');
    expect(engineSummary(null)).toBe('なし');
  });
  it('設定の説明 (読めない種類があれば注意の色)', () => {
    expect(engineNote(planEngines(['codabar'], ['qr_code'], 'native'))).toEqual({ text: '読めない (内蔵が非対応): Codabar', warn: true });
    expect(formatsNote(0).warn).toBe(true);
  });
});

it('カメラのエラーの説明', () => {
  expect(cameraErrorText({ name: 'NotFoundError' })).toBe('カメラが見つかりません');
  expect(cameraErrorText(new Error('x'))).toBe('Error: x');
});
