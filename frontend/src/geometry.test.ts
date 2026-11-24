import { describe, expect, it } from 'vitest';
import { centerRect, coverTransform, rectCorners } from './geometry';
import { planFrame } from './frame';

describe('centerRect', () => {
  it('中央の 60%', () => {
    expect(centerRect({ w: 1280, h: 720 }, 0.6)).toEqual({ x: 256, y: 144, w: 768, h: 432 });
  });
  it('1 は全体', () => {
    expect(centerRect({ w: 640, h: 480 }, 1)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });
});

it('rectCorners は左上から時計回り', () => {
  expect(rectCorners({ x: 1, y: 2, w: 3, h: 4 })).toEqual([
    [1, 2],
    [4, 2],
    [4, 6],
    [1, 6],
  ]);
});

describe('coverTransform', () => {
  // 横長の映像 (1280×720) を縦長の画面 (360×640) に cover で出すと、高さで合わせて左右が切れる
  const view = { w: 360, h: 640 };
  const video = { w: 1280, h: 720 };
  it('映像の中心は画面の中心', () => {
    expect(coverTransform(view, video, false)([640, 360])).toEqual([180, 320]);
  });
  it('高さに合わせて拡大し、左右を同じだけ切る', () => {
    const k = 640 / 720;
    const [x, y] = coverTransform(view, video, false)([0, 720]);
    expect(y).toBeCloseTo(640);
    expect(x).toBeCloseTo((360 - 1280 * k) / 2);
  });
  it('左右反転すると、画面の中心を軸に x が入れ替わる', () => {
    const plain = coverTransform(view, video, false)([700, 100]);
    const mirrored = coverTransform(view, video, true)([700, 100]);
    expect(mirrored[0]).toBeCloseTo(360 - plain[0]);
    expect(mirrored[1]).toBeCloseTo(plain[1]);
  });
});

describe('planFrame', () => {
  it('範囲も縮小も無ければ、映像をそのまま使う', () => {
    const p = planFrame({ w: 1280, h: 720 }, 1, 1);
    expect(p.direct).toBe(true);
    expect(p.toVideo([10, 20])).toEqual([10, 20]);
  });
  it('切り出して縮小した画像の座標を、映像の座標に戻す', () => {
    const p = planFrame({ w: 1280, h: 720 }, 0.6, 0.5);
    expect(p.direct).toBe(false);
    expect(p.out).toEqual({ w: 384, h: 216 });
    expect(p.toVideo([0, 0])).toEqual([256, 144]);
    expect(p.toVideo([384, 216])).toEqual([256 + 768, 144 + 432]);
  });
});
