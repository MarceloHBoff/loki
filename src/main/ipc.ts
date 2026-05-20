import fs from 'node:fs';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { HistoryStore } from './history-store';
import type { DeepPartial, Settings } from './settings';
import type { WindowManager } from './windows';
import type { HistoryItem, LokiSettingsValues } from '../shared/types';
import { CHANNELS } from '../shared/ipc-channels';

export { CHANNELS };

export interface IpcServices {
  applyCursorToClipboard: (item: HistoryItem) => void;
  applySettingsUpdate: (partial: DeepPartial<LokiSettingsValues>) => void;
}

export interface IpcRegistrationOptions {
  historyStore: HistoryStore;
  settings: Settings;
  windows: WindowManager;
  services: IpcServices;
}

export function registerIpc({
  historyStore,
  settings,
  windows,
  services,
}: IpcRegistrationOptions): void {
  ipcMain.handle(CHANNELS.HISTORY_LIST, () => ({
    items: historyStore.list(),
    cursor: historyStore.cursor,
  }));

  ipcMain.handle(CHANNELS.HISTORY_SELECT, (_event: IpcMainInvokeEvent, id: string) => {
    const item = historyStore.selectById(id);
    if (item) {
      services.applyCursorToClipboard(item);
    }
    return item ? { ok: true, id: item.id } : { ok: false };
  });

  ipcMain.handle(CHANNELS.HISTORY_REMOVE, (_event, id: string) => historyStore.remove(id));

  ipcMain.handle(CHANNELS.HISTORY_CLEAR, () => {
    historyStore.clear();
    return true;
  });

  ipcMain.on(CHANNELS.HISTORY_CLOSE, () => {
    windows.hideHistory();
  });

  ipcMain.handle(CHANNELS.HISTORY_GET_IMAGE, (_event, id: string) => {
    const item = historyStore.items.find((it) => it.id === id);
    if (!item || !item.imagePath) return null;
    try {
      const data = fs.readFileSync(item.imagePath);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle(CHANNELS.SETTINGS_GET, () => settings.get());

  ipcMain.handle(CHANNELS.SETTINGS_UPDATE, (_event, partial: DeepPartial<LokiSettingsValues>) => {
    services.applySettingsUpdate(partial);
    return settings.get();
  });

  ipcMain.handle(CHANNELS.SETTINGS_RESET, () => {
    settings.reset();
    services.applySettingsUpdate(settings.get());
    return settings.get();
  });

  ipcMain.handle(CHANNELS.MONITORING_TOGGLE, () => {
    const enabled = !settings.get('monitoringEnabled');
    services.applySettingsUpdate({ monitoringEnabled: enabled });
    return enabled;
  });
}
