import { browser } from 'wxt/browser';
import { fillComposer, findAnswer, findComposer, findSend } from '@/lib/ai-bridge';

// AIサイト（ChatGPT / Claude / Gemini）に、ScrapAIから開いたときだけ注入する。
// 1) 入力欄にプロンプトを入れる（設定で自動送信） 2) 画面の右下に「ScrapAIに取り込む」ボタンを出す。
// 取り込んだ回答は背景ページに送って保存する。ページの他の内容は読まない。

interface BridgeCfg {
  prompt: string;
  autoSend: boolean;
  scrapId: string;
  service: string;
  templateId: string;
  expected: string[];
  labels: { capture: string; saved: string; notFound: string; failed: string; filled: string };
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'],
  registration: 'runtime',
  main() {
    const g = globalThis as unknown as { __scrapaiBridge?: BridgeCfg; __scrapaiBridgeOff?: () => void };
    const cfg = g.__scrapaiBridge;
    delete g.__scrapaiBridge;
    if (!cfg) return;
    g.__scrapaiBridgeOff?.();

    // ---- 取り込みボタン ----
    const host = document.createElement('div');
    host.id = 'scrapai-bridge';
    host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:88px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .box{font:13px/1.4 system-ui,'Hiragino Sans','Yu Gothic UI',sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      button{all:unset;cursor:pointer;background:#1f2a44;color:#fff;font-weight:700;padding:10px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(15,23,42,.25)}
      button:focus-visible{outline:3px solid #ffc518;outline-offset:2px}
      button.ready{background:linear-gradient(#1f2a44,#1f2a44) padding-box,linear-gradient(90deg,#ffc518,#ffe08a) border-box;border:2px solid transparent}
      button .mark{color:#ffc518;margin-right:6px}
      .note{background:#fff;color:#1f2a44;border:1px solid #e3e6eb;border-radius:8px;padding:6px 10px;max-width:280px}
      .x{background:#fff;color:#5f6980;font-weight:400;padding:2px 8px;box-shadow:none;font-size:12px}
    </style><div class="box"><div class="note" hidden></div><button class="go"><span class="mark">✦</span>${cfg.labels.capture}</button><button class="x" aria-label="close">×</button></div>`;
    const go = root.querySelector<HTMLButtonElement>('.go')!;
    const note = root.querySelector<HTMLDivElement>('.note')!;
    const say = (t: string) => {
      note.textContent = t;
      note.hidden = !t;
    };
    document.documentElement.appendChild(host);

    // 回答が出たら、ボタンを目立たせる
    const obs = new MutationObserver(() => go.classList.toggle('ready', !!findAnswer(document, cfg.prompt)));
    obs.observe(document.body, { childList: true, subtree: true });
    const off = () => {
      obs.disconnect();
      host.remove();
    };
    g.__scrapaiBridgeOff = off;
    root.querySelector('.x')!.addEventListener('click', off);

    go.addEventListener('click', async () => {
      const raw = findAnswer(document, cfg.prompt);
      if (!raw) return say(cfg.labels.notFound);
      const res = (await browser.runtime.sendMessage({
        type: 'ai-answer',
        scrapId: cfg.scrapId,
        raw,
        service: cfg.service,
        templateId: cfg.templateId,
        expected: cfg.expected,
      })) as { ok: boolean } | undefined;
      say(res?.ok ? cfg.labels.saved : cfg.labels.failed);
    });

    // ---- 入力欄にプロンプトを入れる（画面の準備ができるまで最大20秒待つ） ----
    let tries = 0;
    const fill = () => {
      const el = findComposer(document);
      if (!el) {
        if (++tries < 80) setTimeout(fill, 250);
        return;
      }
      fillComposer(el, cfg.prompt);
      say(cfg.labels.filled);
      if (!cfg.autoSend) return;
      let wait = 0;
      const send = () => {
        const b = findSend(el);
        if (b && !b.disabled) return b.click();
        if (++wait < 20) return void setTimeout(send, 200);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      };
      setTimeout(send, 300);
    };
    fill();
  },
});
