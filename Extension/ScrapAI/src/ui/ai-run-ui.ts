import { useEffect, useRef } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { getServices } from '@/lib/ai';
import { GEMINI_ORIGIN, setJob } from '@/lib/ai-run';
import { getSettings } from '@/lib/settings';
import { GEMINI_API, type Settings } from '@/lib/types';

/**
 * AIボタンを押したときの処理。使うAIサービス（またはGemini API）へのアクセスを初回だけ許可してもらい、背景に任せる。
 * 許可の確認はクリックの直後に出す必要があるので、設定は先に読んでおく。
 */
export function useAiRun(): (scrapId: string) => void {
  const cfg = useRef<Settings | null>(null);
  useEffect(() => {
    void getSettings().then((s) => (cfg.current = s));
    const on = (c: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && c.settings?.newValue) cfg.current = c.settings.newValue as Settings;
    };
    browser.storage.onChanged.addListener(on);
    return () => browser.storage.onChanged.removeListener(on);
  }, []);

  return async (scrapId) => {
    const s = cfg.current ?? (await getSettings());
    let origin = GEMINI_ORIGIN;
    if (s.aiButtonService !== GEMINI_API) {
      const svc = getServices(s.aiServices).find((x) => x.id === s.aiButtonService) ?? getServices(s.aiServices)[0];
      if (!svc) return;
      origin = `${new URL(svc.url).origin}/*`;
    }
    let granted = false;
    try {
      granted = (await browser.permissions.contains({ origins: [origin] })) || (await browser.permissions.request({ origins: [origin] }));
    } catch {
      granted = false;
    }
    if (!granted) return void (await setJob(scrapId, { state: 'failed', reason: 'permission' }));
    await browser.runtime.sendMessage({ type: 'ai-run', scrapId });
  };
}
