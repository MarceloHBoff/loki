import { useEffect, useRef, useState } from 'react';
import type { PreviewPayload } from '../../shared/types';
import { KIND_BADGE_CLASS, KIND_LABELS, formatBytes } from '../shared/format';

const HIDE_AFTER_MS = 1600;

type Visibility = 'hidden' | 'entering' | 'visible';

export function App() {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('hidden');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = window.lokiPreview.onShow((p) => {
      setPayload(p);
      setVisibility('entering');
      // Allow next frame for entry transition.
      requestAnimationFrame(() => setVisibility('visible'));
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setVisibility('entering');
        setTimeout(() => setVisibility('hidden'), 200);
      }, HIDE_AFTER_MS);
    });
    return () => {
      off();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!payload || visibility === 'hidden') return null;

  const text = (payload.preview || payload.text || '').trim();
  const truncated = text.length > 220 ? `${text.slice(0, 219)}…` : text;

  const metaBits: string[] = [];
  if (payload.position !== undefined && payload.total !== undefined) {
    metaBits.push(`${payload.position + 1} / ${payload.total}`);
  }
  if (payload.sizeBytes) metaBits.push(formatBytes(payload.sizeBytes));

  const animClass =
    visibility === 'visible'
      ? 'opacity-100 translate-y-0'
      : 'opacity-0 translate-y-1';

  return (
    <div
      className={`m-1.5 rounded-[10px] border border-[rgba(77,123,226,0.45)] bg-[rgba(28,31,36,0.92)] p-[10px_12px] text-xs shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-[8px] transition-[opacity,transform] duration-[180ms] ease-out ${animClass}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded-full px-[7px] py-[1px] text-[10px] font-bold uppercase tracking-[0.04em] ${KIND_BADGE_CLASS[payload.kind] || ''}`}
        >
          {KIND_LABELS[payload.kind] || '?'}
        </span>
        <span className="flex-1 text-[11px] text-loki-text-faint">
          {metaBits.join(' · ')}
        </span>
        <span className="text-[10.5px] font-semibold text-loki-accent">
          {payload.autoPasteArmed ? 'release Ctrl+Alt to paste' : 'now on clipboard'}
        </span>
      </div>
      <div className="line-clamp-3 max-h-[70px] overflow-hidden whitespace-pre-wrap break-words text-[12.5px] leading-[1.35] text-loki-text">
        {payload.kind === 'image' && payload.imageDataUrl ? (
          <img
            alt={payload.preview || 'image'}
            src={payload.imageDataUrl}
            className="block max-h-[60px] max-w-full rounded border border-white/[0.08]"
          />
        ) : (
          truncated || '(empty clipboard entry)'
        )}
      </div>
    </div>
  );
}
