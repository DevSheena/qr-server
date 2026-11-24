import { describe, expect, it } from 'vitest';
import { Camera, isMissingDevice, videoConstraints } from './camera';

it('背面・前面は向きで、個別のカメラは deviceId で開く', () => {
  expect(videoConstraints({ res: '1280x720', camera: 'environment' })).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'environment' } });
  expect(videoConstraints({ res: '640x480', camera: 'abc' })).toMatchObject({ deviceId: { exact: 'abc' } });
});

it('覚えていたカメラが無くなった時だけ、背面に戻す', () => {
  expect(isMissingDevice({ name: 'OverconstrainedError' }, { res: '', camera: 'abc' })).toBe(true);
  expect(isMissingDevice({ name: 'OverconstrainedError' }, { res: '', camera: 'user' })).toBe(false);
});

// ---------- 開いている途中で追い越された時 (ブラウザのカメラと video の代わりに偽物を渡す) ----------
function fakes() {
  const streams: { id: number; stopped: boolean }[] = [];
  const pending: (() => void)[] = [];
  const media = {
    getUserMedia: () =>
      new Promise<MediaStream>((resolve) => {
        const s = { id: streams.length, stopped: false };
        streams.push(s);
        const stream = { getTracks: () => [{ stop: () => (s.stopped = true) }] } as unknown as MediaStream;
        pending.push(() => resolve(stream));
      }),
  } as unknown as MediaDevices;
  const video = { srcObject: null, play: async () => {}, videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement;
  return { camera: new Camera(video, media), streams, finish: (i: number) => pending[i]() };
}

describe('Camera.start', () => {
  it('続けて 2 回開くと、先の方は閉じて false (カメラが 2 つ開いたままにならない)', async () => {
    const f = fakes();
    const first = f.camera.start({ res: '640x480', camera: 'environment' });
    const second = f.camera.start({ res: '1280x720', camera: 'environment' });
    f.finish(1);
    f.finish(0);
    expect(await second).toBe(true);
    expect(await first).toBe(false);
    expect(f.streams.map((s) => s.stopped)).toEqual([true, false]);
    expect(f.camera.running).toBe(true);
  });
  it('開いている途中で止めたら、開いたカメラはすぐ閉じる', async () => {
    const f = fakes();
    const opening = f.camera.start({ res: '640x480', camera: 'environment' });
    f.camera.stop();
    f.finish(0);
    expect(await opening).toBe(false);
    expect(f.streams[0].stopped).toBe(true);
    expect(f.camera.running).toBe(false);
  });
});
