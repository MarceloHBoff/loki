export const KIND = {
  TEXT: 'text',
  LINK: 'link',
  CODE: 'code',
  HTML: 'html',
  IMAGE: 'image',
  UNKNOWN: 'unknown',
} as const;

export type ClipboardKind = (typeof KIND)[keyof typeof KIND];

export interface HotkeyBindings {
  previous: string;
  next: string;
  showHistory: string;
}

export interface LokiSettingsValues {
  maxHistoryItems: number;
  monitoringEnabled: boolean;
  launchOnStartup: boolean;
  deduplicate: boolean;
  pollIntervalMs: number;
  ignorePasswordManagers: boolean;
  persistHistory: boolean;
  autoPasteEnabled: boolean;
  hotkeys: HotkeyBindings;
}

export interface HistoryItem {
  id: string;
  hash: string;
  kind: ClipboardKind;
  capturedAt: number;
  sizeBytes: number;
  preview: string;
  text: string;
  html: string;
  rtf: string;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

export interface HistoryItemView extends HistoryItem {
  selected: boolean;
}

export interface HistoryListPayload {
  items: HistoryItemView[];
  cursor: number;
}

export interface ClipboardPayload {
  kind: ClipboardKind;
  text?: string;
  html?: string;
  rtf?: string;
  imageBuffer?: Buffer;
  imageBase64?: string;
  imageBytes?: number;
  width?: number;
  height?: number;
  formats?: string[];
  hash?: string;
}

export interface PreviewPayload {
  kind: ClipboardKind;
  preview: string;
  text: string;
  sizeBytes: number;
  position?: number;
  total?: number;
  autoPasteArmed: boolean;
  imageDataUrl?: string;
}
