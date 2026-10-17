/**
 * Browser API shim for running ScrapAI inside standard web environments (AI Studio dev preview).
 * Implements chrome.storage, chrome.runtime, chrome.tabs, chrome.sidePanel, chrome.i18n, chrome.permissions.
 */
import { ensureBuiltInProfiles } from './builtin-profiles';
import { seedSamples } from './samples';
import { db } from './db';
import type { SaveOutcome } from './types';

const storageListeners = new Set<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void>();

function getLocalStorage(key?: string | string[] | Record<string, unknown> | null) {
  const result: Record<string, unknown> = {};
  if (!key) {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          try {
            result[k] = JSON.parse(localStorage.getItem(k) || 'null');
          } catch {
            result[k] = localStorage.getItem(k);
          }
        }
      }
    }
    return result;
  }
  if (typeof key === 'string') {
    try {
      const val = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (val !== null) result[key] = JSON.parse(val);
    } catch {
      result[key] = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return result;
  }
  if (Array.isArray(key)) {
    for (const k of key) {
      try {
        const val = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        if (val !== null) result[k] = JSON.parse(val);
      } catch {
        result[k] = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
      }
    }
    return result;
  }
  if (typeof key === 'object') {
    for (const [k, defaultVal] of Object.entries(key)) {
      try {
        const val = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        result[k] = val !== null ? JSON.parse(val) : defaultVal;
      } catch {
        result[k] = typeof localStorage !== 'undefined' ? localStorage.getItem(k) ?? defaultVal : defaultVal;
      }
    }
    return result;
  }
  return result;
}

function setLocalStorage(items: Record<string, unknown>) {
  const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
  for (const [k, v] of Object.entries(items)) {
    const oldRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
    let oldVal = undefined;
    if (oldRaw !== null) {
      try { oldVal = JSON.parse(oldRaw); } catch { oldVal = oldRaw; }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(k, JSON.stringify(v));
    }
    changes[k] = { oldValue: oldVal, newValue: v };
  }
  storageListeners.forEach((fn) => {
    try { fn(changes, 'local'); } catch (e) { console.error(e); }
  });
}

const sessionStorageData = new Map<string, unknown>();
function getSessionStorage(key?: string | string[] | Record<string, unknown> | null) {
  const result: Record<string, unknown> = {};
  if (!key) {
    sessionStorageData.forEach((v, k) => { result[k] = v; });
    return result;
  }
  if (typeof key === 'string') {
    if (sessionStorageData.has(key)) result[key] = sessionStorageData.get(key);
    return result;
  }
  if (Array.isArray(key)) {
    for (const k of key) {
      if (sessionStorageData.has(k)) result[k] = sessionStorageData.get(k);
    }
    return result;
  }
  if (typeof key === 'object') {
    for (const [k, defaultVal] of Object.entries(key)) {
      result[k] = sessionStorageData.has(k) ? sessionStorageData.get(k) : defaultVal;
    }
    return result;
  }
  return result;
}

function setSessionStorage(items: Record<string, unknown>) {
  const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
  for (const [k, v] of Object.entries(items)) {
    const oldValue = sessionStorageData.get(k);
    sessionStorageData.set(k, v);
    changes[k] = { oldValue, newValue: v };
  }
  storageListeners.forEach((fn) => {
    try { fn(changes, 'session'); } catch (e) { console.error(e); }
  });
}

let mockScrapCounter = 1;

