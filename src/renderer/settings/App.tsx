import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type PropsWithChildren,
} from 'react';
import type { LokiSettingsValues } from '../../shared/types';
import type { DeepPartialSettings } from '../../preload/settings-preload';

interface FormValues {
  monitoringEnabled: boolean;
  ignorePasswordManagers: boolean;
  pollIntervalMs: number | string;
  autoPasteEnabled: boolean;
  maxHistoryItems: number | string;
  deduplicate: boolean;
  persistHistory: boolean;
  launchOnStartup: boolean;
  hotkeyPrevious: string;
  hotkeyNext: string;
  hotkeyShow: string;
}

function fromValues(values: LokiSettingsValues): FormValues {
  return {
    monitoringEnabled: !!values.monitoringEnabled,
    ignorePasswordManagers: !!values.ignorePasswordManagers,
    pollIntervalMs: values.pollIntervalMs,
    autoPasteEnabled: !!values.autoPasteEnabled,
    maxHistoryItems: values.maxHistoryItems,
    deduplicate: !!values.deduplicate,
    persistHistory: !!values.persistHistory,
    launchOnStartup: !!values.launchOnStartup,
    hotkeyPrevious: values.hotkeys.previous,
    hotkeyNext: values.hotkeys.next,
    hotkeyShow: values.hotkeys.showHistory,
  };
}

function toPartial(form: FormValues): DeepPartialSettings {
  return {
    monitoringEnabled: form.monitoringEnabled,
    ignorePasswordManagers: form.ignorePasswordManagers,
    pollIntervalMs: Number(form.pollIntervalMs) || 500,
    autoPasteEnabled: form.autoPasteEnabled,
    maxHistoryItems: Number(form.maxHistoryItems) || 100,
    deduplicate: form.deduplicate,
    persistHistory: form.persistHistory,
    launchOnStartup: form.launchOnStartup,
    hotkeys: {
      previous: String(form.hotkeyPrevious).trim(),
      next: String(form.hotkeyNext).trim(),
      showHistory: String(form.hotkeyShow).trim(),
    },
  };
}

