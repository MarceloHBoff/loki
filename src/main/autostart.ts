import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';

const LINUX_AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart');
const LINUX_AUTOSTART_FILE = path.join(LINUX_AUTOSTART_DIR, 'loki.desktop');

function buildDesktopEntry(execPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Loki Clipboard Manager',
    'Comment=Cross-platform clipboard history manager',
    `Exec=${execPath}`,
    'Icon=loki',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'StartupNotify=false',
    'Categories=Utility;',
    '',
  ].join('\n');
}

function setLinuxAutostart(enabled: boolean): void {
  if (enabled) {
    fs.mkdirSync(LINUX_AUTOSTART_DIR, { recursive: true });
    const execPath = process.env.APPIMAGE || process.execPath;
    fs.writeFileSync(LINUX_AUTOSTART_FILE, buildDesktopEntry(execPath), 'utf8');
  } else if (fs.existsSync(LINUX_AUTOSTART_FILE)) {
    fs.unlinkSync(LINUX_AUTOSTART_FILE);
  }
}

function getLinuxAutostart(): boolean {
  return fs.existsSync(LINUX_AUTOSTART_FILE);
}

export function setAutostart(enabled: boolean): void {
  if (process.platform === 'linux') {
    setLinuxAutostart(enabled);
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: true,
    args: ['--hidden'],
  });
}

export function getAutostart(): boolean {
  if (process.platform === 'linux') {
    return getLinuxAutostart();
  }
  return app.getLoginItemSettings().openAtLogin === true;
}
