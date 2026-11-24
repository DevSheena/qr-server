// DOM の小さな道具。

/** id の要素を取る。無い・型が違う時はすぐに止める (HTML との食い違いを、起動した時に見つける) */
export function byId<T extends HTMLElement>(id: string, type: { new (): T; name: string }): T {
  const e = document.getElementById(id);
  if (!(e instanceof type)) throw new Error(`#${id} が無いか、${type.name} ではない`);
  return e;
}

/** 要素を作る。text は必ず文字として入れる (HTML として解釈しない) */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.className) e.className = props.className;
  if (props.text !== undefined) e.textContent = props.text;
  e.append(...children);
  return e;
}

/** 別のタブで開くリンク (開いた先に、このページを触らせない) */
export function openLink(url: string, text: string): HTMLAnchorElement {
  const a = el('a', { className: 'tool small link', text });
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** アニメーションをやり直す (クラスを外して付け直す) */
export function replayAnimation(e: HTMLElement, className: string) {
  e.classList.remove(className);
  void e.offsetWidth; // 外したことをブラウザに反映させる
  e.classList.add(className);
}
