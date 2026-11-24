import { defineConfig } from 'vitest/config';

// ビルドの結果は ../web/ に出す。Go のサーバーがそれを実行ファイルに埋め込んで配る (../main.go)
export default defineConfig({
  // zxing-wasm は WASM を自分で読み込むので、事前バンドルしない
  optimizeDeps: { exclude: ['zxing-wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: '../web', emptyOutDir: true },
  // テストは純粋な関数だけを対象にするので、ブラウザの代わり (DOM) は要らない
  // macOS が exFAT に作る ._ ファイルはテストとして拾わない
  test: { include: ['src/**/*.test.ts'], exclude: ['**/node_modules/**', '**/._*'], environment: 'node' },
});
