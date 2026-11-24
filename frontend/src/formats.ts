// 読む種類 (フォーマット)。種類を足す・外す・名前を変える時は、下の FORMAT_INFO の表だけを直す。
//   キー   … BarcodeDetector (ブラウザ内蔵) の名前
//   label … 画面に出す名前
//   zxing … zxing-wasm の名前
// 表の順が、設定の画面に並ぶ順になる。

export const FORMAT_INFO = {
  qr_code: { label: 'QR', zxing: 'QRCode' },
  ean_13: { label: 'EAN-13 (JAN)', zxing: 'EAN13' },
  ean_8: { label: 'EAN-8', zxing: 'EAN8' },
  upc_a: { label: 'UPC-A', zxing: 'UPCA' },
  upc_e: { label: 'UPC-E', zxing: 'UPCE' },
  code_128: { label: 'Code128', zxing: 'Code128' },
  code_39: { label: 'Code39', zxing: 'Code39' },
  code_93: { label: 'Code93', zxing: 'Code93' },
  codabar: { label: 'Codabar (NW-7)', zxing: 'Codabar' },
  itf: { label: 'ITF', zxing: 'ITF' },
  data_matrix: { label: 'DataMatrix', zxing: 'DataMatrix' },
  pdf417: { label: 'PDF417', zxing: 'PDF417' },
  aztec: { label: 'Aztec', zxing: 'Aztec' },
} as const;

export type Fmt = keyof typeof FORMAT_INFO;
export const FORMATS = Object.keys(FORMAT_INFO) as Fmt[];

export interface Preset {
  id: string;
  label: string;
  formats: readonly Fmt[];
}
const LINEAR: readonly Fmt[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf'];

/** よく使う組み合わせ (設定の「読む種類」の選択肢)。読む種類を絞るほど速い (zxing は全種類 → 1 種類で約 9 倍) */
export const PRESETS: readonly Preset[] = [
  { id: 'qr', label: 'QR だけ', formats: ['qr_code'] },
  { id: 'retail', label: '商品バーコード (JAN/EAN/UPC)', formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] },
  { id: 'qr_retail', label: 'QR＋商品バーコード', formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] },
  { id: 'qr_linear', label: 'QR＋1 次元バーコード全部', formats: ['qr_code', ...LINEAR] },
  { id: 'all', label: '全部', formats: FORMATS },
];
/** 初めて開いた時のプリセット */
export const DEFAULT_PRESET_ID = 'qr_retail';

export const isFmt = (x: unknown): x is Fmt => typeof x === 'string' && x in FORMAT_INFO;

// どちらのライブラリの名前も、英数字だけにして小文字にすると、キーから '_' を抜いたものになる
// (BarcodeDetector の 'qr_code'、zxing-wasm の 'QRCode' はどちらも 'qrcode')
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_SQUASHED = new Map<string, Fmt>(FORMATS.map((f) => [squash(f), f]));

/** BarcodeDetector・zxing-wasm のどちらの名前でも、FORMAT_INFO のキーに直す (知らない種類は null) */
export const normFormat = (name: string): Fmt | null => BY_SQUASHED.get(squash(name)) ?? null;

/** 選んだ種類とちょうど同じ組み合わせのプリセット */
export function presetFor(formats: readonly Fmt[]): Preset | undefined {
  const want = new Set(formats);
  return PRESETS.find((p) => p.formats.length === want.size && p.formats.every((f) => want.has(f)));
}

/** 種類の短い名前を並べる ('EAN-13 (JAN)' → 'EAN-13') */
export const formatNames = (formats: readonly Fmt[]) => formats.map((f) => FORMAT_INFO[f].label.replace(/ \(.*\)/, '')).join(', ');
