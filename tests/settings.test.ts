import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { Settings, DEFAULT_SETTINGS } from '../src/main/settings';
import { makeTmpDir, cleanupTmp } from './helpers/tmp';

test('Settings: returns defaults when file is missing', () => {
  const dir = makeTmpDir();
  try {
    const s = new Settings({ filePath: path.join(dir, 'missing.json') });
    s.load();
    assert.equal(s.get('maxHistoryItems'), DEFAULT_SETTINGS.maxHistoryItems);
    assert.equal(s.get('monitoringEnabled'), DEFAULT_SETTINGS.monitoringEnabled);
    assert.deepEqual(s.get('hotkeys'), DEFAULT_SETTINGS.hotkeys);
  } finally {
    cleanupTmp(dir);
  }
});

test('Settings: persists changes to disk', () => {
  const dir = makeTmpDir();
  try {
    const file = path.join(dir, 'settings.json');
    const s = new Settings({ filePath: file });
    s.load();
    s.set('maxHistoryItems', 250);
    s.saveSync();

    const fresh = new Settings({ filePath: file });
    fresh.load();
    assert.equal(fresh.get('maxHistoryItems'), 250);
  } finally {
    cleanupTmp(dir);
  }
});

test('Settings: deep merges partial updates', () => {
  const dir = makeTmpDir();
  try {
    const s = new Settings({ filePath: path.join(dir, 's.json') });
    s.load();
    s.update({ hotkeys: { previous: 'Control+Shift+Down' } });
    assert.equal(s.get('hotkeys').previous, 'Control+Shift+Down');
    assert.equal(s.get('hotkeys').next, DEFAULT_SETTINGS.hotkeys.next);
    assert.equal(s.get('hotkeys').showHistory, DEFAULT_SETTINGS.hotkeys.showHistory);
  } finally {
    cleanupTmp(dir);
  }
});

test('Settings: reset restores defaults', () => {
  const dir = makeTmpDir();
  try {
    const s = new Settings({ filePath: path.join(dir, 's.json') });
    s.load();
    s.set('maxHistoryItems', 5);
    s.reset();
    assert.equal(s.get('maxHistoryItems'), DEFAULT_SETTINGS.maxHistoryItems);
  } finally {
    cleanupTmp(dir);
  }
});

test('Settings: tolerates corrupt JSON without crashing', () => {
  const dir = makeTmpDir();
  try {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{ broken json');
    const s = new Settings({ filePath: file });
    s.load();
    assert.equal(s.get('maxHistoryItems'), DEFAULT_SETTINGS.maxHistoryItems);
  } finally {
    cleanupTmp(dir);
  }
});

test('Settings: emits change events on set', () => {
  const dir = makeTmpDir();
  try {
    const s = new Settings({ filePath: path.join(dir, 's.json') });
    s.load();
    let captured: { key: string; value: unknown } | null = null;
    s.on('change', (e: { key: string; value: unknown }) => {
      captured = e;
    });
    s.set('maxHistoryItems', 77);
    assert.ok(captured);
    assert.equal((captured as unknown as { key: string }).key, 'maxHistoryItems');
    assert.equal((captured as unknown as { value: number }).value, 77);
  } finally {
    cleanupTmp(dir);
  }
});
