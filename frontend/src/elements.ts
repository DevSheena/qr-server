// index.html の要素。id を変えたらここを直す (無い・型が違うと、起動した時にすぐ止まって分かる)。

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
    historyBtn: byId('historyBtn', HTMLButtonElement),
    settingsBtn: byId('settingsBtn', HTMLButtonElement),
    count: byId('count', HTMLElement),
    latest: byId('latest', HTMLElement),
    latestMeta: byId('latestMeta', HTMLElement),
    latestText: byId('latestText', HTMLElement),
    latestCopy: byId('latestCopy', HTMLButtonElement),
    latestOpen: byId('latestOpen', HTMLAnchorElement),
    settingsSheet: byId('settingsSheet', HTMLElement),
    historySheet: byId('historySheet', HTMLElement),
    settings: byId('settings', HTMLElement),
    list: byId('list', HTMLOListElement),
    empty: byId('empty', HTMLElement),
    clear: byId('clear', HTMLButtonElement),
    closeButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-close]')],
  };
}

export type Elements = ReturnType<typeof getElements>;
