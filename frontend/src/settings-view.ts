// 設定のシートの中身。settings.ts の SETTINGS の表から行を作り、ストアとつなぐ (ストアが変われば表示も変わる)。
// 設定を足す・選択肢を変えるのは settings.ts の表で、ここは触らなくてよい。
// 表の外の特別な行は「読む種類」(プリセットとチェックボックス) だけ。

import type { CameraInfo } from './camera';
import { el } from './dom';
import { FORMAT_INFO, FORMATS, PRESETS } from './formats';
import type { EnginePlan } from './scanner/plan';
import { CUSTOM_PRESET, SETTINGS, withFormats, withPreset, type CheckDef, type Choice, type SelectDef, type Settings, type SettingsStore } from './settings';
import { engineNote, formatsNote, type Note } from './text';

export interface SettingsView {
  /** 内蔵の読み取りが使えるか (使えなければ「方式」の「内蔵だけ」を選べなくする) */
  setNativeAvailable(available: boolean): void;
  /** 「方式」の下に、どの種類をどちらで読むかを出す */
  showEngines(plan: EnginePlan | null): void;
  /** この端末のカメラを「カメラ」の選択肢に足す */
  showCameras(cameras: readonly CameraInfo[]): void;
}

type Key = keyof typeof SETTINGS;
type Value = string | number | boolean;

export function buildSettingsView(root: HTMLElement, store: SettingsStore): SettingsView {
  const read = (key: Key) => store.value[key] as Value;
  const write = (key: Key, v: Value) => store.update({ [key]: v } as Partial<Settings>);
  const selects = new Map<Key, SelectControl>();
  const checkBoxes = new Map<string, HTMLElement>(); // 行の見出し → チェックを並べる入れ物
  const rows: HTMLElement[] = [formatsRow(store)];

  for (const [key, def] of Object.entries(SETTINGS) as [Key, SelectDef<string | number> | CheckDef][]) {
    if (def.kind === 'select') {
      const c = selectControl(def.choices, read(key) as string | number, (v) => write(key, v));
      store.subscribe(() => c.set(read(key) as string | number));
      selects.set(key, c);
      rows.push(row(def.label, c.el, def.note).el);
    } else {
      const c = checkControl(def.label, read(key) as boolean, (v) => write(key, v));
      store.subscribe(() => c.set(read(key) as boolean));
      let box = checkBoxes.get(def.row);
      if (!box) {
        box = el('div', { className: 'checks' });
        checkBoxes.set(def.row, box);
        rows.push(row(def.row, box, def.note).el);
      }
      box.append(c.el);
    }
  }

  // 「方式」の下: どの種類をどちらで読むか (読み取りの準備ができたら出す) と、内蔵が無い環境ではその理由
  const modeNote = el('div', { className: 'note' });
  const noNative = el('div', { className: 'note', text: 'この環境にはブラウザ内蔵の読み取り (BarcodeDetector) が無いので、zxing-wasm で読む' });
  noNative.hidden = true;
  selects.get('mode')?.el.after(modeNote, noNative);

  root.replaceChildren(...rows);
  return {
    setNativeAvailable(available) {
      selects.get('mode')?.setDisabled(available ? [] : ['native']);
      noNative.hidden = available;
    },
    showEngines: (plan) => setNote(modeNote, engineNote(plan)),
    showCameras(cameras) {
      const c = selects.get('camera');
      c?.setChoices([...SETTINGS.camera.choices, ...cameras.map((x): Choice<string> => [x.id, x.label])]);
      c?.set(store.value.camera);
    },
  };
}

/** 「読む種類」の行: プリセットの選択と、種類ごとのチェックボックス */
function formatsRow(store: SettingsStore): HTMLElement {
  const s = store.value;
  const presetChoices: Choice<string>[] = [...PRESETS.map((p): Choice<string> => [p.id, p.label]), [CUSTOM_PRESET, '自分で選ぶ']];
  const preset = selectControl(presetChoices, s.preset, (id) => store.update(withPreset(String(id))));
  const boxes = FORMATS.map((f) =>
    checkControl(FORMAT_INFO[f].label, s.formats.includes(f), () => store.update(withFormats(FORMATS.filter((_, i) => boxes[i].input.checked)))),
  );
  const r = row('読む種類', el('div', {}, [preset.el, el('div', { className: 'fmts' }, boxes.map((b) => b.el))]), '');
  const sync = (now: Settings) => {
    preset.set(now.preset);
    boxes.forEach((b, i) => b.set(now.formats.includes(FORMATS[i])));
    setNote(r.note, formatsNote(now.formats.length));
  };
  sync(s);
  store.subscribe(sync);
  return r.el;
}

// ---------- 部品 (設定の中身は知らない) ----------

interface SelectControl {
  el: HTMLSelectElement;
  /** 表示を v にする (選択肢に無ければ先頭) */
  set(v: string | number): void;
  setChoices(choices: readonly Choice<string | number>[]): void;
  /** 選べなくする値 */
  setDisabled(values: readonly (string | number)[]): void;
}

function selectControl(choices: readonly Choice<string | number>[], value: string | number, onChange: (v: string | number) => void): SelectControl {
  const select = el('select');
  let current = choices;
  const c: SelectControl = {
    el: select,
    set(v) {
      select.value = String(v);
      if (select.selectedIndex < 0) select.selectedIndex = 0;
    },
    setChoices(next) {
      const keep = select.value;
      current = next;
      select.replaceChildren(...next.map(([v, label]) => Object.assign(el('option', { text: label }), { value: String(v) })));
      select.value = keep;
    },
    setDisabled(values) {
      for (const o of select.options) o.disabled = values.some((v) => String(v) === o.value);
    },
  };
  c.setChoices(choices);
  c.set(value);
  // 選んだ値を、元の型 (数か文字) のまま返す
  select.addEventListener('change', () => {
    const hit = current.find(([v]) => String(v) === select.value);
    if (hit) onChange(hit[0]);
  });
  return c;
}

function checkControl(label: string, value: boolean, onChange: (v: boolean) => void) {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return { el: el('label', { className: 'check' }, [input, label]), input, set: (v: boolean) => (input.checked = v) };
}

/** 設定の 1 行: 見出し・部品・説明 (note を渡した時だけ。後から書き換えられる) */
function row(label: string, control: HTMLElement, note?: string): { el: HTMLElement; note: HTMLElement | undefined } {
  const noteEl = note === undefined ? undefined : el('div', { className: 'note', text: note });
  return { el: el('div', { className: 'row' }, [el('label', { text: label }), control, ...(noteEl ? [noteEl] : [])]), note: noteEl };
}

function setNote(e: HTMLElement | undefined, n: Note) {
  if (!e) return;
  e.textContent = n.text;
  e.classList.toggle('warn', n.warn);
}
