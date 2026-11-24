// 読む種類 (フォーマット)。名前は BarcodeDetector に揃え、zxing-wasm の名前との対応を持つ。
// 種類を足す時は FORMATS・FMT_LABEL・ZXING_NAME の 3 か所に書く (Record の型で、書き忘れはビルドで分かる)。

export const FORMATS = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'data_matrix', 'pdf417', 'aztec'] as const;
export type Fmt = (typeof FORMATS)[number];

export const FMT_LABEL: Record<Fmt, string> = {
  qr_code: 'QR',
  ean_13: 'EAN-13 (JAN)',
  ean_8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  code_128: 'Code128',
  code_39: 'Code39',
  code_93: 'Code93',
  codabar: 'Codabar (NW-7)',
  itf: 'ITF',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
};

/** zxing-wasm に渡す名前 */
export const ZXING_NAME: Record<Fmt, string> = {
  qr_code: 'QRCode',
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPCA',
  upc_e: 'UPCE',
  code_128: 'Code128',
  code_39: 'Code39',
  code_93: 'Code93',
  codabar: 'Codabar',
  itf: 'ITF',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
};

const LINEAR: readonly Fmt[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf'];

export interface Preset {
  id: string;
  label: string;
  formats: readonly Fmt[];
}
/** よく使う組み合わせ。読む種類を絞るほど速い (zxing は全種類 → 1 種類で約 9 倍) */
export const PRESETS: readonly Preset[] = [
  { id: 'qr', label: 'QR だけ', formats: ['qr_code'] },
  { id: 'retail', label: '商品バーコード (JAN/EAN/UPC)', formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] },
  { id: 'qr_retail', label: 'QR＋商品バーコード', formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] },
  { id: 'qr_linear', label: 'QR＋1 次元バーコード全部', formats: ['qr_code', ...LINEAR] },
  { id: 'all', label: '全部', formats: FORMATS },
];
export const DEFAULT_PRESET_ID = 'qr_retail';

export const isFmt = (x: unknown): x is Fmt => (FORMATS as readonly unknown[]).includes(x);

// どちらのライブラリの名前も、英数字だけにして小文字にすると、FORMATS の名前から '_' を抜いたものになる
// (BarcodeDetector の 'qr_code'、zxing-wasm の 'QRCode' はどちらも 'qrcode')
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const BY_SQUASHED = new Map<string, Fmt>(FORMATS.map((f) => [squash(f), f]));

/** BarcodeDetector・zxing-wasm のどちらの名前でも、FORMATS の名前に直す (知らない種類は null) */
export const normFormat = (name: string): Fmt | null => BY_SQUASHED.get(squash(name)) ?? null;

/** 選んだ種類とちょうど同じ組み合わせのプリセット */
export function presetFor(formats: readonly Fmt[]): Preset | undefined {
  const want = new Set(formats);
  return PRESETS.find((p) => p.formats.length === want.size && p.formats.every((f) => want.has(f)));
}

/** 種類の短い名前を並べる ('EAN-13 (JAN)' → 'EAN-13') */
export const formatNames = (formats: readonly Fmt[]) => formats.map((f) => FMT_LABEL[f].replace(/ \(.*\)/, '')).join(', ');
