import type { LokiHistoryApi } from '../../preload/history-preload';
import type { LokiPreviewApi } from '../../preload/preview-preload';
import type { LokiSettingsApi } from '../../preload/settings-preload';

declare global {
  interface Window {
    lokiHistory: LokiHistoryApi;
    lokiPreview: LokiPreviewApi;
    lokiSettings: LokiSettingsApi;
  }
}

export {};
