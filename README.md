# Loki — Cross-platform Clipboard History Manager

Loki is a lightweight clipboard manager for Windows 10/11 and Debian-based
Linux distributions. It records every change to the system clipboard, lets you
navigate the history with global hotkeys without leaving the keyboard, and
lives quietly in the system tray.

It captures plain text, links, code snippets, formatted text (HTML / RTF) and
images, persists everything across launches, and pastes the selected entry
automatically into the focused window the moment you release the navigation
chord.

## Tech stack

- **Electron 31** — main process orchestrates clipboard polling, hotkeys,
  tray, persistence and paste injection.
- **TypeScript** — main process, preloads, renderer apps and tests.
- **React 18** + **Tailwind CSS 3** — three independent renderer windows
  (history popup, cursor-side preview toast, settings).
- **Vite 5** — multi-entry bundling for the renderers.
- **esbuild** — bundles the sandboxed preload scripts.
- **uiohook-napi** — cross-platform global keyboard hook used to detect when
  the navigation chord is released.

## Features

### Clipboard capture

- **Continuous monitoring** — Polls the OS clipboard on a configurable
  interval (default 500 ms) and records every change. Captures `Ctrl+C`,
  context-menu copy, drag-and-drop, and programmatic writes from other
  applications.
- **Multiple content types** — Plain text, links (detected by URL pattern),
  code (detected via syntactic hints), HTML, RTF and bitmap images. Each
  entry stores type, capture timestamp, byte size and a short preview.
- **Smart deduplication** — Re-copying an item already in the history
  promotes it to the top instead of duplicating it. Toggle off in Settings
  if you prefer chronological history.
- **Password-manager guard** — Heuristically skips items flagged with
  sensitive clipboard formats (KeePass, KWallet, generic
  `ConfidentialContent`, etc.). Enabled by default.

### Persistence

- **Configurable history depth** — Default 100 entries; oldest items are
  evicted when the cap is hit.
- **Images on disk** — Bitmap content is stored as PNG files in the user
  data directory; the metadata file only keeps a reference. Removing an
  entry (manually or via cap eviction) unlinks the corresponding file.
- **Atomic writes** — All persisted files are written to a `*.tmp` sibling
  and renamed into place to avoid half-written state on crash or power
  loss.
- **Toggleable** — `persistHistory: false` keeps the history in memory
  only.

### Global hotkeys

Default bindings (remap any of them in Settings):

| Hotkey | Action |
| --- | --- |
| `Ctrl+Alt+↓` | Select the previous (older) item and put it on the clipboard. |
| `Ctrl+Alt+↑` | Select the next (newer) item and put it on the clipboard. |
| `Ctrl+Shift+V` | Toggle the history popup. |

The hotkeys stay registered while the app is in the tray.

### Cursor-side preview

Every time you navigate with the hotkeys, a small, focus-stealing-free,
click-through toast appears near the mouse cursor showing the entry that just
became the current clipboard contents:

- Item type badge (TXT, LNK, CODE, HTML, IMG), position indicator
  (`3 / 100`) and size.
- Text excerpts are truncated to ~220 characters; image entries display a
  thumbnail.
- The toast auto-hides after a short timeout; rapid navigation feels like a
  single sliding preview rather than flickering pop-ups.

### Auto-paste on chord release

Holding `Ctrl+Alt` while tapping the arrow keys puts you in a *selecting*
state. The moment you release the chord, Loki sends a synthetic `Ctrl+V`
into whichever window currently has keyboard focus — the chosen entry is
pasted exactly where the caret is.

- Detection uses a native global key hook (`uiohook-napi`, bundled
  prebuilts).
- Paste injection:
  - **Windows** — PowerShell `[System.Windows.Forms.SendKeys]::SendWait('^v')`.
  - **Linux (X11)** — `xdotool key --clearmodifiers ctrl+v` (install
    `xdotool` first).
- If the native hook can't load (Wayland-only, missing prebuilt, etc.),
  auto-paste silently disables itself and you paste manually with
  `Ctrl+V`.
- Toggle off in Settings (`autoPasteEnabled: false`) if you prefer fully
  manual pasting; the cursor preview still appears.

### History popup

