// index.html の要素のうち、画面のコードが触るもの。id を変えたらここを直す (無い・型が違うと、起動した時にすぐ止まって分かる)。
// シート (設定・履歴) のつなぎは sheets.ts が index.html から組み立てるので、ここには無い。

import { byId } from './dom';

export function getElements() {
  return {
    stage: byId('stage', HTMLElement),
    video: byId('video', HTMLVideoElement),
    overlay: byId('overlay', HTMLCanvasElement),
    msg: byId('msg', HTMLElement),
    status: byId('status', HTMLElement),
    startBig: byId('startBig', HTMLButtonElement),
    startBtn: byId('startBtn', HTMLButtonElement),
    torch: byId('torch', HTMLButtonElement),
    count: byId('count', HTMLElement),
    latest: byId('latest', HTMLElement),
    latestMeta: byId('latestMeta', HTMLElement),
    latestText: byId('latestText', HTMLElement),
    latestCopy: byId('latestCopy', HTMLButtonElement),
    latestOpen: byId('latestOpen', HTMLAnchorElement),
    settings: byId('settings', HTMLElement),
    list: byId('list', HTMLOListElement),
    empty: byId('empty', HTMLElement),
    clear: byId('clear', HTMLButtonElement),
  };
}
