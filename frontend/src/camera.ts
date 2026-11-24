// カメラ: 開く・止める・ライト・この端末のカメラの一覧。

import type { Size } from './geometry';

/** どのカメラを、どの解像度で開くか (設定の res・camera) */
export interface CameraChoice {
  /** '1280x720' など */
  res: string;
  /** 'environment' (背面) | 'user' (前面) | deviceId */
  camera: string;
}
export interface CameraInfo {
  id: string;
  label: string;
}

const isFacing = (camera: string): camera is 'environment' | 'user' => camera === 'environment' || camera === 'user';

/** getUserMedia に渡す条件 (純粋関数) */
export function videoConstraints({ res, camera }: CameraChoice): MediaTrackConstraints {
  const [w, h] = res.split('x').map(Number);
  return { width: { ideal: w }, height: { ideal: h }, ...(isFacing(camera) ? { facingMode: { ideal: camera } } : { deviceId: { exact: camera } }) };
}

/** 覚えていたカメラ (deviceId) が無くなった時のエラーか */
export const isMissingDevice = (e: unknown, choice: CameraChoice) => (e as { name?: string } | null)?.name === 'OverconstrainedError' && !isFacing(choice.camera);

/** 以前このサイトにカメラを許可したか (許可を聞く画面を出さずに始められるか) */
export async function cameraPermitted(): Promise<boolean> {
  try {
    return (await navigator.permissions?.query({ name: 'camera' as PermissionName }))?.state === 'granted';
  } catch {
    return false; // 問い合わせできない環境では「カメラを開始」を押してもらう
  }
}

export class Camera {
  private stream: MediaStream | null = null;
  /** start・stop のたびに増やす番号。開いている途中で追い越されたかを見分ける (2 つのカメラが開いたままにならないように) */
  private generation = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly media: MediaDevices | undefined = navigator.mediaDevices,
  ) {}

  /** この画面でカメラを使えるか (http:// では使えない。localhost は例外) */
  get available(): boolean {
    return typeof this.media?.getUserMedia === 'function';
  }
  get running(): boolean {
    return this.stream !== null;
  }
  /** 映像の大きさ (まだ映っていなければ null) */
  get size(): Size | null {
    const { videoWidth: w, videoHeight: h } = this.video;
    return this.running && w && h ? { w, h } : null;
  }

  /**
   * 開く (開いていれば閉じてから)。開いたら true。
   * 開いている途中で、次の start か stop に追い越されたら、開いたカメラをすぐ閉じて false (呼んだ側は何もしなくてよい)。
   * 開けなければ getUserMedia のエラーを投げる。
   */
  async start(choice: CameraChoice): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    let stream: MediaStream;
    try {
      stream = await this.media!.getUserMedia({ video: videoConstraints(choice), audio: false });
    } catch (e) {
      if (generation !== this.generation) return false; // 追い越された後の失敗は、知らせない
      throw e;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    return true;
  }

  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private get track(): MediaStreamTrack | undefined {
    return this.stream?.getVideoTracks()[0];
  }

  /** ライトを使えるか (Android の背面カメラなど) */
  get hasTorch(): boolean {
    const caps = this.track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return !!caps?.torch;
  }

  async setTorch(on: boolean) {
    await this.track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  /** この端末のカメラ。label は、許可した後でないと空のことがある */
  async list(): Promise<CameraInfo[]> {
    const devices = (await this.media?.enumerateDevices()) ?? [];
    return devices.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d) => ({ id: d.deviceId, label: d.label }));
  }
}
