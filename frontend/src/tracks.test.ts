import { describe, expect, it } from 'vitest';
import type { Pt } from './geometry';
import type { Code } from './scanner/types';
import { INITIAL_TIMING, TRACKING, Tracker, fadeAlpha, maxAhead, nextTiming, nextTracks, predictedCorners } from './tracks';

const square = (x: number, y = 0, s = 100): Pt[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];
const qr = (x: number, text = 'A'): Code => ({ format: 'qr_code', text, points: square(x), engine: 'native' });

describe('nextTracks', () => {
  it('初めてのコードは速さ 0', () => {
    const { tracks, gaps } = nextTracks([], [qr(0)], 100);
    expect(tracks[0].vel.every(([vx, vy]) => vx === 0 && vy === 0)).toBe(true);
    expect(gaps).toEqual([]);
  });
  it('同じコードの続けての結果から速さを求める (前の速さと混ぜる)', () => {
    const a = nextTracks([], [qr(0)], 100).tracks;
    const { tracks, gaps } = nextTracks(a, [qr(10)], 110); // 10 ms で 10 px → 1 px/ms
    expect(gaps).toEqual([10]);
    expect(tracks[0].vel[0][0]).toBeCloseTo(1 - TRACKING.velocityKeep);
  });
  it('間が空きすぎたら速さを 0 からやり直す', () => {
    const a = nextTracks([], [qr(0)], 0).tracks;
    const { tracks, gaps } = nextTracks(a, [qr(50)], TRACKING.velocityGapMs + 1);
    expect(tracks[0].vel[0]).toEqual([0, 0]);
    expect(gaps).toEqual([]);
  });
  it('今回読めなかったコードの枠も残す', () => {
    const a = nextTracks([], [qr(0, 'A'), qr(200, 'B')], 0).tracks;
    const { tracks } = nextTracks(a, [qr(5, 'A')], 10);
    expect(tracks.map((t) => t.code.text).sort()).toEqual(['A', 'B']);
  });
  it('同じ画面に同じコードが 2 つあれば、前の枠と結び付けるのは 1 つ目だけ', () => {
    const a = nextTracks([], [qr(0)], 0).tracks;
    const { tracks, gaps } = nextTracks(a, [qr(10), qr(500)], 10);
    expect(tracks).toHaveLength(2);
    expect(gaps).toEqual([10]);
    expect(tracks[1].vel[0]).toEqual([0, 0]);
  });
});

describe('先読み', () => {
  it('maxAhead は下限と上限の間に収まる', () => {
    expect(maxAhead({ lat: 0, gap: 0 })).toBe(TRACKING.aheadMinMs);
    expect(maxAhead({ lat: 1000, gap: 1000 })).toBe(TRACKING.aheadMaxMs);
    expect(maxAhead({ lat: 30, gap: 50 })).toBe(90);
  });
  it('速さ × 経った時間だけ進め、最大の時間で止める', () => {
    const t = { key: 'k', code: qr(0), pts: square(0), vel: square(0).map((): Pt => [1, 0]), t: 100 };
    expect(predictedCorners(t, 130, 50)[0]).toEqual([30, 0]);
    expect(predictedCorners(t, 500, 50)[0]).toEqual([50, 0]);
    expect(predictedCorners(t, 500, 0)[0]).toEqual([0, 0]);
  });
  it('nextTiming はならした値にする', () => {
    const t = nextTiming(INITIAL_TIMING, 80, [20, 20]);
    expect(t.lat).toBeGreaterThan(INITIAL_TIMING.lat);
    expect(t.gap).toBeLessThan(INITIAL_TIMING.gap);
  });
  it('fadeAlpha は消える直前の fadeMs で薄くなる', () => {
    expect(fadeAlpha(0)).toBe(1);
    expect(fadeAlpha(TRACKING.holdMs - TRACKING.fadeMs / 2)).toBeCloseTo(0.5);
    expect(fadeAlpha(TRACKING.holdMs + 1)).toBe(0);
  });
});

describe('Tracker', () => {
  it('古くなった枠は出さない', () => {
    const tr = new Tracker();
    tr.update([qr(0)], 0, 10);
    expect(tr.boxes(TRACKING.holdMs, true)).toHaveLength(1);
    expect(tr.boxes(TRACKING.holdMs + 1, true)).toHaveLength(0);
  });
  it('先読みを切ると、読めた位置にそのまま描く', () => {
    const tr = new Tracker();
    tr.update([qr(0)], 0, 10);
    tr.update([qr(10)], 10, 20);
    expect(tr.boxes(40, false)[0].pts[0]).toEqual([10, 0]);
    expect(tr.boxes(40, true)[0].pts[0][0]).toBeGreaterThan(10);
  });
});
