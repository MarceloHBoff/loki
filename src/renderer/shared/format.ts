import type { ClipboardKind } from '../../shared/types';

export const KIND_LABELS: Record<ClipboardKind, string> = {
  text: 'TXT',
  link: 'LNK',
  code: 'CODE',
  html: 'HTML',
  image: 'IMG',
  unknown: '?',
};

export function formatTime(ts: number | undefined | null): string {
  if (!ts) return '';
  const date = new Date(ts);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const KIND_BADGE_CLASS: Record<ClipboardKind, string> = {
  image: 'bg-loki-kind-image-bg text-loki-kind-image-fg',
  link: 'bg-loki-kind-link-bg text-loki-kind-link-fg',
  code: 'bg-loki-kind-code-bg text-loki-kind-code-fg',
  html: 'bg-loki-kind-html-bg text-loki-kind-html-fg',
  text: 'bg-loki-surface-active text-loki-text-dim',
  unknown: 'bg-loki-surface-active text-loki-text-dim',
};
