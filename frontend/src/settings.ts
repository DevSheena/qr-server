// 設定: 型・既定・読み込みの検査・決まりごと (純粋関数) と、保存して変化を知らせるストア。
// 設定を足す時: Settings・DEFAULTS・PARSERS に 1 つずつ足す (PARSERS の型で、書き忘れはビルドで分かる)。
// 画面は settings-view.ts、変わった時の動き (カメラの開き直しなど) は main.ts。

import { DEFAULT_PRESET_ID, PRESETS, isFmt, presetFor, type Fmt } from './formats';
import { ENGINE_MODES, type EngineMode } from './scanner/plan';

export type Settings = Readonly<{
  /** PRESETS の id か CUSTOM_PRESET */
  preset: string;
  formats: readonly Fmt[];
  mode: EngineMode;
  /** 解析する範囲 (中央の幅・高さの割合。1 = 全体) */
  roi: number;
  /** 解析前の縮小 (1 = 等倍) */
  scale: number;
  tryHarder: boolean;
  /** 1 秒あたりの解析の上限 (0 = 上限なし。どれでも前の解析が終わるまで次は読まない) */
  hz: number;
  /** '1280x720' など */
  res: string;
  /** 'environment' (背面) | 'user' (前面) | deviceId */
  camera: string;
  mirror: boolean;
  stopAfterOne: boolean;
  vibrate: boolean;
  beep: boolean;
  /** 枠を先読みして、動かした時の遅れを減らす */
  predict: boolean;
}>;
export type SettingKey = keyof Settings;

export const CUSTOM_PRESET = 'custom';

export const DEFAULTS: Settings = {
  preset: DEFAULT_PRESET_ID,
  formats: PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.formats,
  mode: 'auto',
  roi: 1,
  scale: 1,
  tryHarder: false,
  hz: 0,
  res: '1280x720',
  camera: 'environment',
  mirror: false,
  stopAfterOne: false,
  vibrate: true,
  beep: false,
  predict: true,
};

// ---------- 読み込み (保存した値は壊れていることがあるので、1 つずつ型を確かめる) ----------
type Parser<T> = (v: unknown) => T | undefined;
const str: Parser<string> = (v) => (typeof v === 'string' ? v : undefined);
const num: Parser<number> = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool: Parser<boolean> = (v) => (typeof v === 'boolean' ? v : undefined);
const oneOf =
  <T>(choices: readonly T[]): Parser<T> =>
  (v) =>
    choices.includes(v as T) ? (v as T) : undefined;
const formats: Parser<Fmt[]> = (v) => (Array.isArray(v) ? v.filter(isFmt) : undefined);

const PARSERS: { [K in SettingKey]: Parser<Settings[K]> } = {
  preset: str,
  formats,
  mode: oneOf(ENGINE_MODES),
  roi: num,
  scale: num,
  tryHarder: bool,
  hz: num,
  res: str,
  camera: str,
  mirror: bool,
  stopAfterOne: bool,
  vibrate: bool,
  beep: bool,
  predict: bool,
};
const KEYS = Object.keys(PARSERS) as SettingKey[];

/** 保存した文字列 (JSON) から設定を作る。読めない値は既定にする */
export function parseSettings(raw: string | null): Settings {
  let j: unknown = null;
  try {
    j = JSON.parse(raw ?? 'null');
  } catch {
    /* 読めなければ既定 */
  }
  if (!j || typeof j !== 'object') return DEFAULTS;
  const src = j as Record<string, unknown>;
  const out: { -readonly [K in SettingKey]: Settings[K] } = { ...DEFAULTS };
  const take = <K extends SettingKey>(k: K) => {
    const v = PARSERS[k](src[k]);
    if (v !== undefined) out[k] = v;
  };
  KEYS.forEach(take);
  return out;
}

// ---------- 決まりごと (純粋関数。設定の画面から呼ぶ) ----------

/** プリセットを選ぶ: 読む種類もそのプリセットにする */
export function withPreset(id: string): Partial<Settings> {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { preset: id, formats: p.formats } : { preset: id };
}

/** 読む種類を選ぶ: 同じ組み合わせのプリセットがあればそれ、無ければ「自分で選ぶ」にする */
export const withFormats = (formats: readonly Fmt[]): Partial<Settings> => ({ formats, preset: presetFor(formats)?.id ?? CUSTOM_PRESET });

/** カメラを選ぶ: 前面は鏡のように見えた方が自然なので、背面・前面を選んだ時は左右反転も合わせる (後から変えられる) */
export const withCamera = (camera: string): Partial<Settings> =>
  camera === 'environment' || camera === 'user' ? { camera, mirror: camera === 'user' } : { camera };

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b;

/** 変わった設定の名前 */
export const changedKeys = (a: Settings, b: Settings): Set<SettingKey> => new Set(KEYS.filter((k) => !same(a[k], b[k])));

/** changed に keys のどれかが入っているか */
export const touches = (changed: ReadonlySet<SettingKey>, ...keys: SettingKey[]) => keys.some((k) => changed.has(k));

// ---------- ストア (保存して、変わったことを知らせる) ----------

/** 保存先 (ブラウザの localStorage。テストでは偽物を渡す) */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type SettingsListener = (s: Settings, changed: ReadonlySet<SettingKey>) => void;

export const STORAGE_KEY = 'qr-reader.settings.v1';

/** ブラウザの localStorage。使えない環境 (保存を禁じた設定など) では null */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly key = STORAGE_KEY,
  ) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(key) ?? null;
    } catch {
      /* 読めなければ既定 */
    }
    this.current = parseSettings(raw);
  }

  get value(): Settings {
    return this.current;
  }

  /** 変える。本当に変わった時だけ保存して知らせる */
  update(patch: Partial<Settings>) {
    const next: Settings = { ...this.current, ...patch };
    const changed = changedKeys(this.current, next);
    if (!changed.size) return;
    this.current = next;
    try {
      this.storage?.setItem(this.key, JSON.stringify(next));
    } catch {
      /* 保存できない環境 (プライベートブラウズなど) では覚えない */
    }
    for (const fn of this.listeners) fn(next, changed);
  }

  /** 変わった時に呼ぶ関数を登録する。戻り値を呼ぶと外す */
  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
