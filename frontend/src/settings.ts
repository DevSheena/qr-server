// 設定。画面の「設定」に出す項目は、下の SETTINGS の表に 1 行ずつ書く。
// 表に書けば、既定値・保存と読み込み・設定の画面 (settings-view.ts) に、そのまま反映される。
// 変わった時の動き (カメラを開き直すなど) は main.ts の store.subscribe に書く。
//
// 読む種類 (formats・preset) だけは画面が特別なので、表の外に置く (種類そのものは formats.ts)。

import { DEFAULT_PRESET_ID, PRESETS, isFmt, presetFor, type Fmt } from './formats';
import type { EngineMode } from './scanner/plan';

/** 選択肢: [値, 表示] */
export type Choice<T> = readonly [value: T, label: string];

/** 選択 (select) の設定 */
export interface SelectDef<T extends string | number> {
  kind: 'select';
  /** 行の見出し */
  label: string;
  default: T;
  choices: readonly Choice<T>[];
  /** 行の下の説明 */
  note?: string;
  /** 選択肢に無い値も覚える (端末ごとのカメラなど、画面が後から選択肢を足すもの) */
  open?: boolean;
}
/** チェックボックスの設定 */
export interface CheckDef {
  kind: 'check';
  /** 行の見出し。同じ見出しのチェックは 1 行にまとめる */
  row: string;
  label: string;
  default: boolean;
  note?: string;
}
type Extra = { note?: string; open?: boolean };
const select = <T extends string | number>(label: string, value: T, choices: readonly Choice<T>[], extra: Extra = {}): SelectDef<T> => ({
  kind: 'select',
  label,
  default: value,
  choices,
  ...extra,
});
const check = (row: string, label: string, value: boolean, note?: string): CheckDef => ({ kind: 'check', row, label, default: value, note });

// ---------- 設定の表 (この順に画面に並ぶ。読む種類はいちばん上) ----------
export const SETTINGS = {
  // 速さの調整
  mode: select<EngineMode>('方式', 'auto', [
    ['auto', '自動 (内蔵を優先し、読めない種類は zxing)'],
    ['native', '内蔵 (BarcodeDetector) だけ'],
    ['zxing', 'zxing-wasm だけ'],
  ]),
  roi: select<number>(
    '読む範囲',
    1,
    [
      [1, '全体'],
      [0.8, '中央 80%'],
      [0.6, '中央 60%'],
      [0.4, '中央 40%'],
    ],
    { note: '絞ると zxing は約 3 倍速い。黄色の枠の中にコードをかざす' },
  ),
  scale: select<number>(
    '縮小',
    1,
    [
      [1, '等倍'],
      [0.75, '3/4'],
      [0.5, '1/2'],
    ],
    { note: '速くなるが、小さく写ったコードを読めなくなる' },
  ),
  tryHarder: check('念入りに探す', '回転・白黒反転したコードも探す (zxing)', false, '切ると zxing は約 10 倍速い (読める割合は少し下がる)。内蔵には効かない'),
  hz: select<number>(
    '解析の頻度',
    0,
    [
      [0, '上限なし'],
      [15, '15 回/秒まで'],
      [10, '10 回/秒まで'],
      [5, '5 回/秒まで'],
    ],
    { note: '前の解析が終わってから最新のフレームを読む (溜めない)。下げると電池の減りが少ない' },
  ),
  // カメラ
  res: select<string>(
    '解像度',
    '1280x720',
    [
      ['640x480', '640×480'],
      ['1280x720', '1280×720'],
      ['1920x1080', '1920×1080'],
    ],
    { note: '上げると小さいコードを読めるが、解析は遅くなる' },
  ),
  camera: select<string>(
    'カメラ',
    'environment',
    [
      ['environment', '背面 (外側)'],
      ['user', '前面 (自撮り)'],
    ],
    { open: true }, // この端末のカメラ (deviceId) は、カメラを開いた後に画面が足す
  ),
  // 表示・動作
  mirror: check('表示・動作', '左右反転して表示', false),
  predict: check('表示・動作', '枠を先読みして、動かした時の遅れを減らす', true),
  stopAfterOne: check('表示・動作', '1 つ読んだら止める', false),
  vibrate: check('表示・動作', '振動', true),
  beep: check('表示・動作', '音', false),
};

// ---------- 型と既定値 (表から作る) ----------
type Defs = typeof SETTINGS;
export type SettingKey = keyof Defs | 'preset' | 'formats';
type ValueOf<D> = D extends SelectDef<infer T> ? T : D extends CheckDef ? boolean : never;

export type Settings = Readonly<
  { [K in keyof Defs]: ValueOf<Defs[K]> } & {
    /** PRESETS の id か CUSTOM_PRESET */
    preset: string;
    formats: readonly Fmt[];
  }
>;

export const CUSTOM_PRESET = 'custom';

export const DEFAULTS: Settings = {
  ...(Object.fromEntries(Object.entries(SETTINGS).map(([k, d]) => [k, d.default])) as { [K in keyof Defs]: ValueOf<Defs[K]> }),
  preset: DEFAULT_PRESET_ID,
  formats: PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.formats,
};

// ---------- 読み込み (保存した値は壊れていることがあるので、1 つずつ確かめる) ----------

/** 保存した値 v を、その設定に使えるか (選択は選択肢のどれか、チェックは true / false) */
function accepts(def: SelectDef<string | number> | CheckDef, v: unknown): boolean {
  if (def.kind === 'check') return typeof v === 'boolean';
  if (def.open) return typeof v === typeof def.default;
  return def.choices.some(([c]) => c === v);
}

/** 保存した文字列 (JSON) から設定を作る。使えない値は既定にする */
export function parseSettings(raw: string | null): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const j: unknown = JSON.parse(raw ?? 'null');
    if (j && typeof j === 'object') saved = j as Record<string, unknown>;
  } catch {
    /* 読めなければ既定 */
  }
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, def] of Object.entries(SETTINGS)) if (accepts(def, saved[key])) out[key] = saved[key];
  if (typeof saved.preset === 'string') out.preset = saved.preset;
  if (Array.isArray(saved.formats)) out.formats = saved.formats.filter(isFmt);
  return out as Settings;
}

// ---------- 決まりごと (純粋関数) ----------

/** プリセットを選ぶ: 読む種類もそのプリセットにする */
export function withPreset(id: string): Partial<Settings> {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { preset: id, formats: p.formats } : { preset: id };
}

/** 読む種類を選ぶ: 同じ組み合わせのプリセットがあればそれ、無ければ「自分で選ぶ」にする */
export const withFormats = (formats: readonly Fmt[]): Partial<Settings> => ({ formats, preset: presetFor(formats)?.id ?? CUSTOM_PRESET });

/** カメラを選んだ時の左右反転: 前面は鏡のように見えた方が自然なので反転、背面は反転なし、個別のカメラは変えない */
export const mirrorFor = (camera: string): Partial<Settings> => (camera === 'user' || camera === 'environment' ? { mirror: camera === 'user' } : {});

const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);
const KEYS = Object.keys(DEFAULTS) as SettingKey[];

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
