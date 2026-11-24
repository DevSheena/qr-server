/// <reference lib="webworker" />
// zxing-wasm で読む Worker。画面の処理を止めないよう、メインスレッドの外で解読する。
// 読み取りの指定 (速さの調整) は scanner.ts の zxingOptions が組み立てて送ってくる。ここは受け取って読むだけ。
// WASM はこのアプリと一緒に配信したものを読む (zxing-wasm の既定は CDN から読むので差し替える)。

import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { Pt } from '../geometry';
import type { FromWorker, RawCode, ToWorker } from './types';

const ready = prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  fireImmediately: true,
});

const toRaw = (r: ReadResult): RawCode => {
  const p = r.position;
  return { format: r.format, text: r.text, points: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((q): Pt => [q.x, q.y]) };
};

let options: ReaderOptions = {};
const reply = (m: FromWorker) => postMessage(m);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    await ready;
    if (m.type === 'config') {
      options = m.options as ReaderOptions; // 種類の名前は zxing-wasm の名前 (FORMAT_INFO の zxing)
      reply({ id: m.id, type: 'ready' });
      return;
    }
    const found = await readBarcodes(m.image, options);
    reply({ id: m.id, type: 'result', codes: found.filter((r) => r.isValid).map(toRaw) });
  } catch (err) {
    reply({ id: m.id, type: 'error', message: String(err) });
  }
};
