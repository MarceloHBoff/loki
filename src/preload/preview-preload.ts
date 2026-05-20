import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/ipc-channels';
import type { PreviewPayload } from '../shared/types';

export interface LokiPreviewApi {
  onShow: (handler: (payload: PreviewPayload) => void) => () => void;
}

const api: LokiPreviewApi = {
  onShow: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: PreviewPayload) =>
      handler(payload);
    ipcRenderer.on(CHANNELS.PREVIEW_SHOW, listener);
    return () => ipcRenderer.removeListener(CHANNELS.PREVIEW_SHOW, listener);
  },
};

contextBridge.exposeInMainWorld('lokiPreview', api);
