import { expect, it } from 'vitest';
import { History, REPEAT_MS } from './history';
import type { Code } from './scanner/types';

const code = (text: string, format: Code['format'] = 'qr_code'): Code => ({ format, text, points: [], engine: 'native' });

it('同じコードは 1 つにまとめ、続けて読んでいる間は知らせない', () => {
  const h = new History();
  expect(h.record(code('A'), 0)).toMatchObject({ fresh: true, entry: { count: 1 } });
  expect(h.record(code('A'), 1000)).toMatchObject({ fresh: false, entry: { count: 2 } });
  expect(h.record(code('A'), 1000 + REPEAT_MS + 1)).toMatchObject({ fresh: true, entry: { count: 3 } });
  h.record(code('A', 'ean_13'), 0); // 内容が同じでも、種類が違えば別のコード
  expect(h.size).toBe(2);
  h.clear();
  expect(h.size).toBe(0);
});
