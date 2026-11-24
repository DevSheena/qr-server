// 設定・履歴のシート (カメラの上に重ねて出す。縦長では下から、横長では右から)。同時に開くのは 1 つだけ。

export interface Sheet {
  el: HTMLElement;
  /** 開け閉めするボタン */
  button: HTMLButtonElement;
}

export class Sheets<K extends string> {
  private openKey: K | null = null;

  /** onChange は開いているシートが変わった時に呼ぶ (null = どれも開いていない) */
  constructor(
    private readonly sheets: Record<K, Sheet>,
    private readonly onChange: (open: K | null) => void,
  ) {
    for (const key of this.keys()) sheets[key].button.addEventListener('click', () => this.toggle(key));
  }

  toggle(key: K) {
    this.show(this.openKey === key ? null : key);
  }

  show(key: K | null) {
    this.openKey = key;
    for (const k of this.keys()) {
      this.sheets[k].el.hidden = k !== key;
      this.sheets[k].button.setAttribute('aria-expanded', String(k === key));
    }
    this.onChange(key);
  }

  private keys() {
    return Object.keys(this.sheets) as K[];
  }
}
