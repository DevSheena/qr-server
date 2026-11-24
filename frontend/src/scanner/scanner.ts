// 読み取りの中心: 読む種類と方式から振り分け (engines.ts) を決め、内蔵と zxing を並べて走らせ、結果を揃える。
// ブラウザの部品 (BarcodeDetector・Worker) は外から渡す (browser.ts)。テストでは偽物を渡す。

import { FORMAT_INFO, type Fmt } from '../formats';
import { planEngines, toCodes, type EngineMode, type EnginePlan } from './engines';
import type { Code, FrameSources, RawCode, ZxingOptions } from './types';

/**
 * zxing の読み取りの指定 (速さの調整)。設定の画面に出ない細かい値はここで変える。
 * @param tryHarder 念入りに探す (設定の「念入りに探す」): 回転・白黒反転したコードも探す。遅くなる
 */
export const zxingOptions = (formats: readonly Fmt[], tryHarder: boolean): ZxingOptions => ({
  formats: formats.map((f) => FORMAT_INFO[f].zxing),
  tryHarder,
  tryRotate: tryHarder,
  tryInvert: tryHarder,
  tryDownscale: true, // 大きい画像は、縮めた画像でも探す
  maxNumberOfSymbols: 8, // 1 回に読むコードの数の上限
});

/** 内蔵の読み取り (BarcodeDetector を包んだもの) */
export interface Detector {
  detect(image: ImageBitmapSource): Promise<RawCode[]>;
}
/** zxing の読み取り (Worker を包んだもの) */
export interface ZxingReader {
  configure(options: ZxingOptions): Promise<void>;
  read(image: ImageData): Promise<RawCode[]>;
}
export interface ScannerDeps {
  /** この環境の内蔵が読める種類 (内蔵が無ければ空) */
  supportedFormats: () => Promise<Fmt[]>;
  createDetector: (formats: Fmt[]) => Detector;
  /** zxing は要る時に 1 回だけ作り、使い回す (WASM の読み込みが重いので) */
  createZxing: () => ZxingReader;
}

interface Active {
  want: readonly Fmt[];
  plan: EnginePlan;
  detector: Detector | null;
  zxing: ZxingReader | null;
}

export class Scanner {
  private active: Active | null = null;
  private zxing: ZxingReader | null = null;
  private generation = 0;

  constructor(private readonly deps: ScannerDeps) {}

  /** 今の振り分け (準備中は null) */
  get plan(): EnginePlan | null {
    return this.active?.plan ?? null;
  }
  /** 読める状態か (準備中・読む種類が 0 の時は false) */
  get ready(): boolean {
    return !!(this.active && (this.active.detector || this.active.zxing));
  }

  /**
   * 読む種類と方式を決める。準備の間は読まない。
   * 準備が終わる前に次の configure が呼ばれたら、後の方だけを使う。戻り値は使い始めた振り分け (後の方に負けたら null)
   */
  async configure(want: readonly Fmt[], mode: EngineMode, tryHarder: boolean): Promise<EnginePlan | null> {
    const generation = ++this.generation;
    this.active = null;
    const plan = planEngines(want, await this.deps.supportedFormats(), mode);
    const detector = plan.detectorFormats.length ? this.deps.createDetector(plan.detectorFormats) : null;
    const zxing = plan.zxing.length ? (this.zxing ??= this.deps.createZxing()) : null;
    if (zxing) await zxing.configure(zxingOptions(plan.zxing, tryHarder));
    if (generation !== this.generation) return null;
    this.active = { want: [...want], plan, detector, zxing };
    return plan;
  }

  /** 1 回読む。内蔵と zxing は並べて走らせる */
  async scan(frame: FrameSources): Promise<Code[]> {
    const a = this.active;
    if (!a) return [];
    const jobs: Promise<Code[]>[] = [];
    if (a.detector) {
      const s = frame.native();
      jobs.push(a.detector.detect(s.src).then((raw) => toCodes(raw, s.toVideo, 'native', a.want)));
    }
    if (a.zxing) {
      const s = frame.zxing();
      jobs.push(a.zxing.read(s.src).then((raw) => toCodes(raw, s.toVideo, 'zxing', a.want)));
    }
    return (await Promise.all(jobs)).flat();
  }
}
