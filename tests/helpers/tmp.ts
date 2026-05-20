import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function makeTmpDir(prefix = 'loki-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

export function cleanupTmp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function randomBuffer(size = 128): Buffer {
  return crypto.randomBytes(size);
}
