import { useEffect, useRef } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { getServices } from '@/lib/ai';
import { GEMINI_ORIGIN, setJob } from '@/lib/ai-run';
import { getSettings } from '@/lib/settings';
import { GEMINI_API, type Settings } from '@/lib/types';

/**
 * AIを動かす（AIボタン・詳細画面の「Gemini API」）。送り先（AIサービスまたはGemini API）へのアクセスを
 * 初回だけ許可してもらい、背景に任せる。許可の確認はクリックの直後に出す必要があるので、設定は先に読んでおく。
 */
export async function runAi(s: Settings, scrapId: string, opts: { serviceId?: string; templateId?: string } = {}): Promise<void> {
  const serviceId = opts.serviceId ?? s.aiButtonService;
  let origin = GEMINI_ORIGIN;
  if (serviceId !== GEMINI_API) {
    const list = getServices(s.aiServices);
    const svc = list.find((x) => x.id === serviceId) ?? list[0];
    try {
      origin = `${new URL(svc!.url).origin}/*`;
    } catch {
      return void (await setJob(scrapId, { state: 'failed', reason: 'bad-url' })); // URLが空・書き間違い
    }
  }
  let granted = false;
  try {
    granted = (await browser.permissions.contains({ origins: [origin] })) || (await browser.permissions.request({ origins: [origin] }));
  } catch {
    granted = false;
  }
  if (!granted) return void (await setJob(scrapId, { state: 'failed', reason: 'permission' }));
  await browser.runtime.sendMessage({ type: 'ai-run', scrapId, ...opts });
}

/** カードのAIボタンを押したときの処理 */
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
  return async (scrapId) => runAi(cfg.current ?? (await getSettings()), scrapId);
}
