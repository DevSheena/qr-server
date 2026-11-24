// QR・バーコードリーダーの画面の組み立て。ここでは部品を作ってつなぐだけで、中身はそれぞれのファイルにある。
//
//   camera.ts       カメラ                     scan-loop.ts      読み取りの繰り返し
//   scanner/        読み取り (内蔵と zxing)      frame.ts          解析する画像 (範囲・縮小)
//   tracks.ts       枠の追跡と先読み             overlay.ts        枠の描画
//   history.ts      読んだ内容の記録             results-view.ts   読んだ内容の表示
//   settings.ts     設定の保存と決まりごと       settings-view.ts  設定の画面
//   sheets.ts       設定・履歴のシート           text.ts           画面に出す文字
//
// 流れ: カメラ → (映像の画面ごとに) 解析する画像 → 読み取り → 記録・表示・知らせ / 枠の追跡 → (描画ごとに) 枠の描画

import './style.css';
import { Camera, cameraPermitted, isMissingDevice } from './camera';
import { getElements } from './elements';
import { FrameGrabber, planFrame } from './frame';
import { centerRect } from './geometry';
import { History, type Recorded } from './history';
import { Notifier } from './notify';
import { Overlay } from './overlay';
import { HistoryList, LatestCard } from './results-view';
import { ScanLoop, ScanStats } from './scan-loop';
import { browserScannerDeps, nativeFormats } from './scanner/browser';
import { Scanner } from './scanner/scanner';
import { SettingsStore, browserStorage, touches } from './settings';
import { buildSettingsView } from './settings-view';
import { Sheets } from './sheets';
import { cameraErrorText, codeLabel, statusText } from './text';
import { Tracker } from './tracks';

// ---------- 部品 ----------
const ui = getElements();
const copy = (text: string) => navigator.clipboard.writeText(text);
const store = new SettingsStore(browserStorage());
const scanner = new Scanner(browserScannerDeps());
const camera = new Camera(ui.video);
const grabber = new FrameGrabber();
const tracker = new Tracker();
const history = new History();
const notifier = new Notifier();
const stats = new ScanStats(performance.now());
const overlay = new Overlay(ui.overlay);
const latest = new LatestCard({ root: ui.latest, meta: ui.latestMeta, text: ui.latestText, copy: ui.latestCopy, open: ui.latestOpen }, copy);
const historyList = new HistoryList({ list: ui.list, empty: ui.empty, count: ui.count }, copy);
const settingsView = buildSettingsView(ui.settings, store);
const sheets = new Sheets({ settings: { el: ui.settingsSheet, button: ui.settingsBtn }, history: { el: ui.historySheet, button: ui.historyBtn } }, (open) =>
  latest.setCovered(open !== null),
);
/** 「1 つ読んだら止める」で止まっている */
let paused = false;
const loop = new ScanLoop({ video: ui.video, step: scanOnce, canScan: () => !paused && scanner.ready, hz: () => store.value.hz });

// ---------- 表示 ----------
function showMsg(text = '', err = false) {
  ui.msg.textContent = text;
  ui.msg.classList.toggle('err', err);
}
function renderStatus() {
  ui.status.hidden = !camera.running;
  if (camera.running) ui.status.textContent = statusText({ plan: scanner.plan, ms: stats.ms, rate: stats.rate, video: camera.size });
}
function applyMirror(on: boolean) {
  ui.video.classList.toggle('mirror', on);
}

// ---------- 読み取り ----------
async function configureScanner() {
  const s = store.value;
  settingsView.showEngines(null);
  try {
    const plan = await scanner.configure(s.formats, s.mode, s.tryHarder);
    if (plan) settingsView.showEngines(plan);
  } catch (e) {
    showMsg(`読み取りの準備に失敗: ${e}`, true);
  }
  renderStatus();
}

/** 1 回読む。tFrame は解析する画面が表示される時刻 (枠の先読みの基準) */
async function scanOnce(tFrame: number) {
  const size = camera.size;
  if (!size) return;
  const s = store.value;
  const t0 = performance.now();
  const codes = await scanner.scan(grabber.sources(ui.video, planFrame(size, s.roi, s.scale)));
  const now = performance.now();
  if (stats.add(now - t0, now)) renderStatus();
  if (!codes.length) return;
  tracker.update(codes, tFrame, now);
  for (const c of codes) showResult(history.record(c, Date.now()));
  if (s.stopAfterOne) {
    paused = true;
    showMsg('読み取りました。画面をタップすると続けます');
  }
}

