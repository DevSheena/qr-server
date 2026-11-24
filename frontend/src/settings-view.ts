// 設定のシートの中身。どの部品もストア (SettingsStore) とつなぎ、ストアが変われば表示も変わる。
// 設定を足す時: settings.ts に足してから、下の buildSettingsView の rows に 1 行足す。

import type { CameraInfo } from './camera';
import { checkControl, row, selectControl, setNote, type Choice } from './form';
import { FMT_LABEL, FORMATS, PRESETS } from './formats';
import { el } from './dom';
import type { EngineMode, EnginePlan } from './scanner/plan';
import { CUSTOM_PRESET, withCamera, withFormats, withPreset, type Settings, type SettingsStore } from './settings';
import { engineNote, formatsNote } from './text';

/** T の中で、値の型が V のキー */
type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

const MODE_CHOICES: Choice<EngineMode>[] = [
  ['auto', '自動 (内蔵を優先し、読めない種類は zxing)'],
  ['native', '内蔵 (BarcodeDetector) だけ'],
  ['zxing', 'zxing-wasm だけ'],
];
const ROI_CHOICES: Choice<number>[] = [
  [1, '全体'],
  [0.8, '中央 80%'],
  [0.6, '中央 60%'],
  [0.4, '中央 40%'],
];
const SCALE_CHOICES: Choice<number>[] = [
  [1, '等倍'],
  [0.75, '3/4'],
  [0.5, '1/2'],
];
const HZ_CHOICES: Choice<number>[] = [
  [0, '上限なし'],
  [15, '15 回/秒まで'],
  [10, '10 回/秒まで'],
  [5, '5 回/秒まで'],
];
const RES_CHOICES: Choice<string>[] = [
  ['640x480', '640×480'],
  ['1280x720', '1280×720'],
  ['1920x1080', '1920×1080'],
];
const CAMERA_CHOICES: Choice<string>[] = [
  ['environment', '背面 (外側)'],
  ['user', '前面 (自撮り)'],
];
const PRESET_CHOICES: Choice<string>[] = [...PRESETS.map((p): Choice<string> => [p.id, p.label]), [CUSTOM_PRESET, '自分で選ぶ']];

export interface SettingsView {
  /** 内蔵の読み取りが使えるか (使えなければ「内蔵だけ」を選べなくする) */
  setNativeAvailable(available: boolean): void;
  /** どの種類をどちらで読むか */
  showEngines(plan: EnginePlan | null): void;
  /** この端末のカメラ (背面・前面のあとに並べる) */
  showCameras(cameras: readonly CameraInfo[]): void;
}

export function buildSettingsView(root: HTMLElement, store: SettingsStore): SettingsView {
  const s = store.value;
  // 値の型が T の設定 key を読み書きする (キーと値の型の組み合わせは、引数の型で確かめる)
  const read = <T>(key: KeysOfType<Settings, T>) => (now: Settings) => now[key] as T;
  const write = <T>(key: KeysOfType<Settings, T>) => (v: T) => store.update({ [key]: v } as Partial<Settings>);

  // ストアとつながった選択・チェックボックス (ストアが変われば表示も変わる)
  const bindSelect = <T extends string | number>(key: KeysOfType<Settings, T>, choices: readonly Choice<T>[]) => {
    const get = read<T>(key);
    const c = selectControl(choices, get(s), write<T>(key));
    store.subscribe((now) => c.set(get(now)));
    return c;
  };
  const bindCheck = (key: KeysOfType<Settings, boolean>, label: string) => {
    const get = read<boolean>(key);
    const c = checkControl(label, get(s), write<boolean>(key));
    store.subscribe((now) => c.set(get(now)));
    return c.el;
  };

  // 読む種類: プリセットと、1 つずつのチェックボックス
  const preset = selectControl(PRESET_CHOICES, s.preset, (id) => store.update(withPreset(id)));
  const boxes = FORMATS.map((f) => checkControl(FMT_LABEL[f], s.formats.includes(f), () => store.update(withFormats(FORMATS.filter((_, i) => boxes[i].input.checked)))));
  const formatsRow = row('読む種類', el('div', {}, [preset.el, el('div', { className: 'fmts' }, boxes.map((b) => b.el))]), '');
  const syncFormats = (now: Settings) => {
    preset.set(now.preset);
    boxes.forEach((b, i) => b.set(now.formats.includes(FORMATS[i])));
    setNote(formatsRow.note, formatsNote(now.formats.length));
  };
  syncFormats(s);
  store.subscribe(syncFormats);

  // 方式: 内蔵が無い環境では「内蔵だけ」を選べなくし、その理由を出す
  const mode = bindSelect('mode', MODE_CHOICES);
  const modeRow = row('方式', mode.el, '');
  const noNative = el('div', { className: 'note', text: 'この環境にはブラウザ内蔵の読み取り (BarcodeDetector) が無いので、zxing-wasm で読む' });
  noNative.hidden = true;
  modeRow.el.append(noNative);

  const camera = selectControl(CAMERA_CHOICES, s.camera, (v) => store.update(withCamera(v)));
  store.subscribe((now) => camera.set(now.camera));

  const checks = el('div', { className: 'checks' }, [
    bindCheck('mirror', '左右反転して表示'),
    bindCheck('predict', '枠を先読みして、動かした時の遅れを減らす'),
    bindCheck('stopAfterOne', '1 つ読んだら止める'),
    bindCheck('vibrate', '振動'),
    bindCheck('beep', '音'),
  ]);

  root.replaceChildren(
    formatsRow.el,
    modeRow.el,
    row('読む範囲', bindSelect('roi', ROI_CHOICES).el, '絞ると zxing は約 3 倍速い。黄色の枠の中にコードをかざす').el,
    row('縮小', bindSelect('scale', SCALE_CHOICES).el, '速くなるが、小さく写ったコードを読めなくなる').el,
    row('念入りに探す', bindCheck('tryHarder', '回転・白黒反転したコードも探す (zxing)'), '切ると zxing は約 10 倍速い (読める割合は少し下がる)。内蔵には効かない').el,
    row('解析の頻度', bindSelect('hz', HZ_CHOICES).el, '前の解析が終わってから最新のフレームを読む (溜めない)。下げると電池の減りが少ない').el,
    row('解像度', bindSelect('res', RES_CHOICES).el, '上げると小さいコードを読めるが、解析は遅くなる').el,
    row('カメラ', camera.el).el,
    row('表示・動作', checks).el,
  );

  return {
    setNativeAvailable(available) {
      mode.setDisabled(available ? [] : ['native']);
      noNative.hidden = available;
    },
    showEngines: (plan) => setNote(modeRow.note, engineNote(plan)),
    showCameras(cameras) {
      camera.setChoices([...CAMERA_CHOICES, ...cameras.map((c): Choice<string> => [c.id, c.label])]);
      camera.set(store.value.camera);
    },
  };
}
