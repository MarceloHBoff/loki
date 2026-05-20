import Module from 'node:module';
import fs from 'node:fs';

export interface FakeClipboardState {
  text: string;
  html: string;
  rtf: string;
  image: { buffer: Buffer; width: number; height: number } | null;
  formats: string[];
}

interface FakeImage {
  isEmpty: () => boolean;
  toPNG: () => Buffer;
  getSize: () => { width: number; height: number };
}

export interface FakeElectron {
  state: FakeClipboardState;
  clipboard: {
    readText: () => string;
    readHTML: () => string;
    readRTF: () => string;
    availableFormats: () => string[];
    readImage: () => FakeImage;
    writeText: (text: string) => void;
    write: (payload: { text?: string; html?: string; rtf?: string }) => void;
    writeImage: (img: { toPNG: () => Buffer; getSize: () => { width: number; height: number } }) => void;
  };
  nativeImage: {
    createFromPath: (filePath: string) => FakeImage;
    createFromBuffer: (buf: Buffer) => FakeImage;
    createEmpty: () => FakeImage;
  };
  globalShortcut: {
    _registered: Map<string, () => void>;
    register: (accel: string, fn: () => void) => boolean;
    unregister: (accel: string) => void;
    isRegistered: (accel: string) => boolean;
  };
  app: {
    _loginItem: { openAtLogin: boolean };
    setLoginItemSettings: (s: { openAtLogin?: boolean }) => void;
    getLoginItemSettings: () => { openAtLogin: boolean };
    getPath: () => string;
  };
}

const EMPTY_IMAGE: FakeImage = {
  isEmpty: () => true,
  toPNG: () => Buffer.alloc(0),
  getSize: () => ({ width: 0, height: 0 }),
};

export function installFakeElectron(): FakeElectron {
  const state: FakeClipboardState = {
    text: '',
    html: '',
    rtf: '',
    image: null,
    formats: [],
  };

  const globalShortcut: FakeElectron['globalShortcut'] = {
    _registered: new Map<string, () => void>(),
    register: (accel, fn) => {
      globalShortcut._registered.set(accel, fn);
      return true;
    },
    unregister: (accel) => {
      globalShortcut._registered.delete(accel);
    },
    isRegistered: (accel) => globalShortcut._registered.has(accel),
  };

  const appShim: FakeElectron['app'] = {
    _loginItem: { openAtLogin: false },
    setLoginItemSettings: (s) => {
      appShim._loginItem = { ...appShim._loginItem, ...s };
    },
    getLoginItemSettings: () => ({ ...appShim._loginItem }),
    getPath: () => process.cwd(),
  };

  const fake: FakeElectron = {
    state,
    clipboard: {
      readText: () => state.text || '',
      readHTML: () => state.html || '',
      readRTF: () => state.rtf || '',
      availableFormats: () => state.formats || [],
      readImage: () => {
        if (!state.image) return EMPTY_IMAGE;
        const img = state.image;
        return {
          isEmpty: () => false,
          toPNG: () => Buffer.from(img.buffer),
          getSize: () => ({ width: img.width, height: img.height }),
        };
      },
      writeText: (text: string) => {
        state.text = text;
        state.html = '';
        state.rtf = '';
        state.image = null;
      },
      write: ({ text = '', html = '', rtf = '' }) => {
        state.text = text;
        state.html = html;
        state.rtf = rtf;
        state.image = null;
      },
      writeImage: (img) => {
        const buffer = img.toPNG();
        const size = img.getSize();
        state.image = { buffer, width: size.width, height: size.height };
        state.text = '';
        state.html = '';
        state.rtf = '';
      },
    },
    nativeImage: {
      createFromPath: (filePath: string) => {
        try {
          const buf = fs.readFileSync(filePath);
          return {
            isEmpty: () => buf.length === 0,
            toPNG: () => buf,
            getSize: () => ({ width: 1, height: 1 }),
          };
        } catch {
          return EMPTY_IMAGE;
        }
      },
      createFromBuffer: (buf: Buffer) => ({
        isEmpty: () => buf.length === 0,
        toPNG: () => buf,
        getSize: () => ({ width: 1, height: 1 }),
      }),
      createEmpty: () => EMPTY_IMAGE,
    },
    globalShortcut,
    app: appShim,
  };

  type ResolveFn = (request: string, parent: NodeJS.Module | null, ...rest: unknown[]) => string;
  const ModuleInternal = Module as unknown as { _resolveFilename: ResolveFn };
  const originalResolve = ModuleInternal._resolveFilename;
  ModuleInternal._resolveFilename = function (
    this: unknown,
    request: string,
    parent: NodeJS.Module | null,
    ...rest: unknown[]
  ): string {
    if (request === 'electron') return 'electron-fake-module';
    return originalResolve.call(this, request, parent, ...rest);
  };

  const cache = (require as unknown as { cache: Record<string, unknown> }).cache;
  cache['electron-fake-module'] = {
    id: 'electron-fake-module',
    filename: 'electron-fake-module',
    loaded: true,
    exports: fake,
  };

  return fake;
}
