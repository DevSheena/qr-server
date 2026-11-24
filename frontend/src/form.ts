// 設定の画面の部品 (選択・チェックボックス・行)。設定の中身は知らない、汎用の部品。

import { el } from './dom';

/** 選択肢: [値, 表示] */
export type Choice<T> = readonly [value: T, label: string];

export interface SelectControl<T> {
  el: HTMLSelectElement;
  /** 表示を v にする (選択肢に無ければ先頭) */
  set(v: T): void;
  setChoices(choices: readonly Choice<T>[]): void;
  /** 選べなくする値 */
  setDisabled(values: readonly T[]): void;
}

export function selectControl<T extends string | number>(choices: readonly Choice<T>[], value: T, onChange: (v: T) => void): SelectControl<T> {
  const select = el('select');
  let current = choices;
  const c: SelectControl<T> = {
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
  select.addEventListener('change', () => {
    const hit = current.find(([v]) => String(v) === select.value);
    if (hit) onChange(hit[0]);
  });
  return c;
}

export interface CheckControl {
  el: HTMLLabelElement;
  input: HTMLInputElement;
  set(v: boolean): void;
}

export function checkControl(label: string, value: boolean, onChange: (v: boolean) => void): CheckControl {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return { el: el('label', { className: 'check' }, [input, label]), input, set: (v) => (input.checked = v) };
}

/** 設定の 1 行: 見出し・部品・説明 (note を渡した時だけ。後から書き換えられる) */
export function row(label: string, control: HTMLElement, note?: string): { el: HTMLElement; note: HTMLElement | null } {
  const noteEl = note === undefined ? null : el('div', { className: 'note', text: note });
  return { el: el('div', { className: 'row' }, [el('label', { text: label }), control, ...(noteEl ? [noteEl] : [])]), note: noteEl };
}

/** 説明の文字と、注意の色を付けるか */
export function setNote(e: HTMLElement | null, n: { text: string; warn: boolean }) {
  if (!e) return;
  e.textContent = n.text;
  e.classList.toggle('warn', n.warn);
}
