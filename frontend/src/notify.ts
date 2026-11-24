// 読めた時の知らせ (振動・音)。

export class Notifier {
  private audio: AudioContext | null = null;

  constructor(
    private readonly createAudio: () => AudioContext = () => new AudioContext(),
    private readonly vibrate: (ms: number) => void = (ms) => void navigator.vibrate?.(ms),
  ) {}

  /** 音を使えるようにする。ブラウザの決まりで、ユーザーの操作 (タップなど) の中で呼ぶ必要がある */
  prepareSound() {
    this.audio ??= this.createAudio();
  }

  notify(how: { vibrate: boolean; beep: boolean }) {
    if (how.vibrate) this.vibrate(60);
    if (how.beep) this.beep();
  }

  /** 短い「ピッ」 (1800 Hz、0.08 秒で消える) */
  private beep() {
    const a = this.audio;
    if (!a) return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.15, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.08);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + 0.09);
  }
}
