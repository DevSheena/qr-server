// zxing の Worker とのやりとり。要求ごとに番号を付け、返事をその要求の Promise に返す。

import type { FromWorker, ToWorker, ZxingConfig } from './zxing-protocol';
import type { RawCode } from './types';

/** Worker のうち、ここで使う部分 (テストでは偽物を渡す) */
export interface WorkerPort {
  postMessage(message: ToWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

type Request = ToWorker extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never;
type Reply<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;

export class ZxingClient {
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>();

  constructor(private readonly port: WorkerPort) {
    port.onmessage = (e) => this.settle(e.data);
    // Worker が落ちたら、待っている要求を全部失敗にする (読み取りの繰り返しが待ったまま止まらないように)
    port.onerror = (e) => this.failAll(new Error(`zxing の Worker が落ちた: ${e.message}`));
  }

  async configure(config: ZxingConfig): Promise<void> {
    await this.request({ type: 'config', config }, 'ready');
  }

  /** 読む。画像のメモリは Worker に渡す (コピーしない) ので、呼んだ後の image は使えない */
  async read(image: ImageData): Promise<RawCode[]> {
    return (await this.request({ type: 'scan', image }, 'result', [image.data.buffer])).codes;
  }

  private request<T extends 'ready' | 'result'>(msg: Request, expect: T, transfer: Transferable[] = []): Promise<Reply<T>> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (m) => (m.type === expect ? resolve(m as Reply<T>) : reject(new Error(m.type === 'error' ? m.message : `思っていない返事: ${m.type}`))),
        reject,
      });
      this.port.postMessage({ ...msg, id } as ToWorker, transfer);
    });
  }

  private settle(m: FromWorker) {
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    p.resolve(m);
  }

  private failAll(e: Error) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }
}
