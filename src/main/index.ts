import path from 'node:path';
import { app, dialog } from 'electron';

import { Settings, type DeepPartial } from './settings';
import { HistoryStore } from './history-store';
import { ClipboardMonitor, writeItemToClipboard } from './clipboard-monitor';
import { HotkeyManager } from './hotkeys';
import { WindowManager } from './windows';
import { AppTray } from './tray';
import { setAutostart } from './autostart';
import { registerIpc } from './ipc';
import { pasteCurrent } from './paste';
import { ModifierWatcher, type ModifierReleaseEvent } from './modifier-watcher';
import { CHANNELS } from '../shared/ipc-channels';
import type { ClipboardPayload, HistoryItem, LokiSettingsValues } from '../shared/types';

interface AppState {
  settings: Settings | null;
  history: HistoryStore | null;
  monitor: ClipboardMonitor | null;
  hotkeys: HotkeyManager | null;
  windows: WindowManager | null;
  tray: AppTray | null;
  modifierWatcher: ModifierWatcher | null;
}

const state: AppState = {
  settings: null,
  history: null,
  monitor: null,
  hotkeys: null,
  windows: null,
  tray: null,
  modifierWatcher: null,
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (state.windows) state.windows.showHistory();
  });
}

app.on('window-all-closed', () => {
  // Subscribing without quitting keeps the app alive in the tray.
});

function paths() {
  const userData = app.getPath('userData');
  return {
    settingsFile: path.join(userData, 'settings.json'),
    historyFile: path.join(userData, 'history.json'),
    imageDir: path.join(userData, 'images'),
  };
}

function applyHotkeys(): void {
  if (!state.settings || !state.hotkeys || !state.windows) return;
  const bindings = state.settings.get('hotkeys');
  const failures = state.hotkeys.apply(bindings, {
    previous: () => navigate(+1),
    next: () => navigate(-1),
    showHistory: () => {
      cancelAutoPaste();
      state.windows?.toggleHistory();
    },
  });
  if (failures.length > 0) {
    console.warn('[loki] Some hotkeys failed to register:', failures);
  }
  if (state.modifierWatcher) {
    state.modifierWatcher.setWatchedAccelerators([bindings.previous, bindings.next]);
  }
}

let _navigating = false;

function cancelAutoPaste(): void {
  _navigating = false;
}

function firePaste(trigger: string): void {
  if (!_navigating) return;
  _navigating = false;
  state.windows?.hidePreview();
  setTimeout(async () => {
    try {
      await pasteCurrent();
    } catch (err: unknown) {
      console.error(`[loki] auto-paste failed (trigger=${trigger}):`, err);
    }
  }, 40);
}

function navigate(delta: number): void {
  if (!state.history || !state.monitor || !state.windows || !state.settings) return;
  const item = state.history.moveCursor(delta);
  if (!item) return;
  const hash = writeItemToClipboard(item);
  if (hash) state.monitor.suppressNext(hash);
  state.windows.notifyHistory(CHANNELS.HISTORY_UPDATED, {
    items: state.history.list(),
    cursor: state.history.cursor,
  });
  const autoPasteEnabled = !!state.settings.get('autoPasteEnabled');
  const watcherAvailable = !!(state.modifierWatcher && state.modifierWatcher.isAvailable());
  state.windows.showPreview(item, {
    position: state.history.cursor,
    total: state.history.items.length,
    autoPasteArmed: autoPasteEnabled && watcherAvailable,
  });
  _navigating = autoPasteEnabled && watcherAvailable;
}

function applyCursorToClipboard(item: HistoryItem): void {
  cancelAutoPaste();
  const hash = writeItemToClipboard(item);
  if (hash) state.monitor?.suppressNext(hash);
}

function applySettingsUpdate(partial: DeepPartial<LokiSettingsValues>): void {
  if (!state.settings || !state.history || !state.monitor || !state.windows) return;
  const prev = state.settings.get();
  const next = state.settings.update(partial);

  if (partial.maxHistoryItems !== undefined) {
    state.history.setMaxItems(next.maxHistoryItems);
  }
  if (partial.deduplicate !== undefined) {
    state.history.setDeduplicate(next.deduplicate);
  }
  if (partial.persistHistory !== undefined) {
    state.history.setPersist(next.persistHistory);
  }
  if (partial.pollIntervalMs !== undefined) {
    state.monitor.setInterval(next.pollIntervalMs);
  }
  if (partial.ignorePasswordManagers !== undefined) {
    state.monitor.setIgnoreSecrets(next.ignorePasswordManagers);
  }
  if (partial.monitoringEnabled !== undefined) {
    state.monitor.setEnabled(next.monitoringEnabled);
    if (state.tray) state.tray.refreshMenu();
  }
  if (partial.hotkeys !== undefined) {
    applyHotkeys();
  }
  if (
    partial.launchOnStartup !== undefined &&
    partial.launchOnStartup !== prev.launchOnStartup
  ) {
    try {
      setAutostart(next.launchOnStartup);
    } catch (err: unknown) {
      console.error('[loki] Failed to set autostart:', (err as Error).message);
    }
  }

  state.windows.notifySettings(CHANNELS.SETTINGS_UPDATED, next);
}

