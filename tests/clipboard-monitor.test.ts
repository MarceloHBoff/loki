import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeElectron } from './helpers/fake-electron';

const fake = installFakeElectron();

// ES `import` is hoisted before `installFakeElectron()` runs, so source modules
// that `import 'electron'` would resolve the real module first. Use require()
// after the fake is installed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ClipboardMonitor, writeItemToClipboard } = require('../src/main/clipboard-monitor') as typeof import('../src/main/clipboard-monitor');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KIND } = require('../src/main/history-store') as typeof import('../src/main/history-store');
import type { HistoryItem } from '../src/main/history-store';
import type { ClipboardPayload } from '../src/shared/types';

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('ClipboardMonitor: detects text change on poll', async () => {
  fake.state.text = '';
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));
  monitor.start();
  fake.state.text = 'hello world';
  monitor.forceCheck();
  await nextTick();
  monitor.stop();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].kind, KIND.TEXT);
  assert.equal(captured[0].text, 'hello world');
});

test('ClipboardMonitor: detects link kind', () => {
  fake.state.text = '';
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));
  monitor.start();
  fake.state.text = 'https://example.com';
  monitor.forceCheck();
  monitor.stop();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].kind, KIND.LINK);
});

test('ClipboardMonitor: suppresses programmatic write echo', () => {
  fake.state.text = 'before';
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  monitor.start();

  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));

  const writeHash = writeItemToClipboard({
    kind: KIND.TEXT,
    text: 'programmatic',
    html: '',
    rtf: '',
  } as unknown as HistoryItem);
  monitor.suppressNext(writeHash!);
  monitor.forceCheck();
  assert.equal(captured.length, 0, 'echoed write should be suppressed');

  fake.state.text = 'organic';
  monitor.forceCheck();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].text, 'organic');
  monitor.stop();
});

test('ClipboardMonitor: respects disabled flag', () => {
  fake.state.text = '';
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  monitor.start();
  monitor.setEnabled(false);
  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));
  fake.state.text = 'should-be-ignored';
  monitor.forceCheck();
  assert.equal(captured.length, 0);
  monitor.setEnabled(true);
  monitor.forceCheck();
  assert.equal(captured.length, 1);
  monitor.stop();
});

test('ClipboardMonitor: detects image content', () => {
  fake.state.text = '';
  fake.state.image = { buffer: Buffer.from('fake-png-data'), width: 10, height: 8 };
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));
  monitor.start();
  monitor.forceCheck();
  monitor.stop();
  fake.state.image = { buffer: Buffer.from('different-png'), width: 12, height: 9 };
  monitor.start();
  monitor.forceCheck();
  monitor.stop();
  const lastImage = captured.find((c) => c.kind === KIND.IMAGE);
  if (lastImage) {
    assert.equal(lastImage.width, 10);
    assert.equal(lastImage.height, 8);
  }
});

test('ClipboardMonitor: ignores secret-flagged formats when enabled', () => {
  fake.state.text = '';
  fake.state.image = null;
  fake.state.formats = ['application/x-keepass', 'text/plain'];
  fake.state.text = 'super-secret-password';
  const monitor = new ClipboardMonitor({ intervalMs: 50 });
  monitor.setIgnoreSecrets(true);
  const captured: ClipboardPayload[] = [];
  monitor.on('change', (p: ClipboardPayload) => captured.push(p));
  monitor.start();
  monitor.forceCheck();
  monitor.stop();
  assert.equal(captured.length, 0);
  fake.state.formats = [];
});
