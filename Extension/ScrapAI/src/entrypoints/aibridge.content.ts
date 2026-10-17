import { browser } from 'wxt/browser';
import { fillComposer, findAnswer, findComposer, findSend } from '@/lib/ai-bridge';

// AIサービス（ChatGPT / Claude / Gemini など）に、ScrapAIから開いたときだけ注入する。
// 1) 入力欄にプロンプトを入れる（設定で自動送信） 2) 画面の右下に「ScrapAIに取り込む」ボタンを出す。
// 取り込んだ回答は背景ページに送って保存する。ページの他の内容は読まない。

interface BridgeCfg {
  prompt: string;
  autoSend: boolean;
  scrapId: string;
  service: string;
  templateId: string;
  expected: string[];
  labels: { capture: string; saved: string; notFound: string; failed: string; filled: string; auto: string; notSent?: string };
  sel?: { composer?: string; send?: string; answer?: string }; // 利用者が指定した場所（空なら自動）
  auto?: boolean; // AIボタン: 送信まで自動で行い、回答が出そろったら取り込む
}

const AUTO_STABLE_MS = 6000; // 回答の文章がこの間変わらなければ「出そろった」とみなす
const AUTO_TIMEOUT_MS = 240_000;

export default defineContentScript({
  matches: ['https://*/*'],
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
    const obs = new MutationObserver(() => go.classList.toggle('ready', !!findAnswer(document, cfg.prompt, cfg.sel?.answer)));
    obs.observe(document.body, { childList: true, subtree: true });
    const off = () => {
      obs.disconnect();
      host.remove();
    };
    g.__scrapaiBridgeOff = off;
    root.querySelector('.x')!.addEventListener('click', off);

    go.addEventListener('click', async () => {
      const raw = findAnswer(document, cfg.prompt, cfg.sel?.answer);
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

    // ---- AIボタン: 回答の文章が変わらなくなったら取り込む。うまくいかなければ失敗を知らせる ----
    const job = (state: 'done' | 'failed', reason?: string) =>
      browser.runtime.sendMessage({ type: 'ai-job', scrapId: cfg.scrapId, state, reason }).catch(() => undefined);
    const fail = async (reason: string) => {
      say(reason === 'not-sent' && cfg.labels.notSent ? cfg.labels.notSent : cfg.labels.failed);
      await job('failed', reason);
    };
    // 動いている間は定期的に知らせる（ここが止まったら、ボタンの表示が「処理中」のまま残らないように）
    if (cfg.auto) {
      const beat = setInterval(() => {
        if (!host.isConnected) return clearInterval(beat);
        void browser.runtime.sendMessage({ type: 'ai-job', scrapId: cfg.scrapId, state: 'running' }).catch(() => undefined);
      }, 8000);
    }
    let watching = false;
    const watch = () => {
      if (watching) return;
      watching = true;
      const started = Date.now();
      let last = '';
      let since = Date.now();
      const tick = async () => {
        const now = Date.now();
        const cur = findAnswer(document, cfg.prompt, cfg.sel?.answer) ?? '';
        if (cur !== last) [last, since] = [cur, now];
        if (cur && now - since >= AUTO_STABLE_MS) {
          const res = (await browser.runtime.sendMessage({
            type: 'ai-answer',
            scrapId: cfg.scrapId,
            raw: cur,
            service: cfg.service,
            templateId: cfg.templateId,
            expected: cfg.expected,
            auto: true,
          })) as { ok: boolean } | undefined;
          say(res?.ok ? cfg.labels.saved : cfg.labels.failed);
          if (!res?.ok) await job('failed', 'save');
          return;
        }
        if (now - started > AUTO_TIMEOUT_MS) return void fail('timeout');
        setTimeout(tick, 1000);
      };
      setTimeout(tick, 1000);
    };

    // ---- 入力欄にプロンプトを入れる（画面の準備ができるまで最大20秒待つ） ----
    let tries = 0;
    const fill = () => {
      const el = findComposer(document, cfg.sel?.composer);
      if (!el) {
        if (++tries < 80) setTimeout(fill, 250);
        else if (cfg.auto) void fail('no-composer');
        return;
      }
      fillComposer(el, cfg.prompt);
      say(cfg.auto ? cfg.labels.auto : cfg.labels.filled);
      if (!cfg.autoSend && !cfg.auto) return;
      // 送信: 3秒ごとに「送信ボタン（押せるとき）→ Enter」を試し、入力欄が空になったら送れたとみなす（最大15秒）。
      // 裏のタブでは送信ボタンが効かないサービスがあるため、確認してから次へ進む
      const probe = cfg.prompt.slice(0, 20);
      const sent = () => {
        if (!el.isConnected) return true;
        const text = el instanceof HTMLTextAreaElement ? el.value : el.innerText || '';
        return !text.includes(probe);
      };
      const pressEnter = () => {
        for (const type of ['keydown', 'keypress', 'keyup']) {
          el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        }
      };
      let n = 0;
      const send = () => {
        if (n > 0 && sent()) return void (cfg.auto && watch());
        if (n >= 30) return void (cfg.auto && fail('not-sent'));
        if (n % 6 === 0) {
          const b = findSend(el, cfg.sel?.send);
          if (b && !b.disabled) b.click();
          else pressEnter();
        }
        n++;
        setTimeout(send, 500);
      };
      setTimeout(send, 300);
    };
    fill();
  },
});
