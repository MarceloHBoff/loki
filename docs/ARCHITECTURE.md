# Architecture

Loki is an Electron application split across three runtime contexts:

- A **main process** that owns clipboard polling, persistence, hotkeys,
  the system tray and paste injection.
- Three **sandboxed renderer windows** (history popup, cursor preview,
  settings) implemented as independent React apps.
- A **preload script** per renderer that bridges a minimal, typed surface
  of the main process API into the renderer via Electron's
  `contextBridge`.

Everything is written in TypeScript. The build pipeline produces a single
`dist-electron/` tree containing the compiled main process, the bundled
preloads, and the Vite-built renderers — that tree is what Electron loads
at runtime and what `electron-builder` packages.

## Source layout

```
src/
├── main/                       Electron main process (tsc → CJS)
│   ├── index.ts                Entry point — wires everything together
│   ├── settings.ts             Settings persistence + change events
│   ├── history-store.ts        Capped history, dedupe, on-disk persistence
│   ├── clipboard-monitor.ts    Polls the OS clipboard, emits change events
│   ├── hotkeys.ts              Wraps Electron's globalShortcut
│   ├── windows.ts              History popup + preview toast + settings
│   ├── tray.ts                 System tray icon + context menu
│   ├── autostart.ts            Cross-platform OS autostart
│   ├── modifier-watcher.ts     uiohook-napi wrapper for chord-release detection
│   ├── paste.ts                Synthetic Ctrl+V injector (Win/Linux)
│   └── ipc.ts                  Registers IPC handlers
├── preload/                    Sandboxed preloads (esbuild bundle → CJS)
│   ├── history-preload.ts      contextBridge for history popup
│   ├── preview-preload.ts      contextBridge for preview toast
│   └── settings-preload.ts     contextBridge for settings window
├── shared/                     Types + IPC channels shared across processes
│   ├── types.ts                HistoryItem, LokiSettingsValues, KIND, …
│   └── ipc-channels.ts         CHANNELS constant
└── renderer/                   Three React apps (Vite multi-entry)
    ├── history/                App.tsx · main.tsx · index.html
    ├── preview/                App.tsx · main.tsx · index.html
    ├── settings/               App.tsx · main.tsx · index.html
    └── shared/                 Tailwind globals.css + format helpers

dist-electron/                  Build output (gitignored)
├── main/                       Compiled main process modules
├── preload/                    Self-contained preload bundles
└── renderer/{history,preview,settings}/
                                Vite-built HTML + assets/ chunks
```

## Build pipeline

Three orthogonal builds produce the runtime artefacts:

| Stage | Tool | Source | Output |
| --- | --- | --- | --- |
| `build:main` | `tsc -p tsconfig.main.json` | `src/main`, `src/shared` | `dist-electron/main/**/*.js` (+ source maps) |
| `build:preload` | `node scripts/build-preload.mjs` (esbuild) | `src/preload/*-preload.ts` | `dist-electron/preload/*-preload.js` (self-contained CJS) |
| `build:renderer` | `vite build` | `src/renderer/{history,preview,settings}/index.html` | `dist-electron/renderer/{name}/index.html` + shared `assets/` |

`npm run build:all` runs the three in order. `npm start` and `npm run dev`
chain that into `electron .`, which loads `dist-electron/main/index.js`
(the `main` field in `package.json`).

### Why preloads are bundled separately

Sandboxed renderers cannot `require()` arbitrary modules from disk — only
`electron` and a few built-ins. If a preload tried to `require('../shared/ipc-channels')`
at runtime, Chromium's sandbox would refuse and the preload would silently
fail (no `window.lokiHistory` exposed, every IPC call from the renderer
throws). Bundling the preload with esbuild inlines those imports while
keeping `electron` external, producing a single self-contained CJS file
the sandbox can load directly.

### Why renderers use Vite

The renderers need React + JSX + Tailwind + ES modules with shared chunks.
Vite's multi-entry mode produces one HTML/JS/CSS triple per entry plus a
shared `assets/` directory for the common React runtime, Tailwind CSS and
shared helpers (~140 kB gzipped chunk reused across all three windows).

Vite emits `crossorigin` on `<script>` and `<link>` tags by default. That
attribute breaks asset loading under `file://` in Electron (CORS is
impossible on the file scheme), so a small Vite plugin in
[`vite.config.ts`](../vite.config.ts) strips it from the generated HTML.

## Data flow

