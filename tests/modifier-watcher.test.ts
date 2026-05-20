import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAcceleratorModifiers, unionOfModifiers } from '../src/main/modifier-watcher';

test('parseAcceleratorModifiers: extracts ctrl+alt from Control+Alt+Down', () => {
  const mods = parseAcceleratorModifiers('Control+Alt+Down');
  assert.deepEqual(mods.sort(), ['alt', 'ctrl']);
});

test('parseAcceleratorModifiers: handles Ctrl alias', () => {
  const mods = parseAcceleratorModifiers('Ctrl+Shift+V');
  assert.deepEqual(mods.sort(), ['ctrl', 'shift']);
});

test('parseAcceleratorModifiers: ignores non-modifier tokens', () => {
  const mods = parseAcceleratorModifiers('Up');
  assert.deepEqual(mods, []);
});

test('parseAcceleratorModifiers: tolerates undefined/null input', () => {
  assert.deepEqual(parseAcceleratorModifiers(undefined), []);
  assert.deepEqual(parseAcceleratorModifiers(null), []);
  assert.deepEqual(parseAcceleratorModifiers(''), []);
});

test('unionOfModifiers: merges across multiple accelerators', () => {
  const mods = unionOfModifiers(['Control+Alt+Down', 'Control+Shift+V']);
  assert.deepEqual(mods.sort(), ['alt', 'ctrl', 'shift']);
});

test('unionOfModifiers: deduplicates', () => {
  const mods = unionOfModifiers(['Control+Alt+Down', 'Control+Alt+Up']);
  assert.deepEqual(mods.sort(), ['alt', 'ctrl']);
});
