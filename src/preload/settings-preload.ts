import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/ipc-channels';
import type { LokiSettingsValues } from '../shared/types';

export type DeepPartialSettings = {
  [K in keyof LokiSettingsValues]?: LokiSettingsValues[K] extends object
    ? { [J in keyof LokiSettingsValues[K]]?: LokiSettingsValues[K][J] }
    : LokiSettingsValues[K];
};

export interface LokiSettingsApi {
  get: () => Promise<LokiSettingsValues>;
  update: (partial: DeepPartialSettings) => Promise<LokiSettingsValues>;
  reset: () => Promise<LokiSettingsValues>;
  toggleMonitoring: () => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  onUpdated: (handler: (values: LokiSettingsValues) => void) => () => void;
}

const api: LokiSettingsApi = {
  get: () => ipcRenderer.invoke(CHANNELS.SETTINGS_GET),
  update: (partial) => ipcRenderer.invoke(CHANNELS.SETTINGS_UPDATE, partial),
  reset: () => ipcRenderer.invoke(CHANNELS.SETTINGS_RESET),
  toggleMonitoring: () => ipcRenderer.invoke(CHANNELS.MONITORING_TOGGLE),
  clearHistory: () => ipcRenderer.invoke(CHANNELS.HISTORY_CLEAR),
  onUpdated: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: LokiSettingsValues) =>
      handler(payload);
    ipcRenderer.on(CHANNELS.SETTINGS_UPDATED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.SETTINGS_UPDATED, listener);
  },
};

contextBridge.exposeInMainWorld('lokiSettings', api);
