# Build & packaging

## Prerequisites

- Node.js ≥ 20 LTS
- npm ≥ 9
- For Windows installer builds: Windows 10/11.
- For Linux installer builds: a Debian-based host. `dpkg` and `fakeroot`
  are required for the `.deb` target; the AppImage target works on most
  modern distros without extra tooling.
- Cross-building Windows from Linux/macOS requires Wine and is not
  officially supported by this project.

## Install

```bash
npm install
```

`postinstall` runs `electron-builder install-app-deps`, which rebuilds the
bundled native module (`uiohook-napi`) against the embedded Electron
version. Re-run it explicitly if you ever swap Electron versions:

```bash
npx electron-builder install-app-deps
```

## Build pipeline

Three orthogonal stages produce the artefacts Electron loads at runtime
and that `electron-builder` packages.

| Command | Tool | What it does |
| --- | --- | --- |
| `npm run build:main` | `tsc -p tsconfig.main.json` | Compiles `src/main` + `src/shared` to `dist-electron/main/**/*.js` (CommonJS, with source maps). |
| `npm run build:preload` | `node scripts/build-preload.mjs` (esbuild) | Bundles each preload to a self-contained CJS file in `dist-electron/preload/`. `electron` stays external. |
| `npm run build:renderer` | `vite build` | Builds the three React entries into `dist-electron/renderer/{history,preview,settings}/index.html` with shared `assets/` chunks. |
| `npm run build:all` | — | Runs the three above in order. |

Source maps are emitted for every stage and follow the bundles in
`dist-electron/`.

### Typecheck only (no emit)

```bash
npm run typecheck
```

Runs `tsc --noEmit` against the three project configs:

- [`tsconfig.main.json`](../tsconfig.main.json) — main process + shared
  types.
- [`tsconfig.renderer.json`](../tsconfig.renderer.json) — renderer apps,
  preloads (for shared type surface), shared types.
- [`tsconfig.test.json`](../tsconfig.test.json) — test sources + main +
  shared.

## Run in development

```bash
npm start          # production-like
npm run dev        # adds --enable-logging
```

Both commands run `build:all` first and then launch Electron against the
compiled output. Loki opens no window on launch — it lives in the system
tray. Use `Ctrl+Shift+V` or click the tray icon to show the history
popup.

There is no Vite dev server in the loop: Electron loads the built HTML
files via `file://`, which means iteration on the renderer requires a
rebuild (`npm run build:renderer` between changes, or just re-run
`npm start`). The build is fast — Vite finishes in ≈1 s on a warm cache.

## Run the tests

```bash
npm test
```

Tests use `node:test` driven by `tsx` (TypeScript transpilation in
process). They cover the pure-logic modules (settings, history store,
clipboard monitor, modifier watcher) and do not need an Electron runtime
— a fake `electron` module is installed in the require cache before each
suite that needs it.

## Icons

The icons consumed by `electron-builder` and at runtime live in
`resources/`:

- `tray-icon.png` (16×16) and `tray-icon@2x.png` (32×32) — system tray.
- `icon.png` (256×256) — Linux app icon.
- `icon.ico` — Windows installer + window icon.

They are committed to the repo — replace the files in-place if you need
to update the artwork.

## Build installers

### Windows (NSIS)

```bash
npm run build:win
```

Runs the full build pipeline and then `electron-builder --win`. Produces
`dist/Loki Setup <version>.exe`. The NSIS installer is per-user (no admin
elevation required) and creates desktop + Start Menu shortcuts.

### Linux (DEB + AppImage)

```bash
npm run build:linux
```

Produces:

- `dist/loki_<version>_amd64.deb` — install via `sudo dpkg -i`.
- `dist/Loki-<version>.AppImage` — `chmod +x` and run directly.

### What gets packaged

The `build.files` array in [`package.json`](../package.json) ships:

- `dist-electron/**/*` — compiled main, preload bundles, renderer
  bundles.
- `resources/**/*` — icons.
- `package.json` — for `electron-builder` runtime metadata.

`node_modules/` is included by `electron-builder` defaults but pruned of
dev-only dependencies during packaging.

### Cross-platform notes

- macOS targets are intentionally disabled in `package.json` — no signing
  / notarisation pipeline is configured.
- For Wayland-only Linux sessions, global hotkeys may be unavailable and
  the `uiohook-napi` native hook used for auto-paste won't fire. Run
  under XWayland or an X11 session for full functionality.

## Releasing

A typical release workflow:

1. Bump `version` in `package.json`.
2. `npm run typecheck && npm test` — make sure everything is green.
3. `npm run build:win` on Windows, `npm run build:linux` on Linux.
4. Attach the artefacts in `dist/` to a Git tag / GitHub release.
