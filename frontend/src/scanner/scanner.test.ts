import { describe, expect, it } from 'vitest';
import type { Fmt } from '../formats';
import type { Pt } from '../geometry';
import { normalizeCode, toCodes } from './normalize';
import { planEngines } from './plan';
import { Scanner, type Detector, type ScannerDeps, type ZxingReader } from './scanner';
import type { FrameSources, RawCode } from './types';
import { ZxingClient, type WorkerPort } from './zxing-client';
import type { FromWorker, ToWorker } from './zxing-protocol';

const RETAIL: Fmt[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const MAC_CHROME: Fmt[] = ['qr_code', 'ean_13', 'ean_8', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'data_matrix', 'pdf417', 'aztec']; // Codabar・UPC-A が無い

describe('planEngines', () => {
  it('自動: 内蔵が読めない種類だけ zxing', () => {
    const p = planEngines(['qr_code', 'codabar'], MAC_CHROME, 'auto');
    expect(p).toMatchObject({ native: ['qr_code'], zxing: ['codabar'], unreadable: [] });
  });
  it('UPC-A は内蔵の EAN-13 で読む (zxing に回さない)', () => {
    const p = planEngines(RETAIL, MAC_CHROME, 'auto');
    expect(p.zxing).toEqual([]);
    expect(p.native).toContain('upc_a');
    expect(p.detectorFormats).not.toContain('upc_a');
    expect(p.detectorFormats.filter((f) => f === 'ean_13')).toHaveLength(1);
  });
  it('内蔵だけ: 読めない種類は unreadable', () => {
    expect(planEngines(['qr_code', 'codabar'], MAC_CHROME, 'native')).toMatchObject({ native: ['qr_code'], zxing: [], unreadable: ['codabar'] });
  });
  it('内蔵が無い環境では、方式によらず全部 zxing', () => {
    expect(planEngines(['qr_code'], [], 'native')).toMatchObject({ native: [], zxing: ['qr_code'], detectorFormats: [] });
  });
});

describe('normalizeCode', () => {
  it('UPC-A を読む時は、13 桁の EAN-13 (先頭 0) を 12 桁の UPC-A にする', () => {
    expect(normalizeCode('ean_13', '0012345678905', RETAIL)).toEqual({ format: 'upc_a', text: '012345678905' });
    expect(normalizeCode('UPC-A', '0012345678905', RETAIL)).toEqual({ format: 'upc_a', text: '012345678905' });
  });
  it('UPC-A のためだけに EAN-13 を読んでいる時、本物の EAN-13 は捨てる', () => {
    expect(normalizeCode('ean_13', '4901234567894', ['upc_a'])).toBeNull();
  });
  it('読む種類でないもの・知らない種類は捨てる', () => {
    expect(normalizeCode('codabar', 'A123B', ['qr_code'])).toBeNull();
    expect(normalizeCode('MicroQRCode', 'x', ['qr_code'])).toBeNull();
  });
  it('toCodes は座標をカメラ映像の座標に直す', () => {
    const raw: RawCode[] = [{ format: 'QRCode', text: 'hi', points: [[1, 2]] }];
    expect(toCodes(raw, ([x, y]): Pt => [x * 2, y * 2], 'zxing', ['qr_code'])).toEqual([{ format: 'qr_code', text: 'hi', points: [[2, 4]], engine: 'zxing' }]);
  });
});

// ---------- Scanner (ブラウザの部品の代わりに偽物を渡す) ----------
const frame: FrameSources = {
  native: () => ({ src: {} as ImageBitmapSource, toVideo: (p) => p }),
  zxing: () => ({ src: {} as ImageData, toVideo: (p) => p }),
};
function fakeDeps(supported: Fmt[], found: { native?: RawCode[]; zxing?: RawCode[] }) {
  const made = { detectors: [] as Fmt[][], zxing: 0, configs: [] as string[][] };
  const pending: (() => void)[] = []; // 終わっていない zxing の準備 (本物の Worker と同じく、順に終わらせる)
  const deps: ScannerDeps = {
    supportedFormats: async () => supported,
    createDetector: (formats): Detector => {
      made.detectors.push(formats);
      return { detect: async () => found.native ?? [] };
    },
    createZxing: (): ZxingReader => {
      made.zxing++;
      return {
        configure: (c) => {
          made.configs.push(c.formats);
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

// ---------- ZxingClient (Worker の代わりに偽物を渡す) ----------
function fakePort() {
  const sent: ToWorker[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null, onerror: null };
  const reply = (m: FromWorker) => port.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  return { port, sent, reply };
}

describe('ZxingClient', () => {
  const image = { data: { buffer: new ArrayBuffer(0) } } as unknown as ImageData;
  it('返事を同じ番号の要求に返す (順番が入れ替わっても)', async () => {
    const f = fakePort();
    const c = new ZxingClient(f.port);
    const a = c.read(image);
    const b = c.read(image);
    f.reply({ id: f.sent[1].id, type: 'result', codes: [{ format: 'QRCode', text: 'B', points: [] }] });
    f.reply({ id: f.sent[0].id, type: 'result', codes: [{ format: 'QRCode', text: 'A', points: [] }] });
    expect((await a)[0].text).toBe('A');
    expect((await b)[0].text).toBe('B');
  });
  it('エラーの返事は失敗にする', async () => {
    const f = fakePort();
    const p = new ZxingClient(f.port).configure({ formats: ['QRCode'], tryHarder: false });
    f.reply({ id: f.sent[0].id, type: 'error', message: 'だめ' });
    await expect(p).rejects.toThrow('だめ');
  });
  it('Worker が落ちたら、待っている要求を全部失敗にする', async () => {
    const f = fakePort();
    const p = new ZxingClient(f.port).read(image);
    f.port.onerror?.({ message: 'crash' } as ErrorEvent);
    await expect(p).rejects.toThrow('crash');
  });
});
