import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, screen, nativeImage, type NativeImage } from 'electron';
import type { HistoryItem, PreviewPayload } from '../shared/types';
import { CHANNELS } from '../shared/ipc-channels';

function loadAppIcon(): NativeImage | undefined {
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', 'resources', 'icon.png'),
  ];
  for (const file of candidates) {
    try {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

const APP_ICON = loadAppIcon();

const HISTORY_WIDTH = 420;
const HISTORY_HEIGHT = 520;
const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 130;
const PREVIEW_HIDE_AFTER_MS = 1800;

// Paths resolve from dist-electron/main/windows.js at runtime.
const PRELOAD_DIR = path.join(__dirname, '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

export interface PreviewContext {
  position?: number;
  total?: number;
  autoPasteArmed?: boolean;
}

export class WindowManager {
  history: BrowserWindow | null;
  settings: BrowserWindow | null;
  preview: BrowserWindow | null;
  private _previewHideTimer: NodeJS.Timeout | null;

  constructor() {
    this.history = null;
    this.settings = null;
    this.preview = null;
    this._previewHideTimer = null;
  }

  private _createHistoryWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: HISTORY_WIDTH,
      height: HISTORY_HEIGHT,
      show: false,
      frame: false,
      transparent: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: '#1c1f24',
      webPreferences: {
        preload: path.join(PRELOAD_DIR, 'history-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(RENDERER_DIR, 'history', 'index.html'));
    win.on('blur', () => {
      if (!win.webContents.isDevToolsOpened()) win.hide();
    });
    win.on('closed', () => {
      this.history = null;
    });
    return win;
  }

  showHistory(): void {
    if (!this.history || this.history.isDestroyed()) {
      this.history = this._createHistoryWindow();
    }
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    const winX = Math.min(
      x + width - HISTORY_WIDTH - 16,
      Math.max(x + 16, cursor.x - HISTORY_WIDTH / 2),
    );
    const winY = Math.min(y + height - HISTORY_HEIGHT - 16, Math.max(y + 16, cursor.y - 40));
    this.history.setPosition(Math.round(winX), Math.round(winY));
    this.history.show();
    this.history.focus();
  }

  hideHistory(): void {
    if (this.history && !this.history.isDestroyed()) this.history.hide();
  }

  toggleHistory(): void {
    if (this.history && !this.history.isDestroyed() && this.history.isVisible()) {
      this.history.hide();
    } else {
      this.showHistory();
    }
  }

  isHistoryVisible(): boolean {
    return !!(this.history && !this.history.isDestroyed() && this.history.isVisible());
  }

  notifyHistory(channel: string, payload: unknown): void {
    if (this.history && !this.history.isDestroyed()) {
      this.history.webContents.send(channel, payload);
    }
  }

  private _createSettingsWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 560,
      height: 620,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#1c1f24',
      title: 'Loki settings',
      icon: APP_ICON,
      webPreferences: {
        preload: path.join(PRELOAD_DIR, 'settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(RENDERER_DIR, 'settings', 'index.html'));
    win.on('closed', () => {
      this.settings = null;
    });
    return win;
  }

  showSettings(): void {
    if (!this.settings || this.settings.isDestroyed()) {
      this.settings = this._createSettingsWindow();
    }
    this.settings.show();
    this.settings.focus();
  }

  notifySettings(channel: string, payload: unknown): void {
    if (this.settings && !this.settings.isDestroyed()) {
      this.settings.webContents.send(channel, payload);
    }
  }

  private _createPreviewWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      fullscreenable: false,
      acceptFirstMouse: false,
      webPreferences: {
        preload: path.join(PRELOAD_DIR, 'preview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: false });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(RENDERER_DIR, 'preview', 'index.html'));
    win.on('closed', () => {
      this.preview = null;
    });
    return win;
  }

  showPreview(item: HistoryItem | null, context: PreviewContext = {}): void {
    if (!item) return;
    if (!this.preview || this.preview.isDestroyed()) {
      this.preview = this._createPreviewWindow();
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    const px = Math.min(
      x + width - PREVIEW_WIDTH - 12,
      Math.max(x + 12, cursor.x + 18),
    );
    const py = Math.min(
      y + height - PREVIEW_HEIGHT - 12,
      Math.max(y + 12, cursor.y + 18),
    );
    this.preview.setPosition(Math.round(px), Math.round(py));

    const payload: PreviewPayload = {
      kind: item.kind,
      preview: item.preview,
      text: item.text,
      sizeBytes: item.sizeBytes,
      position: context.position,
      total: context.total,
      autoPasteArmed: !!context.autoPasteArmed,
    };
    if (item.kind === 'image' && item.imagePath) {
      try {
        const data = fs.readFileSync(item.imagePath);
        payload.imageDataUrl = `data:image/png;base64,${data.toString('base64')}`;
      } catch {
        /* ignore */
      }
    }

    const previewWin = this.preview;
    const send = () => {
      if (previewWin && !previewWin.isDestroyed()) {
        previewWin.webContents.send(CHANNELS.PREVIEW_SHOW, payload);
      }
    };

    if (previewWin.webContents.isLoading()) {
      previewWin.webContents.once('did-finish-load', send);
    } else {
      send();
    }

    if (!previewWin.isVisible()) previewWin.showInactive();

    if (this._previewHideTimer) clearTimeout(this._previewHideTimer);
    this._previewHideTimer = setTimeout(() => {
      if (previewWin && !previewWin.isDestroyed()) previewWin.hide();
    }, PREVIEW_HIDE_AFTER_MS);
  }

  hidePreview(): void {
    if (this._previewHideTimer) {
      clearTimeout(this._previewHideTimer);
      this._previewHideTimer = null;
    }
    if (this.preview && !this.preview.isDestroyed()) this.preview.hide();
  }
}
