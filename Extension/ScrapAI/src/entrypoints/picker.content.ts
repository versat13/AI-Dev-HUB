import { browser } from 'wxt/browser';
import { textOf } from '@/lib/profile-extract';
import { generateSelector } from '@/lib/selector-gen';

// 要素ピッカー。ツールバーのボタンで開いたタブにだけ、背景ページが実行時に注入する。
// ページの動作は変えず、クリックした要素のセレクタと見本テキストだけを背景ページへ送る。

interface PickerConfig {
  tip: string;
}

export default defineContentScript({
  matches: ['*://*/*'],
  registration: 'runtime',
  main() {
    const g = globalThis as unknown as { __scrapaiPickerCfg?: PickerConfig; __scrapaiPickerOn?: () => void };
    const cfg = g.__scrapaiPickerCfg ?? { tip: '' };
    delete g.__scrapaiPickerCfg;
    g.__scrapaiPickerOn?.(); // 二重起動のときは前のものを終了させる

    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const shadow = host.attachShadow({ mode: 'closed' });
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;border:2px solid #4f46e5;background:rgba(79,70,229,.15);border-radius:3px;display:none';
    const tip = document.createElement('div');
    tip.textContent = cfg.tip;
    tip.style.cssText =
      'position:fixed;left:50%;top:12px;transform:translateX(-50%);background:#1e1b4b;color:#fff;' +
      'font:13px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:90vw';
    shadow.append(box, tip);
    document.documentElement.append(host);

    let target: Element | null = null;
    const show = (el: Element | null) => {
      target = el;
      if (!el) {
        box.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      box.style.cssText += `;display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    };

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== host && el !== document.documentElement && el !== document.body) show(el);
    };
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent) => {
      swallow(e);
      if (!target) return;
      const { selector, matchCount } = generateSelector(target, document);
      const sample = textOf(target).slice(0, 300);
      cleanup();
      void browser.runtime.sendMessage({
        type: 'picked',
        pick: { url: location.href, selector, matchCount, sample, at: Date.now() },
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        swallow(e);
        cleanup();
      } else if (e.key === 'ArrowUp' && target?.parentElement && target.parentElement !== document.body) {
        swallow(e);
        show(target.parentElement);
      } else if (e.key === 'ArrowDown' && target?.firstElementChild) {
        swallow(e);
        show(target.firstElementChild);
      }
    };

    function cleanup() {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', swallow, true);
      document.removeEventListener('mouseup', swallow, true);
      document.removeEventListener('keydown', onKey, true);
      host.remove();
      delete g.__scrapaiPickerOn;
    }
    g.__scrapaiPickerOn = cleanup;

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', swallow, true);
    document.addEventListener('mouseup', swallow, true);
    document.addEventListener('keydown', onKey, true);
  },
});
