import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/ipc-channels';
import type { HistoryListPayload } from '../shared/types';

export interface LokiHistoryApi {
  list: () => Promise<HistoryListPayload>;
  select: (id: string) => Promise<{ ok: boolean; id?: string }>;
  remove: (id: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  close: () => void;
  getImage: (id: string) => Promise<string | null>;
  onUpdated: (handler: (payload: HistoryListPayload) => void) => () => void;
}

const api: LokiHistoryApi = {
  list: () => ipcRenderer.invoke(CHANNELS.HISTORY_LIST),
  select: (id) => ipcRenderer.invoke(CHANNELS.HISTORY_SELECT, id),
  remove: (id) => ipcRenderer.invoke(CHANNELS.HISTORY_REMOVE, id),
  clear: () => ipcRenderer.invoke(CHANNELS.HISTORY_CLEAR),
  close: () => ipcRenderer.send(CHANNELS.HISTORY_CLOSE),
  getImage: (id) => ipcRenderer.invoke(CHANNELS.HISTORY_GET_IMAGE, id),
  onUpdated: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: HistoryListPayload) =>
      handler(payload);
    ipcRenderer.on(CHANNELS.HISTORY_UPDATED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.HISTORY_UPDATED, listener);
  },
};

contextBridge.exposeInMainWorld('lokiHistory', api);
