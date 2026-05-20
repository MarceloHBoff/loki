import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryItemView, HistoryListPayload } from '../../shared/types';
import {
  KIND_BADGE_CLASS,
  KIND_LABELS,
  formatBytes,
  formatTime,
} from '../shared/format';

function matchesFilter(item: HistoryItemView, filter: string): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase();
  if (item.preview && item.preview.toLowerCase().includes(f)) return true;
  if (item.text && item.text.toLowerCase().includes(f)) return true;
  if (item.kind && item.kind.toLowerCase().includes(f)) return true;
  return false;
}

function ItemImage({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.lokiHistory.getImage(id).then((dataUrl) => {
      if (!cancelled && dataUrl) setSrc(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (
    <img
      alt="image"
      src={src ?? undefined}
      className="max-h-[60px] max-w-full rounded border border-loki-border"
    />
  );
}

export function App() {
  const [items, setItems] = useState<HistoryItemView[]>([]);
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const applyPayload = useCallback((payload: HistoryListPayload) => {
    setItems(payload.items || []);
  }, []);

  useEffect(() => {
    window.lokiHistory.list().then(applyPayload);
    const off = window.lokiHistory.onUpdated(applyPayload);
    return () => {
      off();
    };
  }, [applyPayload]);

  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  const filtered = useMemo(
    () => items.filter((it) => matchesFilter(it, filter)),
    [items, filter],
  );

  useEffect(() => {
    const sel = listRef.current?.querySelector('li[data-selected="true"]');
    sel?.scrollIntoView({ block: 'nearest' });
  }, [filtered]);

  const selectItem = useCallback(async (id: string) => {
    await window.lokiHistory.select(id);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        window.lokiHistory.close();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const sel = items.find((it) => it.selected);
        if (sel) {
          selectItem(sel.id).then(() => window.lokiHistory.close());
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const sel = items.find((it) => it.selected);
        const targetActive = document.activeElement;
        // Don't intercept Backspace while typing in the search input.
        if (targetActive === filterRef.current && event.key === 'Backspace') return;
        if (sel) {
          event.preventDefault();
          window.lokiHistory.remove(sel.id);
        }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const visible = items.filter((it) => matchesFilter(it, filter));
        if (visible.length === 0) return;
        const currentIdx = visible.findIndex((it) => it.selected);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = Math.max(
          0,
          Math.min(visible.length - 1, (currentIdx === -1 ? 0 : currentIdx) + delta),
        );
        selectItem(visible[nextIdx].id);
      }
    },
    [items, filter, selectItem],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const onClear = useCallback(async () => {
    if (confirm('Clear the entire clipboard history?')) {
      await window.lokiHistory.clear();
    }
  }, []);

  const onClose = useCallback(() => window.lokiHistory.close(), []);

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center justify-between border-b border-loki-border px-3.5 pb-2 pt-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 font-semibold text-loki-text-strong">
          <span className="h-2 w-2 rounded-full bg-gradient-to-br from-loki-accent to-loki-accent-light shadow-[0_0_8px_rgba(91,141,240,0.6)]" />
          <span>Loki clipboard</span>
        </div>
        <div
          className="flex gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <GhostButton onClick={onClear} title="Clear history">
            Clear
          </GhostButton>
          <GhostButton onClick={onClose} title="Close (Esc)">
            ×
          </GhostButton>
        </div>
      </header>

      <div className="border-b border-loki-border-subtle px-3 py-2">
        <input
          ref={filterRef}
          type="search"
          placeholder="Filter…"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-md border border-loki-border bg-loki-input px-2.5 py-1.5 text-[13px] text-loki-text outline-none focus:border-loki-accent"
        />
      </div>

      <ul
        ref={listRef}
        tabIndex={0}
        aria-label="Clipboard history"
        className="loki-scroll flex-1 list-none overflow-y-auto p-0 py-1 outline-none"
      >
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-loki-text-faint">
            {items.length === 0
              ? 'No clipboard history yet — copy something to get started.'
              : 'No items match your filter.'}
          </div>
        ) : (
          filtered.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              onSelect={() => selectItem(item.id)}
              onDouble={() =>
                selectItem(item.id).then(() => window.lokiHistory.close())
              }
              onRemove={() => window.lokiHistory.remove(item.id)}
            />
          ))
        )}
      </ul>

      <footer className="border-t border-loki-border-subtle bg-loki-bg-dark px-3 py-1.5 text-[10.5px] text-loki-text-fainter">
        <span>Ctrl+Alt+↑/↓ navigate · Enter paste · Del remove · Esc close</span>
      </footer>
    </div>
  );
}

function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="cursor-pointer rounded-md border border-loki-border-alt bg-transparent px-2.5 py-1 text-xs text-loki-text-muted transition-colors hover:border-loki-border-hover hover:bg-loki-surface-active hover:text-white"
    >
      {children}
    </button>
  );
}

interface HistoryRowProps {
  item: HistoryItemView;
  onSelect: () => void;
  onDouble: () => void;
  onRemove: () => void;
}

function HistoryRow({ item, onSelect, onDouble, onRemove }: HistoryRowProps) {
  const selectedClass = item.selected
    ? 'border-l-[3px] border-l-loki-accent pl-[9px] bg-gradient-to-r from-[rgba(77,123,226,0.18)] to-[rgba(77,123,226,0.04)]'
    : 'border-l-0';

  return (
    <li
      data-id={item.id}
      data-selected={item.selected ? 'true' : 'false'}
      onClick={onSelect}
      onDoubleClick={onDouble}
      className={`group relative grid cursor-pointer grid-cols-[28px_1fr_auto] items-center gap-2.5 border-b border-loki-border-subtle px-3 py-2 hover:bg-loki-surface-hover ${selectedClass}`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold uppercase ${KIND_BADGE_CLASS[item.kind] || ''}`}
      >
        {KIND_LABELS[item.kind] || '?'}
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 whitespace-pre-wrap break-words text-[12.5px] leading-[1.4] text-loki-text">
          {item.kind === 'image' ? (
            <ItemImage id={item.id} />
          ) : (
            item.preview || '(empty)'
          )}
        </div>
        <div className="mt-[3px] flex gap-2 text-[11px] text-loki-text-faint">
          <span>{formatTime(item.capturedAt)}</span>
          <span>{formatBytes(item.sizeBytes)}</span>
        </div>
      </div>
      <div className="hidden gap-1 group-hover:flex">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from history"
          className="h-[22px] w-[22px] cursor-pointer rounded border border-transparent bg-transparent p-0 text-sm leading-none text-loki-text-faint hover:border-loki-border-hover hover:bg-loki-border hover:text-loki-text-strong"
        >
          ×
        </button>
      </div>
    </li>
  );
}
