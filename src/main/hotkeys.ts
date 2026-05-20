import { globalShortcut } from 'electron';

export type HotkeyHandlers = {
  previous?: () => void;
  next?: () => void;
  showHistory?: () => void;
};

export type HotkeyBindings = {
  previous?: string;
  next?: string;
  showHistory?: string;
};

export interface HotkeyFailure {
  name: string;
  accelerator: string;
}

export class HotkeyManager {
  private _registered: Map<string, () => void>;

  constructor() {
    this._registered = new Map();
  }

  apply(bindings: HotkeyBindings, handlers: HotkeyHandlers): HotkeyFailure[] {
    this.unregisterAll();
    const failures: HotkeyFailure[] = [];
    for (const [name, accelerator] of Object.entries(bindings || {}) as [
      keyof HotkeyHandlers,
      string | undefined,
    ][]) {
      const fn = handlers[name];
      if (!fn || !accelerator) continue;
      const ok = this._safeRegister(accelerator, fn);
      if (!ok) failures.push({ name, accelerator });
    }
    return failures;
  }

  private _safeRegister(accelerator: string, fn: () => void): boolean {
    try {
      const ok = globalShortcut.register(accelerator, fn);
      if (ok) this._registered.set(accelerator, fn);
      return ok;
    } catch (err: unknown) {
      console.error(
        `[hotkeys] Failed to register ${accelerator}:`,
        (err as Error).message,
      );
      return false;
    }
  }

  unregisterAll(): void {
    for (const accel of this._registered.keys()) {
      try {
        globalShortcut.unregister(accel);
      } catch {
        /* ignore */
      }
    }
    this._registered.clear();
  }

  isRegistered(accelerator: string): boolean {
    return this._registered.has(accelerator);
  }
}
