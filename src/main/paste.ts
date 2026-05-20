import { spawn } from 'node:child_process';

export interface PasteResult {
  ok: boolean;
  code?: number | null;
  reason?: string;
}

export function pasteCurrent(): Promise<PasteResult> {
  if (process.platform === 'win32') return pasteWin32();
  if (process.platform === 'linux') return pasteLinux();
  return Promise.resolve({ ok: false, reason: `unsupported platform: ${process.platform}` });
}

function pasteWin32(): Promise<PasteResult> {
  return new Promise((resolve) => {
    const psScript =
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, stdio: 'ignore' },
    );
    child.on('close', (code) => resolve({ ok: code === 0, code }));
    child.on('error', (err) => resolve({ ok: false, reason: err.message }));
  });
}

function pasteLinux(): Promise<PasteResult> {
  return new Promise((resolve) => {
    const child = spawn('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { stdio: 'ignore' });
    child.on('close', (code) => resolve({ ok: code === 0, code }));
    child.on('error', (err) => {
      console.error(
        '[paste] xdotool unavailable (install via `sudo apt install xdotool`):',
        err.message,
      );
      resolve({ ok: false, reason: err.message });
    });
  });
}
