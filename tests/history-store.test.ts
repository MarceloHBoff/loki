import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import {
  HistoryStore,
  KIND,
  detectTextKind,
  hashPayload,
  type HistoryStoreOptions,
} from '../src/main/history-store';
import { makeTmpDir, cleanupTmp, randomBuffer } from './helpers/tmp';

function makeStore(dir: string, overrides: Partial<HistoryStoreOptions> = {}): HistoryStore {
  return new HistoryStore({
    filePath: path.join(dir, 'history.json'),
    imageDir: path.join(dir, 'images'),
    maxItems: 5,
    deduplicate: true,
    persist: true,
    ...overrides,
  });
}

test('detectTextKind: identifies links, code, and plain text', () => {
  assert.equal(detectTextKind('https://example.com/foo'), KIND.LINK);
  assert.equal(detectTextKind('www.example.com'), KIND.LINK);
  assert.equal(detectTextKind('function hello() { return 1; }'), KIND.CODE);
  assert.equal(detectTextKind('a quick brown fox'), KIND.TEXT);
});

test('HistoryStore: adds text items to the top with cursor reset', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    store.add({ kind: KIND.TEXT, text: 'first' });
    store.add({ kind: KIND.TEXT, text: 'second' });
    store.add({ kind: KIND.TEXT, text: 'third' });
    assert.equal(store.items.length, 3);
    assert.equal(store.items[0].text, 'third');
    assert.equal(store.cursor, 0);
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: deduplicates by promoting existing item to top', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    store.add({ kind: KIND.TEXT, text: 'apple' });
    store.add({ kind: KIND.TEXT, text: 'banana' });
    store.add({ kind: KIND.TEXT, text: 'apple' });
    assert.equal(store.items.length, 2);
    assert.equal(store.items[0].text, 'apple');
    assert.equal(store.items[1].text, 'banana');
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: respects maxItems by trimming oldest', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir, { maxItems: 3 });
    store.add({ kind: KIND.TEXT, text: 'a' });
    store.add({ kind: KIND.TEXT, text: 'b' });
    store.add({ kind: KIND.TEXT, text: 'c' });
    store.add({ kind: KIND.TEXT, text: 'd' });
    assert.equal(store.items.length, 3);
    assert.equal(store.items.map((i) => i.text).join(','), 'd,c,b');
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: cursor navigation walks history in both directions', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    store.add({ kind: KIND.TEXT, text: '1' });
    store.add({ kind: KIND.TEXT, text: '2' });
    store.add({ kind: KIND.TEXT, text: '3' });
    assert.equal(store.getCursorItem()?.text, '3');
    store.moveCursor(1);
    assert.equal(store.getCursorItem()?.text, '2');
    store.moveCursor(1);
    assert.equal(store.getCursorItem()?.text, '1');
    store.moveCursor(1);
    assert.equal(store.getCursorItem()?.text, '1');
    store.moveCursor(-1);
    assert.equal(store.getCursorItem()?.text, '2');
    store.moveCursor(-5);
    assert.equal(store.getCursorItem()?.text, '3');
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: stores image payload as file on disk', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    const buf = randomBuffer(64);
    const item = store.add({ kind: KIND.IMAGE, imageBuffer: buf, width: 4, height: 4 });
    assert.ok(item?.imagePath);
    assert.ok(fs.existsSync(item.imagePath!));
    const onDisk = fs.readFileSync(item.imagePath!);
    assert.deepEqual(onDisk, buf);
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: persists and reloads from disk', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    store.add({ kind: KIND.TEXT, text: 'persist-me' });
    store.saveSync();

    const fresh = makeStore(dir);
    fresh.load();
    assert.equal(fresh.items.length, 1);
    assert.equal(fresh.items[0].text, 'persist-me');
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: clear removes everything including image files', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    store.add({ kind: KIND.TEXT, text: 'foo' });
    const img = store.add({ kind: KIND.IMAGE, imageBuffer: randomBuffer(32) });
    store.clear();
    assert.equal(store.items.length, 0);
    assert.equal(store.cursor, -1);
    assert.equal(fs.existsSync(img!.imagePath!), false);
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: remove deletes a specific item', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir);
    const a = store.add({ kind: KIND.TEXT, text: 'a' });
    store.add({ kind: KIND.TEXT, text: 'b' });
    assert.ok(store.remove(a!.id));
    assert.equal(store.items.length, 1);
    assert.equal(store.items[0].text, 'b');
  } finally {
    cleanupTmp(dir);
  }
});

test('HistoryStore: setMaxItems trims excess on shrink', () => {
  const dir = makeTmpDir();
  try {
    const store = makeStore(dir, { maxItems: 5 });
    for (const c of ['a', 'b', 'c', 'd', 'e']) store.add({ kind: KIND.TEXT, text: c });
    store.setMaxItems(2);
    assert.equal(store.items.length, 2);
  } finally {
    cleanupTmp(dir);
  }
});

test('hashPayload: hash stable for identical text payloads', () => {
  const a = hashPayload({ kind: 'text', text: 'hello', html: '', rtf: '' });
  const b = hashPayload({ kind: 'text', text: 'hello', html: '', rtf: '' });
  assert.equal(a, b);
  const c = hashPayload({ kind: 'text', text: 'world', html: '', rtf: '' });
  assert.notEqual(a, c);
});
