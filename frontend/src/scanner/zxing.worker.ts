/// <reference lib="webworker" />
// zxing-wasm で読む Worker。画面の処理を止めないよう、メインスレッドの外で解読する。
// WASM はこのアプリと一緒に配信したものを読む (zxing-wasm の既定は CDN から読むので差し替える)。

import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { Pt } from '../geometry';
import type { RawCode } from './types';
import type { FromWorker, ToWorker, ZxingConfig } from './zxing-protocol';

const ready = prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  fireImmediately: true,
});

/** 設定を zxing-wasm の読み取りの指定に直す */
const readerOptions = (c: ZxingConfig): ReaderOptions => ({
  formats: c.formats as ReaderOptions['formats'],
  // 念入りに探す: 回転・白黒反転したコードも探す。ライブでは切ると約 10 倍速い (読める割合は少し下がる)
  tryHarder: c.tryHarder,
  tryRotate: c.tryHarder,
  tryInvert: c.tryHarder,
  tryDownscale: true,
  maxNumberOfSymbols: 8,
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
      options = readerOptions(m.config);
      reply({ id: m.id, type: 'ready' });
      return;
    }
    const found = await readBarcodes(m.image, options);
    reply({ id: m.id, type: 'result', codes: found.filter((r) => r.isValid).map(toRaw) });
  } catch (err) {
    reply({ id: m.id, type: 'error', message: String(err) });
  }
};
