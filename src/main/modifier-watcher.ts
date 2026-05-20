import { EventEmitter } from 'node:events';

type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

interface UIOhookKeyEvent {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

interface UIOhookLike {
  on(event: 'keydown' | 'keyup', handler: (e: UIOhookKeyEvent) => void): void;
  start(): void;
  stop(): void;
}

let uIOhook: UIOhookLike | null = null;
let loadError: Error | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ uIOhook } = require('uiohook-napi') as { uIOhook: UIOhookLike });
} catch (err) {
  loadError = err as Error;
}

const ALL_MODIFIERS: Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

export function parseAcceleratorModifiers(accelerator: string | null | undefined): Modifier[] {
  if (!accelerator || typeof accelerator !== 'string') return [];
  const tokens = accelerator.split('+').map((t) => t.trim().toLowerCase());
  const found = new Set<Modifier>();
  for (const token of tokens) {
    if (
      token === 'control' ||
      token === 'ctrl' ||
      token === 'commandorcontrol' ||
      token === 'cmdorctrl' ||
      token === 'cmd' ||
      token === 'command'
    ) {
      found.add(process.platform === 'darwin' && token.startsWith('cmd') ? 'meta' : 'ctrl');
    } else if (token === 'alt' || token === 'option') {
      found.add('alt');
    } else if (token === 'shift') {
      found.add('shift');
    } else if (token === 'meta' || token === 'super' || token === 'win') {
      found.add('meta');
    }
  }
  return [...found];
}

export function unionOfModifiers(accelerators: (string | null | undefined)[]): Modifier[] {
  const set = new Set<Modifier>();
  for (const accel of accelerators) {
    for (const mod of parseAcceleratorModifiers(accel)) set.add(mod);
  }
  return [...set];
}

export interface ModifierReleaseEvent {
  released: Modifier[];
  allWatchedReleased: boolean;
  state: Record<Modifier, boolean>;
}

export class ModifierWatcher extends EventEmitter {
  private _started: boolean;
  private _state: Record<Modifier, boolean>;
  private _watched: Set<Modifier>;

  constructor() {
    super();
    this._started = false;
    this._state = { ctrl: false, alt: false, shift: false, meta: false };
    this._watched = new Set();
  }

  isAvailable(): boolean {
    return !!uIOhook;
  }

  loadError(): Error | null {
    return loadError;
  }

  setWatchedAccelerators(accelerators: (string | null | undefined)[]): void {
    const mods = unionOfModifiers(accelerators);
    this._watched = new Set(mods.length > 0 ? mods : (['ctrl', 'alt'] as Modifier[]));
  }

  start(): boolean {
    if (!uIOhook || this._started) return false;
    uIOhook.on('keydown', (e) => this._onKey('down', e));
    uIOhook.on('keyup', (e) => this._onKey('up', e));
    try {
      uIOhook.start();
      this._started = true;
      return true;
    } catch (err: unknown) {
      console.error('[modifier-watcher] failed to start uIOhook:', (err as Error).message);
      return false;
    }
  }

  stop(): void {
    if (!uIOhook || !this._started) return;
    try {
      uIOhook.stop();
    } catch {
      /* ignore */
    }
    this._started = false;
  }

  private _onKey(direction: 'down' | 'up', event: UIOhookKeyEvent): void {
    if (!event) return;
    const next: Record<Modifier, boolean> = {
      ctrl: !!event.ctrlKey,
      alt: !!event.altKey,
      shift: !!event.shiftKey,
      meta: !!event.metaKey,
    };

    const releasedNow: Modifier[] = [];
    for (const mod of ALL_MODIFIERS) {
      if (this._state[mod] && !next[mod]) releasedNow.push(mod);
    }
    this._state = next;

    if (direction !== 'up' || releasedNow.length === 0) return;

    const watchedReleased = releasedNow.filter((m) => this._watched.has(m));
    if (watchedReleased.length === 0) return;

    const allWatchedReleased = [...this._watched].every((m) => !next[m]);

    const payload: ModifierReleaseEvent = {
      released: watchedReleased,
      allWatchedReleased,
      state: next,
    };
    this.emit('release', payload);
  }
}
