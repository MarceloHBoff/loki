import { EventEmitter } from 'node:events';
import { clipboard, nativeImage } from 'electron';
import { detectTextKind, hashPayload } from './history-store';
import { KIND, type ClipboardPayload, type HistoryItem } from '../shared/types';

const SENSITIVE_HINT_FORMATS = [
  'org.kde.kwallet',
  'application/x-kde-password',
  'application/x-keepass',
  'application/x-clipboard-secret',
  'ConfidentialContent',
];

function looksLikeSecret(formats: string[]): boolean {
  if (!Array.isArray(formats)) return false;
  return formats.some((fmt) =>
    SENSITIVE_HINT_FORMATS.some((needle) => fmt.toLowerCase().includes(needle.toLowerCase())),
  );
}

export interface ClipboardMonitorOptions {
  intervalMs?: number;
}

export class ClipboardMonitor extends EventEmitter {
  intervalMs: number;
  private _timer: NodeJS.Timeout | null;
  private _lastHash: string | null;
  private _enabled: boolean;
  private _suppressHash: string | null;
  private _suppressUntil: number;
  private _ignoreSecrets: boolean;

  constructor({ intervalMs = 500 }: ClipboardMonitorOptions = {}) {
    super();
    this.intervalMs = intervalMs;
    this._timer = null;
    this._lastHash = null;
    this._enabled = true;
    this._suppressHash = null;
    this._suppressUntil = 0;
    this._ignoreSecrets = true;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = !!enabled;
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = Math.max(100, Math.floor(intervalMs));
    if (this._timer) {
      this.stop();
      this.start();
    }
  }

  setIgnoreSecrets(enabled: boolean): void {
    this._ignoreSecrets = !!enabled;
  }

  suppressNext(hash: string, windowMs = 1500): void {
    this._suppressHash = hash;
    this._suppressUntil = Date.now() + windowMs;
    this._lastHash = hash;
  }

  start(): void {
    if (this._timer) return;
    try {
      const payload = this._readClipboard();
      if (payload) this._lastHash = hashPayload(payload);
    } catch {
      /* ignore */
    }

    this._timer = setInterval(() => this._poll(), this.intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  forceCheck(): void {
    this._poll();
  }

  private _poll(): void {
    if (!this._enabled) return;
    let payload: ClipboardPayload | null;
    try {
      payload = this._readClipboard();
    } catch (err) {
      this.emit('error', err);
      return;
    }
    if (!payload) return;

    const hash = hashPayload(payload);
    if (hash === this._lastHash) return;

    const now = Date.now();
    if (this._suppressHash === hash && now < this._suppressUntil) {
      this._lastHash = hash;
      this._suppressHash = null;
      return;
    }

    this._lastHash = hash;
    payload.hash = hash;
    this.emit('change', payload);
  }

  private _readClipboard(): ClipboardPayload | null {
    let formats: string[] = [];
    try {
      formats = clipboard.availableFormats() || [];
    } catch {
      formats = [];
    }

    if (this._ignoreSecrets && looksLikeSecret(formats)) {
      return null;
    }

    const image = clipboard.readImage();
    if (image && !image.isEmpty()) {
      const buffer = image.toPNG();
      const size = image.getSize();
      return {
        kind: KIND.IMAGE,
        imageBuffer: buffer,
        imageBytes: buffer.length,
        width: size.width,
        height: size.height,
        formats,
      };
    }

    let text = '';
    let html = '';
    let rtf = '';
    try {
      text = clipboard.readText() || '';
    } catch {
      /* ignore */
    }
    try {
      html = clipboard.readHTML() || '';
    } catch {
      /* ignore */
    }
    try {
      rtf = clipboard.readRTF() || '';
    } catch {
      /* ignore */
    }

    if (!text && !html && !rtf) {
      if (formats.length === 0) return null;
      return { kind: KIND.UNKNOWN, text: '', html: '', rtf: '', formats };
    }

    const kind = text ? detectTextKind(text) : html ? KIND.HTML : KIND.TEXT;
    return { kind, text, html, rtf, formats };
  }
}

export function writeItemToClipboard(item: HistoryItem | null): string | null {
  if (!item) return null;
  if (item.kind === KIND.IMAGE && item.imagePath) {
    const img = nativeImage.createFromPath(item.imagePath);
    if (!img.isEmpty()) {
      clipboard.writeImage(img);
      return hashPayload({ kind: KIND.IMAGE, imageBuffer: img.toPNG() });
    }
  }
  const text = item.text || '';
  const html = item.html || '';
  const rtf = item.rtf || '';
  if (html || rtf) {
    const payload: { text?: string; html?: string; rtf?: string } = {};
    if (text) payload.text = text;
    if (html) payload.html = html;
    if (rtf) payload.rtf = rtf;
    clipboard.write(payload);
  } else {
    clipboard.writeText(text);
  }
  return hashPayload({ kind: item.kind, text, html, rtf });
}
