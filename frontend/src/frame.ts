// 解析する画像を作る: 読む範囲 (中央の割合) と縮小に合わせて映像を切り出し、結果の座標をカメラ映像の座標に戻す。

import { centerRect, type Pt, type Rect, type Size } from './geometry';
import type { FrameSources } from './scanner/types';

export interface FramePlan {
  /** 映像の中の、解析する範囲 */
  crop: Rect;
  /** 解析する画像の大きさ */
  out: Size;
  /** 切り出しも縮小も無い (内蔵には映像をそのまま渡せる) */
  direct: boolean;
  /** 解析した画像の座標 → カメラ映像の座標 */
  toVideo: (p: Pt) => Pt;
}

/** 映像の大きさ・読む範囲 (1 = 全体)・縮小 (1 = 等倍) から、切り出し方を決める (純粋関数) */
export function planFrame(video: Size, roi: number, scale: number): FramePlan {
  const crop = centerRect(video, roi);
  const out = { w: Math.max(1, Math.round(crop.w * scale)), h: Math.max(1, Math.round(crop.h * scale)) };
  return {
    crop,
    out,
    direct: crop.w === video.w && crop.h === video.h && scale === 1,
    toVideo: ([x, y]) => [x / scale + crop.x, y / scale + crop.y],
  };
}

/** 映像を切り出す作業用の canvas を持ち、1 回分の解析する画像 (FrameSources) を作る */
export class FrameGrabber {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement = document.createElement('canvas')) {
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** 画像は要る時だけ、1 回だけ写す (内蔵だけで映像をそのまま渡せる時は写さない) */
  sources(video: HTMLVideoElement, plan: FramePlan): FrameSources {
    const { ctx } = this;
    const { crop, out, toVideo } = plan;
    let drawn = false;
    const draw = () => {
      if (drawn) return;
      if (ctx.canvas.width !== out.w) ctx.canvas.width = out.w;
      if (ctx.canvas.height !== out.h) ctx.canvas.height = out.h;
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, out.w, out.h);
      drawn = true;
    };
    return {
      native: () => {
        if (plan.direct) return { src: video, toVideo };
        draw();
        return { src: ctx.canvas, toVideo };
      },
      zxing: () => {
        draw();
        return { src: ctx.getImageData(0, 0, out.w, out.h), toVideo };
      },
    };
  }
}
