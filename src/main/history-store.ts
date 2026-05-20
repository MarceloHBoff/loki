import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  KIND,
  type ClipboardKind,
  type ClipboardPayload,
  type HistoryItem,
  type HistoryItemView,
} from '../shared/types';

export { KIND };
export type { ClipboardKind, HistoryItem };

const URL_REGEX = /^(https?:\/\/|ftp:\/\/|www\.)\S+$/i;
const CODE_HINT_REGEX = /(\bfunction\b|\bclass\b|=>|\{\s*$|;\s*$|\bdef\b|\bimport\b|^\s*#include)/m;
const MAX_PREVIEW_LENGTH = 280;

export function detectTextKind(text: string): ClipboardKind {
  const trimmed = text.trim();
  if (!trimmed) return KIND.TEXT;
  if (URL_REGEX.test(trimmed) && !/\s/.test(trimmed)) return KIND.LINK;
  if (trimmed.length > 24 && CODE_HINT_REGEX.test(trimmed)) return KIND.CODE;
  return KIND.TEXT;
}

export function buildPreview(text: string): string {
  if (!text) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_PREVIEW_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}

function approxByteSize(payload: ClipboardPayload): number {
  if (!payload) return 0;
  if (payload.kind === KIND.IMAGE) {
    return payload.imageBytes || 0;
  }
  const text = payload.text || '';
  const html = payload.html || '';
  const rtf = payload.rtf || '';
  return (
    Buffer.byteLength(text, 'utf8') +
    Buffer.byteLength(html, 'utf8') +
    Buffer.byteLength(rtf, 'utf8')
  );
}

export function hashPayload(payload: ClipboardPayload): string {
  const hasher = crypto.createHash('sha256');
  hasher.update(payload.kind || '');
  if (payload.kind === KIND.IMAGE) {
    if (payload.imageBuffer) hasher.update(payload.imageBuffer);
    else if (payload.imageBase64) hasher.update(payload.imageBase64, 'base64');
  } else {
    hasher.update(payload.text || '');
    hasher.update(' ');
    hasher.update(payload.html || '');
    hasher.update(' ');
    hasher.update(payload.rtf || '');
  }
  return hasher.digest('hex');
}

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export interface HistoryStoreOptions {
  filePath: string;
  imageDir: string;
  maxItems?: number;
  deduplicate?: boolean;
  persist?: boolean;
}

export class HistoryStore extends EventEmitter {
  filePath: string;
  imageDir: string;
  maxItems: number;
  deduplicate: boolean;
  persist: boolean;
  items: HistoryItem[];
  cursor: number;
  private _writeTimer: NodeJS.Timeout | null;

  constructor({
    filePath,
    imageDir,
    maxItems = 100,
    deduplicate = true,
    persist = true,
  }: HistoryStoreOptions) {
    super();
    this.filePath = filePath;
    this.imageDir = imageDir;
    this.maxItems = maxItems;
    this.deduplicate = deduplicate;
    this.persist = persist;
    this.items = [];
    this.cursor = -1;
    this._writeTimer = null;
  }

  setMaxItems(maxItems: number): void {
    this.maxItems = Math.max(1, Math.floor(maxItems));
    if (this.items.length > this.maxItems) {
      this.items.length = this.maxItems;
      if (this.cursor >= this.items.length) {
        this.cursor = this.items.length - 1;
      }
      this._scheduleSave();
      this.emit('change', { reason: 'trim' });
    }
  }

  setDeduplicate(enabled: boolean): void {
    this.deduplicate = !!enabled;
  }

  setPersist(enabled: boolean): void {
    this.persist = !!enabled;
  }

  load(): void {
    if (!this.persist) {
      this.items = [];
      this.cursor = -1;
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as { items?: unknown };
      if (Array.isArray(parsed.items)) {
        this.items = (parsed.items as HistoryItem[])
          .filter((it) => it && typeof it === 'object')
          .slice(0, this.maxItems);
      }
      this.cursor = this.items.length > 0 ? 0 : -1;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (err && code !== 'ENOENT') {
        console.error('[history] Failed to load, starting empty:', (err as Error).message);
      }
      this.items = [];
      this.cursor = -1;
    }
  }

  list(): HistoryItemView[] {
    return this.items.map((item, idx) => ({
      ...item,
      selected: idx === this.cursor,
    }));
  }

  getCursorItem(): HistoryItem | null {
    if (this.cursor < 0 || this.cursor >= this.items.length) return null;
    return this.items[this.cursor];
  }

  setCursor(index: number): HistoryItem | null {
    if (this.items.length === 0) {
      this.cursor = -1;
      return null;
    }
    const clamped = Math.max(0, Math.min(this.items.length - 1, index));
    if (clamped !== this.cursor) {
      this.cursor = clamped;
      this.emit('cursor', { cursor: this.cursor, item: this.items[this.cursor] });
    }
    return this.items[this.cursor];
  }

  moveCursor(delta: number): HistoryItem | null {
    if (this.items.length === 0) return null;
    return this.setCursor(this.cursor + delta);
  }

  selectById(id: string): HistoryItem | null {
    const idx = this.items.findIndex((it) => it.id === id);
    if (idx === -1) return null;
    return this.setCursor(idx);
  }

  add(payload: ClipboardPayload): HistoryItem | null {
    if (!payload || !payload.kind) return null;
    const hash = hashPayload(payload);

    if (this.deduplicate && this.items.length > 0) {
      const existingIdx = this.items.findIndex((it) => it.hash === hash);
      if (existingIdx !== -1) {
        const [existing] = this.items.splice(existingIdx, 1);
        existing.capturedAt = Date.now();
        this.items.unshift(existing);
        this.cursor = 0;
        this._scheduleSave();
        this.emit('change', { reason: 'promote', item: existing });
        return existing;
      }
    }

    const item: HistoryItem = {
      id: generateId(),
      hash,
      kind: payload.kind,
      capturedAt: Date.now(),
      sizeBytes: approxByteSize(payload),
      preview:
        payload.kind === KIND.IMAGE
          ? `${payload.width || 0}x${payload.height || 0} image`
          : buildPreview(payload.text || payload.html || payload.rtf || ''),
      text: payload.kind === KIND.IMAGE ? '' : payload.text || '',
      html: payload.html || '',
      rtf: payload.rtf || '',
      imagePath: null,
      imageWidth: payload.width ?? null,
      imageHeight: payload.height ?? null,
    };

    if (payload.kind === KIND.IMAGE && payload.imageBuffer) {
      try {
        fs.mkdirSync(this.imageDir, { recursive: true });
        const filename = `${item.id}.png`;
        const dest = path.join(this.imageDir, filename);
        fs.writeFileSync(dest, payload.imageBuffer);
        item.imagePath = dest;
        item.sizeBytes = payload.imageBuffer.length;
      } catch (err: unknown) {
        console.error('[history] Failed to save image:', (err as Error).message);
      }
    }

    this.items.unshift(item);
    if (this.items.length > this.maxItems) {
      const removed = this.items.splice(this.maxItems);
      for (const r of removed) {
        if (r.imagePath) {
          try {
            fs.unlinkSync(r.imagePath);
          } catch {
            /* ignore */
          }
        }
      }
    }
    this.cursor = 0;
    this._scheduleSave();
    this.emit('change', { reason: 'add', item });
    return item;
  }

  remove(id: string): boolean {
    const idx = this.items.findIndex((it) => it.id === id);
    if (idx === -1) return false;
    const [removed] = this.items.splice(idx, 1);
    if (removed.imagePath) {
      try {
        fs.unlinkSync(removed.imagePath);
      } catch {
        /* ignore */
      }
    }
    if (this.items.length === 0) this.cursor = -1;
    else if (this.cursor >= this.items.length) this.cursor = this.items.length - 1;
    this._scheduleSave();
    this.emit('change', { reason: 'remove', id });
    return true;
  }

  clear(): void {
    for (const it of this.items) {
      if (it.imagePath) {
        try {
          fs.unlinkSync(it.imagePath);
        } catch {
          /* ignore */
        }
      }
    }
    this.items = [];
    this.cursor = -1;
    this._scheduleSave();
    this.emit('change', { reason: 'clear' });
  }

  private _scheduleSave(): void {
    if (!this.persist) return;
    if (this._writeTimer) clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => this.saveSync(), 250);
  }

  saveSync(): void {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    if (!this.persist) return;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const payload = JSON.stringify({ version: 1, items: this.items }, null, 0);
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}