export const mockChrome = {
  runtime: {
    id: 'scrapai-web-preview',
    getURL: (path: string) => (path.startsWith('/') ? path : `/${path}`),
    sendMessage: async (msg: any): Promise<any> => {
      if (msg?.type === 'save') {
        const id = `web-scrap-${Date.now()}-${mockScrapCounter++}`;
        const now = Date.now();
        const demoUrls = [
          { url: 'https://developer.mozilla.org/ja/docs/Web/API/IndexedDB_API', title: 'IndexedDB API - Web API | MDN', text: 'IndexedDB は、インデックス付きの階層型キー/値データベースへのアクセスを提供するクライアント側ストレージ API です。' },
          { url: 'https://zenn.dev/topics/ai', title: 'AIに関する技術情報とプログラミングまとめ - Zenn', text: '最新の生成AIツールとLLM活用方法についてまとめた記事一覧です。' },
          { url: 'https://github.com/versat13/AI-Dev-HUB', title: 'versat13/AI-Dev-HUB: AI開発共有ハブ', text: '複数のAIを切り替えながら開発するための私的な共有ハブ。ScrapAI などの拡張機能を含む。' },
        ];
        const item = demoUrls[(mockScrapCounter - 2) % demoUrls.length];
        const scrap = {
          id,
          url: item.url,
          normalizedUrl: item.url.replace(/#.*$/, ''),
          domain: new URL(item.url).hostname,
          title: item.title,
          createdAt: now,
          updatedAt: now,
          categoryIds: [],
          stars: 0,
          format: 'article' as const,
        };
        const fragment = {
          id: `frag-${id}`,
          scrapId: id,
          order: 0,
          text: item.text,
          createdAt: now,
          source: 'selection' as const,
        };
        await db.scraps.put(scrap);
        await db.fragments.put(fragment);
        const outcome: SaveOutcome = {
          kind: 'created',
          scrapId: id,
          title: item.title,
          url: item.url,
          fragmentCount: 1,
          extractStatus: 'ok',
          snapshot: 'none',
        };
        return outcome;
      }
      if (msg?.type === 'snapshot') {
        return { ok: true, id: `snap-${Date.now()}` };
      }
      if (msg?.type === 'start-picker') {
        return { ok: true };
      }
      return { ok: true };
    },
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    openOptionsPage: async () => {
      if (typeof window !== 'undefined') window.location.hash = 'section=settings';
    },
  },
  storage: {
    local: {
      get: async (key?: any) => getLocalStorage(key),
      set: async (items: Record<string, unknown>) => setLocalStorage(items),
      remove: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        if (typeof localStorage !== 'undefined') {
          list.forEach((k) => localStorage.removeItem(k));
        }
      },
    },
    session: {
      get: async (key?: any) => getSessionStorage(key),
      set: async (items: Record<string, unknown>) => setSessionStorage(items),
      remove: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((k) => sessionStorageData.delete(k));
      },
    },
    onChanged: {
      addListener: (fn: any) => storageListeners.add(fn),
      removeListener: (fn: any) => storageListeners.delete(fn),
    },
  },
  tabs: {
    query: async () => [
      {
        id: 1,
        url: typeof window !== 'undefined' ? window.location.href : 'https://example.com',
        title: typeof document !== 'undefined' ? document.title : 'ScrapAI',
        active: true,
        currentWindow: true,
      },
    ],
    update: async (_id: number, opts: any) => {
      if (opts?.url && typeof window !== 'undefined') window.location.href = opts.url;
    },
    create: async (opts: any) => {
      if (opts?.url && typeof window !== 'undefined') window.open(opts.url, '_blank');
    },
  },
  windows: {
    getCurrent: async () => ({ id: 1 }),
    update: async () => {},
  },
  sidePanel: {
    open: async () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('scrapai-switch-view', { detail: 'sidepanel' }));
      }
    },
    close: async () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('scrapai-switch-view', { detail: 'manager' }));
      }
    },
  },
  permissions: {
    contains: async () => true,
    request: async () => true,
    remove: async () => true,
  },
  action: {
    setBadgeBackgroundColor: async () => {},
    setBadgeText: async () => {},
  },
  i18n: {
    getUILanguage: () => (typeof navigator !== 'undefined' ? navigator.language : 'ja') || 'ja',
    getMessage: (key: string) => key,
  },
};

export function initBrowserShim() {
  if (typeof globalThis !== 'undefined') {
    if (!(globalThis as any).chrome?.runtime?.id) {
      (globalThis as any).chrome = mockChrome;
    }
    if (!(globalThis as any).browser?.runtime?.id) {
      (globalThis as any).browser = mockChrome;
    }
  }

  // Pre-seed built-in profiles and samples into IndexedDB
  if (typeof window !== 'undefined') {
    ensureBuiltInProfiles().catch(console.error);
    seedSamples().catch(console.error);
  }
}

// Auto-run immediately when imported
initBrowserShim();

export const browser = mockChrome;
export default { browser: mockChrome };
