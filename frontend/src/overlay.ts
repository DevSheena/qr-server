// カメラの上の描画: 解析する範囲 (外側を暗くし、黄色の破線で囲む) と、読めたコードの枠と名札。
// 何を描くか (OverlayScene) は呼ぶ側が決め、ここは描くだけ。

import { coverTransform, rectCorners, type Pt, type Rect, type Size } from './geometry';

export interface OverlayBox {
  /** 四隅 (カメラ映像の画素) */
  pts: Pt[];
  label: string;
  alpha: number;
}
export interface OverlayScene {
  /** カメラ映像の大きさ */
  video: Size;
  mirror: boolean;
  /** 解析する範囲 (全体なら null) */
  roi: Rect | null;
  boxes: readonly OverlayBox[];
}

const COLOR = {
  box: '#22ff88',
  roi: '#ffd400',
  /** 明るい背景でも見えるよう、線の下に敷く黒い縁 */
  edge: 'rgba(0,0,0,0.85)',
  shade: 'rgba(0,0,0,0.4)',
  tag: 'rgba(0,0,0,0.75)',
} as const;

interface LineStyle {
  color: string;
  width: number;
  dash?: number[];
}

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 描き直す。scene が null なら消すだけ */
  draw(scene: OverlayScene | null) {
    const view = this.fit();
    this.ctx.clearRect(0, 0, view.w, view.h);
    if (!scene) return;
    // 映像は画面いっぱいに切り取って表示している (object-fit: cover) ので、それに合わせて写す
    const toView = coverTransform(view, scene.video, scene.mirror);
    if (scene.roi) this.drawRoi(rectCorners(scene.roi).map(toView), view);
    this.ctx.font = `600 ${13 * this.dpr}px system-ui, sans-serif`;
    for (const b of scene.boxes) {
      this.ctx.globalAlpha = b.alpha;
      const pts = b.pts.map(toView);
      this.stroke(pts, { color: COLOR.box, width: 4 });
      this.drawTag(pts, b.label, view);
    }
    this.ctx.globalAlpha = 1;
  }

  /** canvas の画素数を、表示の大きさ × 画面の倍率に合わせる */
  private fit(): Size {
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    return { w, h };
  }

  private path(pts: readonly Pt[]) {
    pts.forEach(([x, y], i) => (i ? this.ctx.lineTo(x, y) : this.ctx.moveTo(x, y)));
    this.ctx.closePath();
  }

  private stroke(pts: readonly Pt[], { color, width, dash = [] }: LineStyle) {
    const { ctx, dpr } = this;
    ctx.beginPath();
    this.path(pts);
    ctx.setLineDash(dash.map((d) => d * dpr));
    ctx.lineJoin = 'round';
    for (const [c, w] of [[COLOR.edge, width + 3] as const, [color, width] as const]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w * dpr;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawRoi(box: Pt[], view: Size) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    this.path(box);
    ctx.fillStyle = COLOR.shade;
    ctx.fill('evenodd');
    this.stroke(box, { color: COLOR.roi, width: 2, dash: [10, 6] });
  }

  /** 枠の左上の少し上に名札を出す (画面からはみ出さないように寄せる) */
  private drawTag(pts: readonly Pt[], label: string, view: Size) {
    const { ctx, dpr } = this;
    const tw = ctx.measureText(label).width;
    const x = Math.max(4 * dpr, Math.min(Math.min(...pts.map((p) => p[0])), view.w - tw - 12 * dpr));
    const y = Math.max(20 * dpr, Math.min(...pts.map((p) => p[1])) - 8 * dpr);
    ctx.fillStyle = COLOR.tag;
    ctx.fillRect(x - 4 * dpr, y - 16 * dpr, tw + 8 * dpr, 21 * dpr);
    ctx.fillStyle = COLOR.box;
    ctx.fillText(label, x, y);
  }
}
