import { expect, it } from 'vitest';
import { planFrame } from './frame';

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
