// ZxingClient のテスト。Worker の代わりに偽物を渡す
import { describe, expect, it } from 'vitest';
import { zxingOptions } from './scanner';
import type { FromWorker, ToWorker } from './types';
import { ZxingClient, type WorkerPort } from './zxing-client';

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
    const p = new ZxingClient(f.port).configure(zxingOptions(['qr_code'], false));
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
