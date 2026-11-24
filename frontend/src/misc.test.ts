// 小さな部品のテスト: 読んだ内容の記録・画面の文字・カメラの条件・読み取りの頻度
import { describe, expect, it } from 'vitest';
import { isMissingDevice, videoConstraints } from './camera';
import { History, REPEAT_MS } from './history';
import { planEngines } from './scanner/plan';
import type { Code } from './scanner/types';
import { ScanStats, shouldStart } from './scan-loop';
import { cameraErrorText, codeLabel, engineNote, engineSummary, isUrl, metaText } from './text';

const code = (text: string, format: Code['format'] = 'qr_code'): Code => ({ format, text, points: [], engine: 'native' });

describe('History', () => {
  it('同じコードは 1 つにまとめ、続けて読んでいる間は知らせない', () => {
    const h = new History();
    expect(h.record(code('A'), 0)).toMatchObject({ isNew: true, fresh: true });
    expect(h.record(code('A'), 1000)).toMatchObject({ isNew: false, fresh: false, entry: { count: 2 } });
    expect(h.record(code('A'), 1000 + REPEAT_MS + 1)).toMatchObject({ fresh: true, entry: { count: 3 } });
    h.record(code('A', 'ean_13'), 0);
    expect(h.size).toBe(2);
  });
});

describe('text', () => {
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
  it('方式の表示', () => {
    expect(engineSummary(planEngines(['qr_code', 'codabar'], ['qr_code'], 'auto'))).toBe('内蔵 + zxing (Codabar)');
    expect(engineSummary(planEngines(['qr_code'], [], 'auto'))).toBe('zxing');
    expect(engineSummary(null)).toBe('なし');
    expect(engineNote(planEngines(['codabar'], ['qr_code'], 'native'))).toEqual({ text: '読めない (内蔵が非対応): Codabar', warn: true });
  });
  it('カメラのエラーの説明', () => {
    expect(cameraErrorText({ name: 'NotFoundError' })).toBe('カメラが見つかりません');
    expect(cameraErrorText(new Error('x'))).toBe('Error: x');
  });
});

describe('camera', () => {
  it('背面・前面は向きで、個別のカメラは deviceId で開く', () => {
    expect(videoConstraints({ res: '1280x720', camera: 'environment' })).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'environment' } });
    expect(videoConstraints({ res: '640x480', camera: 'abc' })).toMatchObject({ deviceId: { exact: 'abc' } });
  });
  it('覚えていたカメラが無くなった時だけ、背面に戻す', () => {
    expect(isMissingDevice({ name: 'OverconstrainedError' }, { res: '', camera: 'abc' })).toBe(true);
    expect(isMissingDevice({ name: 'OverconstrainedError' }, { res: '', camera: 'user' })).toBe(false);
  });
});

describe('scan-loop', () => {
  it('頻度の上限', () => {
    expect(shouldStart(100, 99, 0)).toBe(true);
    expect(shouldStart(150, 100, 10)).toBe(false);
    expect(shouldStart(200, 100, 10)).toBe(true);
  });
  it('ScanStats は 1 秒ごとに回数/秒を出す', () => {
    const s = new ScanStats(0);
    expect(s.add(20, 500)).toBe(false);
    expect(s.add(30, 1000)).toBe(false);
    expect(s.add(10, 1250)).toBe(true);
    expect(s.rate).toBeCloseTo(3 / 1.25);
    expect(s.ms).toBeGreaterThan(10);
  });
});
