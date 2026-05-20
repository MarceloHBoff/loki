import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PRELOADS = ['history-preload', 'preview-preload', 'settings-preload'];

// Sandboxed renderer preloads cannot `require` non-bundled modules, so we
// bundle each entry into a single CJS file via esbuild. `electron` stays
// external because it's provided by the runtime.
await Promise.all(
  PRELOADS.map((name) =>
    build({
      entryPoints: [resolve(ROOT, 'src/preload', `${name}.ts`)],
      outfile: resolve(ROOT, 'dist-electron/preload', `${name}.js`),
      bundle: true,
      platform: 'node',
      target: 'chrome120',
      format: 'cjs',
      external: ['electron'],
      sourcemap: true,
      logLevel: 'info',
    }),
  ),
);
