// Scanner のテスト。ブラウザの部品 (BarcodeDetector・Worker) の代わりに偽物を渡す
import { describe, expect, it } from 'vitest';
import type { Fmt } from '../formats';
import { Scanner, zxingOptions, type Detector, type ScannerDeps, type ZxingReader } from './scanner';
import type { FrameSources, RawCode } from './types';

const MAC_CHROME: Fmt[] = ['qr_code', 'ean_13', 'ean_8', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'data_matrix', 'pdf417', 'aztec']; // Codabar・UPC-A が無い

const frame: FrameSources = {
  native: () => ({ src: {} as ImageBitmapSource, toVideo: (p) => p }),
  zxing: () => ({ src: {} as ImageData, toVideo: (p) => p }),
};

function fakeDeps(supported: Fmt[], found: { native?: RawCode[]; zxing?: RawCode[] }) {
  const made = { zxing: 0, configs: [] as string[][] };
  const pending: (() => void)[] = []; // 終わっていない zxing の準備 (本物の Worker と同じく、順に終わらせる)
  const deps: ScannerDeps = {
    supportedFormats: async () => supported,
    createDetector: (): Detector => ({ detect: async () => found.native ?? [] }),
    createZxing: (): ZxingReader => {
      made.zxing++;
      return {
        configure: (o) => {
          made.configs.push(o.formats);
          return new Promise<void>((r) => void pending.push(r));
        },
        read: async () => found.zxing ?? [],
      };
    },
  };
  return { deps, made, release: () => pending.splice(0).forEach((r) => r()) };
}

describe('Scanner', () => {
  it('内蔵と zxing の結果をまとめて返す', async () => {
    const f = fakeDeps(MAC_CHROME, { native: [{ format: 'qr_code', text: 'Q', points: [] }], zxing: [{ format: 'Codabar', text: 'A1B', points: [] }] });
    const s = new Scanner(f.deps);
    const configured = s.configure(['qr_code', 'codabar'], 'auto', false);
    await Promise.resolve();
    f.release();
    await configured;
    expect(s.ready).toBe(true);
    expect((await s.scan(frame)).map((c) => `${c.engine}:${c.text}`)).toEqual(['native:Q', 'zxing:A1B']);
    expect(f.made.configs).toEqual([['Codabar']]);
  });
  it('準備が終わる前に設定し直したら、後の方だけを使う。zxing は 1 回だけ作る', async () => {
    const f = fakeDeps([], {});
    const s = new Scanner(f.deps);
    const first = s.configure(['qr_code'], 'auto', false);
    await new Promise((r) => setTimeout(r));
    const second = s.configure(['codabar'], 'auto', false);
    await new Promise((r) => setTimeout(r));
    f.release();
    expect(await second).toMatchObject({ zxing: ['codabar'] });
    expect(await first).toBeNull();
    expect(f.made.zxing).toBe(1);
    expect(s.plan?.zxing).toEqual(['codabar']);
  });
  it('読む種類が 0 なら読まない', async () => {
    const s = new Scanner(fakeDeps(MAC_CHROME, {}).deps);
    await s.configure([], 'auto', false);
    expect(s.ready).toBe(false);
    expect(await s.scan(frame)).toEqual([]);
  });
});

it('zxingOptions: 名前を zxing-wasm の名前にし、念入りに探す時は回転・白黒反転も探す', () => {
  expect(zxingOptions(['qr_code', 'ean_13'], false)).toMatchObject({ formats: ['QRCode', 'EAN13'], tryHarder: false, tryRotate: false, tryInvert: false });
  expect(zxingOptions(['qr_code'], true)).toMatchObject({ tryHarder: true, tryRotate: true, tryInvert: true });
});
