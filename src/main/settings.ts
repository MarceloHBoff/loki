import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { LokiSettingsValues } from '../shared/types';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DEFAULT_SETTINGS: Readonly<LokiSettingsValues> = Object.freeze({
  maxHistoryItems: 100,
  monitoringEnabled: true,
  launchOnStartup: false,
  deduplicate: true,
  pollIntervalMs: 500,
  ignorePasswordManagers: true,
  persistHistory: true,
  autoPasteEnabled: true,
  hotkeys: {
    previous: 'Control+Alt+Down',
    next: 'Control+Alt+Up',
    showHistory: 'Control+Shift+V',
  },
});

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeDefaults<T extends Record<string, unknown>>(base: T, override: unknown): T {
  const result = deepClone(base);
  if (!override || typeof override !== 'object') return result;
  const ovr = override as Record<string, unknown>;
  for (const key of Object.keys(ovr)) {
    const ov = ovr[key];
    const baseVal = (result as Record<string, unknown>)[key];
    if (
      ov &&
      typeof ov === 'object' &&
      !Array.isArray(ov) &&
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      (result as Record<string, unknown>)[key] = mergeDefaults(
        baseVal as Record<string, unknown>,
        ov,
      );
    } else if (ov !== undefined) {
      (result as Record<string, unknown>)[key] = ov;
    }
  }
  return result;
}

export interface SettingsOptions {
  filePath: string;
}

export class Settings extends EventEmitter {
  private readonly filePath: string;
  private values: LokiSettingsValues;
  private _writeTimer: NodeJS.Timeout | null = null;

  constructor({ filePath }: SettingsOptions) {
    super();
    this.filePath = filePath;
    this.values = deepClone(DEFAULT_SETTINGS) as LokiSettingsValues;
  }

  load(): LokiSettingsValues {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.values = mergeDefaults(
        DEFAULT_SETTINGS as unknown as Record<string, unknown>,
        parsed,
      ) as unknown as LokiSettingsValues;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (err && code !== 'ENOENT') {
        console.error('[settings] Failed to load, using defaults:', (err as Error).message);
      }
      this.values = deepClone(DEFAULT_SETTINGS) as LokiSettingsValues;
    }
    return this.values;
  }

  get(): LokiSettingsValues;
  get<K extends keyof LokiSettingsValues>(key: K): LokiSettingsValues[K];
  get<K extends keyof LokiSettingsValues>(key?: K): LokiSettingsValues | LokiSettingsValues[K] {
    if (key === undefined) return deepClone(this.values);
    return deepClone(this.values[key]) as LokiSettingsValues[K];
  }

  set<K extends keyof LokiSettingsValues>(key: K, value: LokiSettingsValues[K]): LokiSettingsValues[K] {
    const prev = this.values[key];
    this.values[key] = value;
    this._scheduleSave();
    this.emit('change', { key, value, previous: prev });
    return value;
  }

  update(partial: DeepPartial<LokiSettingsValues>): LokiSettingsValues {
    const merged = mergeDefaults(
      this.values as unknown as Record<string, unknown>,
      partial,
    ) as unknown as LokiSettingsValues;
    const changed: Partial<LokiSettingsValues> = {};
    for (const key of Object.keys(merged) as (keyof LokiSettingsValues)[]) {
      if (JSON.stringify(merged[key]) !== JSON.stringify(this.values[key])) {
        (changed as Record<string, unknown>)[key] = merged[key];
      }
    }
    this.values = merged;
    if (Object.keys(changed).length > 0) {
      this._scheduleSave();
      this.emit('update', { changed, values: deepClone(this.values) });
    }
    return this.values;
  }

  reset(): void {
    this.values = deepClone(DEFAULT_SETTINGS) as LokiSettingsValues;
    this._scheduleSave();
    this.emit('update', { reset: true, values: deepClone(this.values) });
  }

  private _scheduleSave(): void {
    if (this._writeTimer) clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => this.saveSync(), 100);
  }

  saveSync(): void {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}
