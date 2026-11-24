// ビルドの前に、配布物に入れるライセンス文 (public/third-party-licenses.txt) を作る。コンテナの中で npm run build から呼ばれる。
// zxing-wasm (MIT) は中に zxing-cpp (Apache-2.0) を WASM にして含むので、両方の文面を入れる。
// Apache-2.0 の全文は、同じく Apache-2.0 の TypeScript が同梱している LICENSE.txt から取る。
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../node_modules/${p}`, import.meta.url), 'utf8').trim();
const apache = read('typescript/LICENSE.txt');
if (!apache.includes('Apache License') || !apache.includes('Version 2.0')) throw new Error('Apache-2.0 の全文が見つからない');

const parts = [
  ['zxing-wasm 3.1.6', 'MIT', 'https://github.com/Sec-ant/zxing-wasm', read('zxing-wasm/LICENSE')],
  ['zxing-cpp (zxing-wasm の中の WASM)', 'Apache-2.0', 'https://github.com/zxing-cpp/zxing-cpp', 'Copyright ZXing authors, Nu-book Inc., Axel Waggershauser and other zxing-cpp contributors\nLicensed under the Apache License, Version 2.0 (全文は下)'],
];
const out = [
  'このアプリが使っている第三者のソフトウェアとライセンス',
  '='.repeat(60),
  ...parts.map(([name, lic, url, text]) => `\n## ${name}\nライセンス: ${lic}\n${url}\n\n${text}\n`),
  `\n${'='.repeat(60)}\nApache License, Version 2.0 (全文)\n${'='.repeat(60)}\n\n${apache}\n`,
].join('\n');
writeFileSync(new URL('../public/third-party-licenses.txt', import.meta.url), out);
console.log(`ライセンス文を書いた (${out.length} 文字)`);
