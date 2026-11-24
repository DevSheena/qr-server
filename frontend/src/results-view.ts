// 読んだ内容の表示: カメラの上の「最後に読んだ内容」(LatestCard) と、履歴のシートの一覧 (HistoryList)。
// 読んだ内容は必ず文字として入れる (HTML として解釈しない)。URL は自動では開かず、「開く」を押した時だけ別のタブで開く。

import { el, openLink, replayAnimation } from './dom';
import type { HistoryEntry, Recorded } from './history';
import { isUrl, metaText } from './text';

export type CopyFn = (text: string) => Promise<void>;

const timeOf = (t: number) => new Date(t).toLocaleTimeString();
const entryMeta = (e: HistoryEntry) => metaText(e.code, e.count, timeOf(e.last));

/** ボタンを押すと getText() の文字をコピーし、結果をしばらくボタンに出す */
export function bindCopy(btn: HTMLButtonElement, getText: () => string | null, copy: CopyFn) {
  btn.addEventListener('click', async () => {
    const text = getText();
    if (text === null) return;
    btn.textContent = await copy(text).then(
      () => 'コピーした',
      () => 'できない',
    );
    setTimeout(() => (btn.textContent = 'コピー'), 1500);
  });
}

export class HistoryList {
  private readonly items = new Map<string, { li: HTMLLIElement; meta: HTMLElement }>();

  constructor(
    private readonly els: { list: HTMLOListElement; empty: HTMLElement; count: HTMLElement },
    private readonly copy: CopyFn,
  ) {}

  /** 1 件を出す。初めてのコードは先頭に足し、続けて読んでいるだけなら回数だけ直す (知らせる時は先頭へ移す) */
  show({ entry, fresh }: Recorded, total: number) {
    let item = this.items.get(entry.key);
    if (!item) {
      item = this.createItem(entry);
      this.items.set(entry.key, item);
    }
    if (fresh || item.li.parentElement !== this.els.list) this.els.list.prepend(item.li);
    item.meta.textContent = entryMeta(entry);
    this.els.empty.hidden = true;
    this.els.count.textContent = String(total);
  }

  clear() {
    this.items.clear();
    this.els.list.replaceChildren();
    this.els.empty.hidden = false;
    this.els.count.textContent = '0';
  }

  private createItem(entry: HistoryEntry) {
    const { text } = entry.code;
    const copyBtn = el('button', { className: 'tool small', text: 'コピー' });
    bindCopy(copyBtn, () => text, this.copy);
    const meta = el('div', { className: 'meta' });
    const acts = el('div', { className: 'acts' }, [copyBtn, ...(isUrl(text) ? [openLink(text)] : [])]);
    return { li: el('li', {}, [el('div', { className: 'text', text }), meta, acts]), meta };
  }
}

export class LatestCard {
  private text: string | null = null;

  constructor(
    private readonly els: { root: HTMLElement; meta: HTMLElement; text: HTMLElement; copy: HTMLButtonElement; open: HTMLAnchorElement },
    copy: CopyFn,
  ) {
    bindCopy(els.copy, () => this.text, copy);
  }

  show({ entry, fresh }: Recorded) {
    const { text } = entry.code;
    this.text = text;
    this.els.meta.textContent = entryMeta(entry);
    this.els.text.textContent = text;
    this.els.open.hidden = !isUrl(text);
    if (isUrl(text)) this.els.open.href = text;
    this.els.root.hidden = false;
    if (fresh) replayAnimation(this.els.root, 'new');
  }

  hide() {
    this.text = null;
    this.els.root.hidden = true;
  }

  /** シートが開いている間は隠す (重ならないように) */
  setCovered(covered: boolean) {
    this.els.root.style.visibility = covered ? 'hidden' : '';
  }
}