export function App() {
  const [form, setForm] = useState<FormValues | null>(null);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.lokiSettings.get().then((values) => setForm(fromValues(values)));
    const off = window.lokiSettings.onUpdated((values) => setForm(fromValues(values)));
    return () => {
      off();
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const showStatus = useCallback((message: string, isError = false) => {
    setStatus({ message, isError });
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(null), 2500);
  }, []);

  const update = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const onSave = useCallback(async () => {
    if (!form) return;
    try {
      await window.lokiSettings.update(toPartial(form));
      showStatus('Settings saved.');
    } catch (err: unknown) {
      showStatus(`Save failed: ${(err as Error).message}`, true);
    }
  }, [form, showStatus]);

  const onReset = useCallback(async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    const values = await window.lokiSettings.reset();
    setForm(fromValues(values));
    showStatus('Reset to defaults.');
  }, [showStatus]);

  const onClearHistory = useCallback(async () => {
    if (!confirm('Clear the entire clipboard history?')) return;
    await window.lokiSettings.clearHistory();
    showStatus('History cleared.');
  }, [showStatus]);

  if (!form) {
    return <div className="p-6 text-loki-text-faint">Loading…</div>;
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-loki-border px-6 pb-2 pt-5">
        <h1 className="m-0 text-lg font-semibold">Loki settings</h1>
        <p className="m-0 mt-1 text-xs text-loki-text-faint">
          Cross-platform clipboard history manager
        </p>
      </header>

      <main className="flex flex-col gap-3.5 px-6 py-4">
        <Card title="Capture">
          <Row label="Monitor clipboard changes">
            <Checkbox
              checked={form.monitoringEnabled}
              onChange={(e) => update('monitoringEnabled', e.target.checked)}
            />
          </Row>
          <Row label="Skip items flagged by password managers">
            <Checkbox
              checked={form.ignorePasswordManagers}
              onChange={(e) => update('ignorePasswordManagers', e.target.checked)}
            />
          </Row>
          <Row label="Polling interval (ms)">
            <NumberInput
              min={100}
              max={5000}
              step={50}
              value={form.pollIntervalMs}
              onChange={(e) => update('pollIntervalMs', e.target.value)}
            />
          </Row>
        </Card>

        <Card title="Auto-paste">
          <p className="m-0 mb-2.5 text-[11.5px] text-loki-text-faint">
            When enabled, Loki sends a synthetic <Code>Ctrl+V</Code> to the focused window
            the moment you release the navigation chord (Ctrl+Alt by default). Disable
            this if you prefer to paste manually with <Code>Ctrl+V</Code> after selecting.
          </p>
          <Row label="Auto-paste on chord release">
            <Checkbox
              checked={form.autoPasteEnabled}
              onChange={(e) => update('autoPasteEnabled', e.target.checked)}
            />
          </Row>
        </Card>

        <Card title="History">
          <Row label="Maximum stored items">
            <NumberInput
              min={10}
              max={5000}
              step={10}
              value={form.maxHistoryItems}
              onChange={(e) => update('maxHistoryItems', e.target.value)}
            />
          </Row>
          <Row label="Deduplicate (promote existing item to top)">
            <Checkbox
              checked={form.deduplicate}
              onChange={(e) => update('deduplicate', e.target.checked)}
            />
          </Row>
          <Row label="Persist history to disk between launches">
            <Checkbox
              checked={form.persistHistory}
              onChange={(e) => update('persistHistory', e.target.checked)}
            />
          </Row>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <button
              onClick={onClearHistory}
              className="cursor-pointer rounded-md border border-loki-danger-border bg-transparent px-4 py-2 text-[13px] text-loki-danger hover:bg-loki-danger-bg hover:text-loki-danger-hover"
            >
              Clear history
            </button>
          </div>
        </Card>

        <Card title="Startup">
          <Row label="Launch on system startup">
            <Checkbox
              checked={form.launchOnStartup}
              onChange={(e) => update('launchOnStartup', e.target.checked)}
            />
          </Row>
        </Card>

        <Card title="Global hotkeys">
          <p className="m-0 mb-2.5 text-[11.5px] text-loki-text-faint">
            Accelerator format: combinations like <Code>Control+Alt+Down</Code>. Use{' '}
            <Code>CommandOrControl</Code> for cross-platform Cmd/Ctrl.
          </p>
          <Row label="Previous item (older)">
            <TextInput
              value={form.hotkeyPrevious}
              onChange={(e) => update('hotkeyPrevious', e.target.value)}
            />
          </Row>
          <Row label="Next item (newer)">
            <TextInput
              value={form.hotkeyNext}
              onChange={(e) => update('hotkeyNext', e.target.value)}
            />
          </Row>
          <Row label="Open history popup">
            <TextInput
              value={form.hotkeyShow}
              onChange={(e) => update('hotkeyShow', e.target.value)}
            />
          </Row>
        </Card>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className="cursor-pointer rounded-md border border-transparent bg-loki-accent px-4 py-2 text-[13px] text-white hover:bg-loki-accent-hover"
          >
            Save changes
          </button>
          <button
            onClick={onReset}
            className="cursor-pointer rounded-md border border-loki-border-alt bg-transparent px-4 py-2 text-[13px] text-loki-text-muted hover:border-loki-border-hover hover:bg-loki-surface-active hover:text-white"
          >
            Reset to defaults
          </button>
          {status && (
            <span
              className={`text-xs transition-opacity ${
                status.isError ? 'text-loki-danger' : 'text-loki-success'
              }`}
            >
              {status.message}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="rounded-[10px] border border-loki-border bg-loki-surface px-4 py-3.5">
      <h2 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-loki-text-dim">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex-1 text-loki-text-muted">{label}</span>
      {children}
    </label>
  );
}

function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...props}
      className="h-[18px] w-[18px] cursor-pointer accent-loki-accent"
    />
  );
}

function NumberInput({
  onChange,
  ...rest
}: {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <input
      type="number"
      onChange={onChange}
      {...rest}
      className="w-[200px] rounded-md border border-loki-border bg-loki-input px-2 py-1.5 font-inherit text-[13px] text-loki-text outline-none focus:border-loki-accent"
    />
  );
}

function TextInput({
  onChange,
  ...rest
}: {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <input
      type="text"
      onChange={onChange}
      {...rest}
      className="w-[200px] rounded-md border border-loki-border bg-loki-input px-2 py-1.5 font-inherit text-[13px] text-loki-text outline-none focus:border-loki-accent"
    />
  );
}

function Code({ children }: PropsWithChildren) {
  return (
    <code className="rounded bg-loki-input px-[5px] py-px text-[11.5px]">{children}</code>
  );
}
