// 読み取りに使うブラウザの部品 (BarcodeDetector と zxing の Worker) を、Scanner に渡す形にする。

import { FORMATS, type Fmt } from '../formats';
import type { Pt } from '../geometry';
import type { ScannerDeps } from './scanner';
import { ZxingClient, type WorkerPort } from './zxing-client';

let supported: Promise<Fmt[]> | null = null;

/** この環境の BarcodeDetector (ブラウザ内蔵) が読める種類 (無ければ空)。1 回だけ問い合わせる */
export function nativeFormats(): Promise<Fmt[]> {
  return (supported ??= (async () => {
    if (!('BarcodeDetector' in globalThis)) return [];
    try {
      const names = await BarcodeDetector.getSupportedFormats();
      return FORMATS.filter((f) => names.includes(f));
    } catch {
      return [];
    }
  })());
}

export function browserScannerDeps(): ScannerDeps {
  return {
    supportedFormats: nativeFormats,
    createDetector: (formats) => {
      const det = new BarcodeDetector({ formats });
      return {
        detect: async (image) =>
          (await det.detect(image)).map((b) => ({ format: b.format, text: b.rawValue, points: b.cornerPoints.map((p): Pt => [p.x, p.y]) })),
      };
    },
    createZxing: () => new ZxingClient(new Worker(new URL('./zxing.worker.ts', import.meta.url), { type: 'module' }) as WorkerPort),
  };
}