async function bootstrap(): Promise<void> {
  const p = paths();
  state.settings = new Settings({ filePath: p.settingsFile });
  state.settings.load();

  state.history = new HistoryStore({
    filePath: p.historyFile,
    imageDir: p.imageDir,
    maxItems: state.settings.get('maxHistoryItems'),
    deduplicate: state.settings.get('deduplicate'),
    persist: state.settings.get('persistHistory'),
  });
  state.history.load();

  state.monitor = new ClipboardMonitor({
    intervalMs: state.settings.get('pollIntervalMs'),
  });
  state.monitor.setEnabled(state.settings.get('monitoringEnabled'));
  state.monitor.setIgnoreSecrets(state.settings.get('ignorePasswordManagers'));
  state.monitor.on('change', (payload: ClipboardPayload) => {
    const item = state.history?.add(payload);
    if (item) {
      state.windows?.notifyHistory(CHANNELS.HISTORY_UPDATED, {
        items: state.history?.list(),
        cursor: state.history?.cursor,
      });
    }
  });
  state.monitor.on('error', (err: Error) => {
    console.error('[clipboard] error:', err.message);
  });

  state.hotkeys = new HotkeyManager();
  state.windows = new WindowManager();
  state.modifierWatcher = new ModifierWatcher();
  if (state.modifierWatcher.isAvailable()) {
    state.modifierWatcher.on('release', (info: ModifierReleaseEvent) => {
      if (!_navigating) return;
      if (info.allWatchedReleased) firePaste('modifier-release');
    });
    const ok = state.modifierWatcher.start();
    if (!ok) {
      console.warn(
        '[loki] modifier watcher could not start — falling back to timer-only auto-paste',
      );
    }
  } else {
    const err = state.modifierWatcher.loadError();
    console.warn(
      '[loki] uiohook-napi unavailable — auto-paste uses the fallback timer only.',
      err ? err.message : '',
    );
  }
  state.tray = new AppTray({
    onShowHistory: () => {
      cancelAutoPaste();
      state.windows?.showHistory();
    },
    onShowSettings: () => state.windows?.showSettings(),
    onToggleMonitoring: () => {
      applySettingsUpdate({ monitoringEnabled: !state.settings?.get('monitoringEnabled') });
    },
    getMonitoringState: () => !!state.settings?.get('monitoringEnabled'),
    onQuit: () => {
      cleanup();
      app.exit(0);
    },
  });
  state.tray.init();

  registerIpc({
    historyStore: state.history,
    settings: state.settings,
    windows: state.windows,
    services: { applyCursorToClipboard, applySettingsUpdate },
  });

  applyHotkeys();
  state.monitor.start();

  try {
    setAutostart(state.settings.get('launchOnStartup'));
  } catch (err: unknown) {
    console.error('[loki] Could not apply autostart on launch:', (err as Error).message);
  }
}

function cleanup(): void {
  try {
    cancelAutoPaste();
  } catch {
    /* ignore */
  }
  try {
    state.modifierWatcher && state.modifierWatcher.stop();
  } catch {
    /* ignore */
  }
  try {
    state.monitor && state.monitor.stop();
  } catch {
    /* ignore */
  }
  try {
    state.hotkeys && state.hotkeys.unregisterAll();
  } catch {
    /* ignore */
  }
  try {
    state.history && state.history.saveSync();
  } catch {
    /* ignore */
  }
  try {
    state.settings && state.settings.saveSync();
  } catch {
    /* ignore */
  }
  try {
    state.tray && state.tray.destroy();
  } catch {
    /* ignore */
  }
}

app.whenReady()
  .then(bootstrap)
  .catch((err: unknown) => {
    const stack = err && (err as Error).stack ? (err as Error).stack : String(err);
    dialog.showErrorBox('Loki failed to start', stack as string);
    app.exit(1);
  });

app.on('will-quit', cleanup);

process.on('uncaughtException', (err) => {
  console.error('[loki] uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[loki] unhandledRejection:', err);
});