```
       ┌──────────────────┐    poll (every pollIntervalMs)
       │ ClipboardMonitor │◄────────────────────────────────────┐
       └─────────┬────────┘                                     │
                 │ change(payload)                              │
                 ▼                                              │
       ┌──────────────────┐                                     │
       │   HistoryStore   │── add ──► persist JSON + PNG files  │
       └─────────┬────────┘                                     │
                 │ change/cursor events                         │
                 ▼                                              │
       ┌──────────────────┐                                     │
       │   IPC (main)     │── HISTORY_UPDATED ──► renderer      │
       └─────────┬────────┘                                     │
                 ▲                                              │
                 │ invoke(HISTORY_SELECT, id)                   │
                 │                                              │
       ┌──────────────────┐                                     │
       │ Renderer (popup) │                                     │
       └──────────────────┘                                     │
                                                                │
       ┌──────────────────┐                                     │
       │ Global hotkey    │── navigate(±1) ─► HistoryStore      │
       │   handler        │── writeItemToClipboard ─────────────┘
       │                  │── windows.showPreview(item)
       │                  │── _navigating = true (auto-paste armed)
       └──────────────────┘   (suppresses next monitor echo)

       ┌──────────────────┐
       │ modifierWatcher  │── on 'release' → firePaste()
       │  (uiohook-napi)  │      ↳ SendKeys (Win) / xdotool (Linux)
       └──────────────────┘
```

### Cursor-side preview popup

When the user navigates the history with `Ctrl+Alt+↑/↓`, a transient toast
is shown next to the mouse cursor displaying the item that just became the
current clipboard contents.

- The popup is a separate `BrowserWindow` (`src/renderer/preview/`) with
  `transparent: true`, `frame: false`, `focusable: false`,
  `skipTaskbar: true`, `alwaysOnTop: true`, and `setIgnoreMouseEvents(true)`
  so it never steals focus or intercepts clicks.
- Position is recomputed every navigation via
  `screen.getCursorScreenPoint()` and clamped to the work area of the
  display under the cursor.
- The React component drives its own enter/exit transition via a small
  state machine; each new `preview:show` event resets a timer, so a burst
  of rapid navigations feels like a single sliding preview rather than
  flickering pop-ups. Main also schedules a `hide()` after the same window
  expires so the `BrowserWindow` doesn't stay mapped.
- Image items are forwarded as `data:` URLs (main reads the cached PNG and
  base64-encodes it). Text items send `preview`, `text`, kind, size and
  the `cursor / total` indicator.

### Auto-paste on chord release

The Ctrl+Alt chord doubles as a "selecting" state. While the user holds
Ctrl+Alt and taps the arrow keys, navigation events rotate the clipboard
cursor. The moment Ctrl+Alt is released, Loki interprets that as
"selection done" and pastes immediately.

```
navigate(±1)
  ├─ writeItemToClipboard(item)              ─► system clipboard
  ├─ monitor.suppressNext(hash)              ─► skip echo
  ├─ windows.showPreview(item, { … })        ─► cursor-side toast
  └─ _navigating = autoPasteEnabled && hookAvailable

modifierWatcher.on('release', info)
  └─ if (_navigating && info.allWatchedReleased)
       firePaste('modifier-release')

firePaste()
  ├─ _navigating = false                     (idempotent guard)
  ├─ windows.hidePreview()
  └─ setTimeout(40 ms) → paste.pasteCurrent()
```

There is **no fallback timer**. If the global keyboard hook can't be
installed (no prebuilt binary, Wayland, etc.), auto-paste simply does not
fire and the user pastes manually with `Ctrl+V`.

#### Key-release detection

- [`src/main/modifier-watcher.ts`](../src/main/modifier-watcher.ts) wraps
  the `uiohook-napi` native global hook. The hook is the same on Windows,
  macOS and Linux X11. On Wayland or restricted environments the module
  may fail to load — `isAvailable()` returns `false` and `navigate()`
  simply leaves `_navigating` as `false`, disabling auto-paste.
- The watcher receives every system keyup. It tracks which watched
  modifiers were down before the event and emits a `release` event when
  any of them transitions to up. The event payload has
  `allWatchedReleased: true` once the *whole* chord is up — that is the
  only state that triggers `firePaste`.
- The set of watched modifiers is derived from the union of the
  `hotkeys.previous` and `hotkeys.next` accelerators, so remapping the
  hotkeys updates the watcher automatically.

#### The paste itself

[`src/main/paste.ts`](../src/main/paste.ts) injects a synthetic `Ctrl+V`
into whichever window holds the OS keyboard focus:

- **Windows** — `powershell.exe`
  `[System.Windows.Forms.SendKeys]::SendWait('^v')`.
- **Linux (X11)** — `xdotool key --clearmodifiers ctrl+v`.
- Other platforms — no-op with a warning logged.

#### Cancellation

`firePaste()` is idempotent — it short-circuits if `_navigating` is
already `false`. The flag is cleared by:

- A successful `firePaste()`.
- `cancelAutoPaste()` — invoked when the user opens the history popup
  (`Ctrl+Shift+V` or tray click) or selects from the popup; explicit
  interaction overrides auto-paste.
- App shutdown (`cleanup()`).

