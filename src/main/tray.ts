import path from 'node:path';
import { Tray, Menu, nativeImage, app, type NativeImage } from 'electron';

function loadTrayIcon(): NativeImage {
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'tray-icon.png'),
    path.join(process.resourcesPath || '', 'resources', 'tray-icon.png'),
  ];
  for (const file of candidates) {
    try {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    } catch {
      /* ignore */
    }
  }
  return nativeImage.createEmpty();
}

export interface AppTrayOptions {
  onShowHistory?: () => void;
  onShowSettings?: () => void;
  onToggleMonitoring?: () => void;
  getMonitoringState?: () => boolean;
  onQuit?: () => void;
}

export class AppTray {
  private onShowHistory?: () => void;
  private onShowSettings?: () => void;
  private onToggleMonitoring?: () => void;
  private getMonitoringState?: () => boolean;
  private onQuit?: () => void;
  private tray: Tray | null;

  constructor({
    onShowHistory,
    onShowSettings,
    onToggleMonitoring,
    getMonitoringState,
    onQuit,
  }: AppTrayOptions) {
    this.onShowHistory = onShowHistory;
    this.onShowSettings = onShowSettings;
    this.onToggleMonitoring = onToggleMonitoring;
    this.getMonitoringState = getMonitoringState;
    this.onQuit = onQuit;
    this.tray = null;
  }

  init(): void {
    const icon = loadTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Loki Clipboard Manager');
    this.refreshMenu();
    this.tray.on('click', () => this.onShowHistory && this.onShowHistory());
  }

  refreshMenu(): void {
    if (!this.tray) return;
    const monitoring = this.getMonitoringState ? !!this.getMonitoringState() : true;
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show clipboard history',
        click: () => this.onShowHistory && this.onShowHistory(),
      },
      {
        label: monitoring ? 'Pause monitoring' : 'Resume monitoring',
        click: () => {
          this.onToggleMonitoring && this.onToggleMonitoring();
          this.refreshMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => this.onShowSettings && this.onShowSettings(),
      },
      { type: 'separator' },
      {
        label: 'Quit Loki',
        click: () => {
          if (this.onQuit) this.onQuit();
          else app.quit();
        },
      },
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