- Frameless, always-on-top mini-window positioned near the mouse cursor.
- Filter box for fast substring search over preview text and item kind.
- Keyboard-first: `↑/↓` move the selection, `Enter` pastes and closes,
  `Del` removes the highlighted entry, `Esc` closes.
- Click or double-click to select; `×` button on hover to remove.
- Click outside (or the tray icon) to dismiss.

### Settings window

Standalone window opened from the tray menu. Exposes:

- Capture options — enable / disable monitoring, password-manager guard,
  polling interval.
- Auto-paste toggle.
- History — maximum entries, deduplication, persistence, and a one-click
  "clear history" button.
- Startup — launch on system boot.
- Global hotkeys — text fields accepting any Electron accelerator string
  (e.g. `Control+Alt+Down`, `CommandOrControl+Shift+V`).

### System tray

The icon in the notification area exposes:

- Show clipboard history.
- Pause / resume monitoring.
- Open settings.
- Quit Loki (cleanly saves state and unregisters hotkeys).

### Autostart on boot

- **Windows** — Registers via Electron's `setLoginItemSettings`. Loki
  starts silently into the tray.
- **Linux** — Drops a `loki.desktop` entry in `~/.config/autostart/` with
  the resolved AppImage / executable path.

### Single-instance guard

Re-launching the app while it's already running focuses the existing tray
instance and shows the history popup instead of starting a second copy.

## Quick start

```bash
npm install
npm start
```

`npm start` builds the main process (TypeScript → CommonJS), bundles the
preloads (esbuild), bundles the renderers (Vite), and then launches Electron
against the compiled output in `dist-electron/`.

For an iteration loop with extra logging:

```bash
npm run dev
```

### Run the test suite

```bash
npm test
```

29 tests covering the pure-logic modules (settings, history store, clipboard
monitor, modifier watcher). They run under plain Node + `tsx` — no Electron
runtime needed, thanks to a small fake-`electron` module loader.

### Typecheck without building

```bash
npm run typecheck
```

Runs `tsc --noEmit` against all three project configs (main, renderer, tests).

## Build installers

```bash
# Windows NSIS installer (run on Windows)
npm run build:win

# Debian package + AppImage (run on Linux)
npm run build:linux
```

Output is produced in `dist/`. See [docs/BUILD.md](docs/BUILD.md) for
details on prerequisites, cross-compilation caveats and the release
workflow.

## Configuration

Settings live at:

- **Windows** — `%APPDATA%\Loki\settings.json`
- **Linux** — `~/.config/Loki/settings.json`

| Key | Default | Description |
| --- | --- | --- |
| `maxHistoryItems` | `100` | Cap on stored items. Oldest items are evicted. |
| `monitoringEnabled` | `true` | Whether clipboard polling is active. |
| `launchOnStartup` | `false` | Auto-start with the system. |
| `deduplicate` | `true` | Promote existing items to top instead of duplicating. |
| `pollIntervalMs` | `500` | Clipboard poll cadence (clamped to ≥100 ms). |
| `ignorePasswordManagers` | `true` | Skip items flagged with sensitive formats. |
| `persistHistory` | `true` | Persist history to disk between launches. |
| `autoPasteEnabled` | `true` | Auto-paste the selected item when the navigation chord is released. |
| `hotkeys.previous` | `Control+Alt+Down` | Select older item. |
| `hotkeys.next` | `Control+Alt+Up` | Select newer item. |
| `hotkeys.showHistory` | `Control+Shift+V` | Toggle history popup. |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout, IPC
channels, build pipeline, and the design decisions behind clipboard polling,
the selection cursor, and the auto-paste chord detector.

## Project layout

```
src/
├── main/         Electron main process (TypeScript → CJS)
├── preload/      Sandboxed preloads (TypeScript → bundled CJS)
├── shared/       Types + IPC channel names shared across processes
└── renderer/     Three React apps: history, preview, settings
    ├── history/      App.tsx · main.tsx · index.html
    ├── preview/      App.tsx · main.tsx · index.html
    ├── settings/     App.tsx · main.tsx · index.html
    └── shared/       Tailwind globals + format helpers
tests/            node:test suites run via tsx
scripts/          esbuild bundler for the preloads
resources/        App + tray icons consumed by electron-builder
```

## License

MIT — see [LICENSE](LICENSE).