Set `autoPasteEnabled` to `false` in Settings to disable auto-paste
entirely. The preview still shows, the hint reads "now on clipboard", and
the user types `Ctrl+V` manually.

## Key design decisions

### Polling vs change events

Electron's `clipboard` module does not expose a native change event on
Windows or Linux. We poll every `pollIntervalMs` (default 500 ms) and
compute a SHA-256 hash of `(kind, text, html, rtf | image bytes)`. Equal
hash → no change.

Polling cost is negligible: reading the clipboard is a cheap syscall on
both platforms, and we short-circuit on the hash compare before doing
anything else.

### Suppressing programmatic-write echoes

When the user presses `Ctrl+Alt+↓` we write the chosen history item back
to the OS clipboard. The next poll would otherwise pick this up as a "new
copy" and either promote-dedupe or insert a fresh entry. We avoid that by
passing the hash of what we just wrote to `monitor.suppressNext(hash)`.
The monitor ignores the next change matching that hash (within a 1.5 s
window, after which the suppression expires).

### Selection cursor

The history list is a stack with `items[0]` being the most recently
captured. The `cursor` index points at the "currently active" entry.
Newly captured items reset the cursor to `0`. Hotkeys move the cursor and
re-write the target item to the system clipboard, so `Ctrl+V` in any
application pastes the selected entry.

### Persistence

- **Settings** — single JSON file, atomic rename on save (`*.tmp` →
  final).
- **History metadata** — single JSON file with all items (text/html/rtf
  inline). Larger image payloads live as standalone PNGs in `images/` so
  the metadata file stays small.

When an item is removed (manually or evicted by max-size), the linked PNG
is unlinked. `clear()` removes both.

### Three React renderers, no SPA

Each window is a fully independent React entry. They share Tailwind
tokens and a few format helpers but don't share a router or store —
state is owned by the main process and pushed via IPC. This keeps
window-to-window coupling at zero and lets each window have its own CSP,
preload, and lifecycle.

### Type sharing across processes

`src/shared/` is included by both the main `tsconfig` and the renderer
`tsconfig`. Renderers `import type` from there to know the shape of IPC
payloads; preloads re-export typed API surfaces that the renderers
declare via `declare global { interface Window { lokiHistory: … } }` in
[`src/renderer/shared/preload-types.d.ts`](../src/renderer/shared/preload-types.d.ts).
No runtime cost — types are erased.

### Single instance

`app.requestSingleInstanceLock()`. A second launch triggers a
`second-instance` event in the original process, which we use to focus
the history popup.

### Autostart

- **Windows / macOS** —
  `app.setLoginItemSettings({ openAtLogin, openAsHidden, args: ['--hidden'] })`.
  `--hidden` keeps the popup from appearing at login (renderer windows
  are already created hidden by default).
- **Linux** — A `loki.desktop` file in `~/.config/autostart/`. The `Exec`
  path is the AppImage path when launched via AppImage, otherwise the
  current `process.execPath`.

### Tests

The settings, history store, clipboard monitor and modifier watcher
modules are pure logic and testable under plain Node. The clipboard
monitor depends on Electron's `clipboard` and `nativeImage` modules; we
side-load a fake `electron` module in the require cache before requiring
the source-under-test
([`tests/helpers/fake-electron.ts`](../tests/helpers/fake-electron.ts)).

Tests use `node:test` (built into Node ≥18) driven by `tsx`, which
transpiles the `.ts` sources in-process — no separate build step.

## IPC channels

| Channel | Direction | Payload | Purpose |
| --- | --- | --- | --- |
| `history:list` | renderer → main (invoke) | — | Fetch current history + cursor |
| `history:select` | renderer → main (invoke) | item id | Set cursor + write to clipboard |
| `history:remove` | renderer → main (invoke) | item id | Remove a single item |
| `history:clear` | renderer → main (invoke) | — | Wipe all items + images |
| `history:close` | renderer → main (send) | — | Hide the popup |
| `history:get-image` | renderer → main (invoke) | item id | Returns a data URL for the image |
| `history:updated` | main → renderer (send) | `{ items, cursor }` | Push update to popup |
| `settings:get` | renderer → main (invoke) | — | Fetch all settings |
| `settings:update` | renderer → main (invoke) | partial values | Merge and persist |
| `settings:reset` | renderer → main (invoke) | — | Restore defaults |
| `settings:updated` | main → renderer (send) | settings object | Push update to settings UI |
| `monitoring:toggle` | renderer → main (invoke) | — | Pause/resume capture |
| `preview:show` | main → renderer (send) | `PreviewPayload` | Drive the cursor preview toast |

The canonical list lives in
[`src/shared/ipc-channels.ts`](../src/shared/ipc-channels.ts) and is
consumed unchanged by the main process and every preload — there are no
magic strings on either side.

`contextIsolation` is enabled and `nodeIntegration` is disabled in all
renderers. The preloads expose only the channels above via
`contextBridge`.
