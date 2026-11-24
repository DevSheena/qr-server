// 画面に出す文字を作る・まとめる所。言い回しを変える時はここを直す (設定の項目の名前と説明は settings.ts、初めに出るボタンの名前は index.html)。

import { FORMAT_INFO, formatNames } from './formats';
import type { Size } from './geometry';
import type { EnginePlan } from './scanner/engines';
import type { Code, Engine } from './scanner/types';

const ENGINE_LABEL: Record<Engine, string> = { native: '内蔵', zxing: 'zxing' };

export const isUrl = (text: string) => /^https?:\/\/\S+$/i.test(text);

const truncate = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '…' : text);

/** 枠の上に出す名札 */
export const codeLabel = (c: Code) => `${FORMAT_INFO[c.format].label}: ${truncate(c.text, 32)}`;

/** 読んだ内容の下に出す説明 (種類・時刻・方式・回数)。time は表示用に整えた時刻 */
export const metaText = (c: Code, count: number, time: string) =>
  [FORMAT_INFO[c.format].label, time, ENGINE_LABEL[c.engine], ...(count > 1 ? [`${count} 回`] : [])].join(' · ');

/** 状態の表示に出す方式 ('内蔵'、'内蔵 + zxing (Codabar)'、'zxing' など) */
export function engineSummary(plan: EnginePlan | null): string {
  if (!plan) return 'なし';
  const zxing = plan.native.length ? `zxing (${formatNames(plan.zxing)})` : 'zxing';
  const parts = [...(plan.native.length ? ['内蔵'] : []), ...(plan.zxing.length ? [zxing] : [])];
  return parts.join(' + ') || 'なし';
}

/** 左上の状態の表示 */
export function statusText(s: { plan: EnginePlan | null; ms: number; rate: number; video: Size | null }): string {
  const res = s.video ? `${s.video.w}×${s.video.h}` : '';
  return `${engineSummary(s.plan)} · ${s.ms.toFixed(0)}ms · ${s.rate.toFixed(0)}回/秒 · ${res}`;
}

/** 設定の下に出す説明。warn は注意の色で出す */
export interface Note {
  text: string;
  warn: boolean;
}

/** 「方式」の下: どの種類をどちらで読むか */
export function engineNote(plan: EnginePlan | null): Note {
  if (!plan) return { text: '準備中…', warn: false };
  const parts = [
    ...(plan.native.length ? [`内蔵で読む: ${formatNames(plan.native)}`] : []),
    ...(plan.zxing.length ? [`zxing で読む: ${formatNames(plan.zxing)}`] : []),
    ...(plan.unreadable.length ? [`読めない (内蔵が非対応): ${formatNames(plan.unreadable)}`] : []),
  ];
  return { text: parts.join(' / '), warn: plan.unreadable.length > 0 };
}

/** 「読む種類」の下 */
export const formatsNote = (count: number): Note =>
  count ? { text: '絞るほど速い (zxing は全種類から 1 種類にすると約 9 倍)', warn: false } : { text: '1 つ以上選んでください', warn: true };

/** カメラを開けなかった理由 */
export function cameraErrorText(e: unknown): string {
  const MESSAGES: Record<string, string> = {
    NotAllowedError: 'カメラの使用が許可されていません。ブラウザの設定でこのサイトのカメラを許可してください',
    NotFoundError: 'カメラが見つかりません',
    NotReadableError: 'カメラを他のアプリが使っています',
  };
  return MESSAGES[(e as { name?: string } | null)?.name ?? ''] ?? String(e);
}

/** 画面の下などに出すお知らせ */
export const MSG = {
  noCameraHere: 'この画面ではカメラを使えません。https:// で開いてください',
  cameraFailed: (e: unknown) => `カメラを開けません: ${cameraErrorText(e)}`,
  scannerFailed: (e: unknown) => `読み取りの準備に失敗: ${e}`,
  torchFailed: (e: unknown) => `ライトを切り替えられません: ${e}`,
  paused: '読み取りました。画面をタップすると続けます',
};

/** ボタンなどの名前 (初めに出る名前は index.html に書いてある。ここは画面が書き換える時の名前) */
export const LABEL = {
  start: '開始',
  stop: '停止',
  copy: 'コピー',
  copied: 'コピーした',
  copyFailed: 'できない',
  open: '開く',
  formatsRow: '読む種類',
  customPreset: '自分で選ぶ',
  camera: (n: number) => `カメラ ${n}`,
  noNative: 'この環境にはブラウザ内蔵の読み取り (BarcodeDetector) が無いので、zxing-wasm で読む',
};
