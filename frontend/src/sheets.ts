// 設定・履歴のシート (カメラの上に重ねて出す。縦長では下から、横長では右から)。同時に開くのは 1 つだけ。
//
// つなぎは index.html だけに書く (ここは HTML から組み立てる):
//   シート          … <aside id="..." class="sheet" hidden>
//   開け閉めのボタン … aria-controls="<シートの id>"
//   閉じるボタン     … data-close (シートの中に置く)

export class Sheets {
  private readonly sheets: { el: HTMLElement; button: HTMLButtonElement }[];

  /** onChange は開いているシートが変わった時に呼ぶ (null = どれも開いていない) */
  constructor(
    root: ParentNode,
    private readonly onChange: (open: HTMLElement | null) => void,
  ) {
    this.sheets = [...root.querySelectorAll<HTMLButtonElement>('button[aria-controls]')].flatMap((button) => {
      const el = document.getElementById(button.getAttribute('aria-controls') ?? '');
      return el?.classList.contains('sheet') ? [{ el, button }] : [];
    });
    for (const s of this.sheets) s.button.addEventListener('click', () => this.show(s.el.hidden ? s.el : null));
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.show(null)));
  }

  show(sheet: HTMLElement | null) {
    for (const s of this.sheets) {
      s.el.hidden = s.el !== sheet;
      s.button.setAttribute('aria-expanded', String(s.el === sheet));
    }
    this.onChange(sheet);
  }
}