function showResult(r: Recorded) {
  historyList.show(r, history.size);
  latest.show(r);
  if (r.fresh) notifier.notify(store.value);
}

// ---------- 枠の描画 (画面の描画ごと) ----------
function drawOverlay() {
  requestAnimationFrame(drawOverlay);
  const size = camera.size;
  if (!size) return overlay.draw(null);
  const s = store.value;
  const boxes = tracker.boxes(performance.now(), s.predict).map((b) => ({ pts: b.pts, label: codeLabel(b.code), alpha: b.alpha }));
  overlay.draw({ video: size, mirror: s.mirror, roi: s.roi < 1 ? centerRect(size, s.roi) : null, boxes });
}

// ---------- カメラ ----------
async function startCamera() {
  if (!camera.available) return showMsg('この画面ではカメラを使えません。https:// で開いてください', true);
  ui.startBig.hidden = true;
  try {
    await camera.start(store.value);
  } catch (e) {
    if (isMissingDevice(e, store.value)) {
      store.update({ camera: 'environment' }); // 覚えていたカメラが無くなった
      return startCamera();
    }
    stopCamera();
    return showMsg(`カメラを開けません: ${cameraErrorText(e)}`, true);
  }
  paused = false;
  ui.startBtn.textContent = '停止';
  ui.torch.hidden = !camera.hasTorch;
  ui.torch.setAttribute('aria-pressed', 'false');
  showMsg();
  void camera.list().then(settingsView.showCameras);
  renderStatus();
  loop.start();
}

function stopCamera() {
  loop.stop();
  camera.stop();
  tracker.clear();
  ui.torch.hidden = true;
  ui.startBtn.textContent = '開始';
  ui.startBig.hidden = false;
  renderStatus();
}

/** ユーザーの操作から始める (音はユーザーの操作の中で用意する必要がある) */
function start() {
  if (store.value.beep) notifier.prepareSound();
  void startCamera();
}

// ---------- 操作 ----------
ui.startBig.addEventListener('click', start);
ui.startBtn.addEventListener('click', () => {
  if (!camera.running) return start();
  stopCamera();
  showMsg();
});
ui.torch.addEventListener('click', async () => {
  const on = ui.torch.getAttribute('aria-pressed') !== 'true';
  try {
    await camera.setTorch(on);
    ui.torch.setAttribute('aria-pressed', String(on));
  } catch (e) {
    showMsg(`ライトを切り替えられません: ${e}`, true);
  }
});
// 「1 つ読んだら止める」で止まっている時は、カメラの部分をタップすると続ける (ボタンや結果の上のタップは除く)
ui.stage.addEventListener('click', (e) => {
  if (!paused || (e.target as HTMLElement).closest('button, a, .latest')) return;
  paused = false;
  showMsg();
});
ui.clear.addEventListener('click', () => {
  history.clear();
  historyList.clear();
  latest.hide();
});
ui.closeButtons.forEach((b) => b.addEventListener('click', () => sheets.show(null)));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resume();
});

// 設定が変わった時の動き (画面の部品は settings-view.ts が自分で表示を直す)
store.subscribe((s, changed) => {
  if (touches(changed, 'formats', 'mode', 'tryHarder')) void configureScanner();
  if (touches(changed, 'res', 'camera') && camera.running) void startCamera();
  if (changed.has('mirror')) applyMirror(s.mirror);
  if (changed.has('beep') && s.beep) notifier.prepareSound();
});

// ---------- 始める ----------
applyMirror(store.value.mirror);
requestAnimationFrame(drawOverlay);
void (async () => {
  settingsView.setNativeAvailable((await nativeFormats()).length > 0);
  await configureScanner();
  // 以前カメラを許可していれば、そのまま始める (許可を聞く画面を出さずに済む時だけ)
  if (await cameraPermitted()) start();
})();

// テストや確認用 (画面には出さない)
Object.assign(globalThis, {
  qrReader: {
    scanner,
    settings: () => store.value,
    stats,
    timing: () => tracker.timing,
    boxes: () => tracker.boxes(performance.now(), store.value.predict).map((b) => ({ text: b.code.text, pts: b.pts })),
  },
});
