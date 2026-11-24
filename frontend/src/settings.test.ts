import { describe, expect, it } from 'vitest';
import { DEFAULTS, SettingsStore, applyRules, changedKeys, parseSettings, type KeyValueStorage } from './settings';

describe('parseSettings', () => {
  it('無い・壊れた JSON は既定', () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(parseSettings('{oops')).toEqual(DEFAULTS);
    expect(parseSettings('[1,2]')).toEqual({ ...DEFAULTS });
  });
  it('型の合わない値・知らない方式・知らない種類・前の版の preset は捨てる', () => {
    const s = parseSettings(JSON.stringify({ roi: '0.6', mode: 'magic', formats: ['qr_code', 'nope'], mirror: true, extra: 1, preset: 'qr' }));
    expect('preset' in s).toBe(false);
    expect(s.roi).toBe(DEFAULTS.roi);
    expect(s.mode).toBe(DEFAULTS.mode);
    expect(s.formats).toEqual(['qr_code']);
    expect(s.mirror).toBe(true);
    expect('extra' in s).toBe(false);
  });
  it('選択の設定は選択肢にある値だけ。カメラは端末のカメラ (選択肢に無い id) も覚える', () => {
    const s = parseSettings(JSON.stringify({ roi: 0.33, hz: 10, camera: 'device-abc' }));
    expect(s.roi).toBe(DEFAULTS.roi);
    expect(s.hz).toBe(10);
    expect(s.camera).toBe('device-abc');
  });
});

describe('決まりごと (applyRules)', () => {
  it('前面カメラは左右反転、背面は反転なし、個別のカメラは反転を変えない', () => {
    expect(applyRules({ camera: 'user' })).toEqual({ camera: 'user', mirror: true });
    expect(applyRules({ camera: 'environment' })).toEqual({ camera: 'environment', mirror: false });
    expect(applyRules({ camera: 'abc' })).toEqual({ camera: 'abc' });
  });
  it('一緒に指定した値は上書きしない。関係ない設定には何もしない', () => {
    expect(applyRules({ camera: 'user', mirror: false })).toEqual({ camera: 'user', mirror: false });
    expect(applyRules({ roi: 0.6 })).toEqual({ roi: 0.6 });
  });
  it('changedKeys は配列を中身で比べる', () => {
    expect([...changedKeys(DEFAULTS, { ...DEFAULTS, formats: [...DEFAULTS.formats] })]).toEqual([]);
    expect([...changedKeys(DEFAULTS, { ...DEFAULTS, roi: 0.6, formats: ['qr_code'] })].sort()).toEqual(['formats', 'roi']);
  });
});

describe('SettingsStore', () => {
  const memory = (init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } => {
    const data = { ...init };
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  };
  it('変わった時だけ保存して、変わった名前を知らせる', () => {
    const storage = memory();
    const store = new SettingsStore(storage, 'k');
    const calls: string[][] = [];
    store.subscribe((_, changed) => calls.push([...changed]));
    store.update({ roi: 1 }); // 同じ値
    store.update({ roi: 0.6 });
    expect(calls).toEqual([['roi']]);
    expect(JSON.parse(storage.data.k).roi).toBe(0.6);
    expect(new SettingsStore(storage, 'k').value.roi).toBe(0.6);
  });
  it('決まりで合わせて変わった設定も、1 回の知らせにまとめる', () => {
    const store = new SettingsStore(null);
    const calls: string[][] = [];
    store.subscribe((s, changed) => calls.push([...changed].sort(), [String(s.mirror)]));
    store.update({ camera: 'user' });
    expect(calls).toEqual([['camera', 'mirror'], ['true']]);
  });
  it('保存先が使えなくても動く', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const store = new SettingsStore(broken);
    store.update({ beep: true });
    expect(store.value.beep).toBe(true);
    expect(new SettingsStore(null).value).toEqual(DEFAULTS);
  });
});
