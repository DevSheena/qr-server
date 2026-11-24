import { expect, it } from 'vitest';
import { ScanStats, shouldStart } from './scan-loop';

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
