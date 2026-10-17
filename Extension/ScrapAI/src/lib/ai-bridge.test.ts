// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fillComposer, findAnswer, findComposer, findSend } from './ai-bridge';

// jsdom は大きさを計算しないので、要素ごとの大きさを data-rect で与える
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const [x, y, w, h] = (this.getAttribute('data-rect') ?? '0,0,100,20').split(',').map(Number);
    return { x, y, left: x, top: y, width: w, height: h, right: x! + w!, bottom: y! + h!, toJSON() {} } as DOMRect;
  };
});

describe('AIサイトの画面から入力欄・送信・回答を探す', () => {
  it('知らない作りのページでも、下のほうの大きな入力欄を選ぶ', () => {
    document.body.innerHTML = `
      <input type="search" data-rect="0,0,300,30">
      <textarea id="small" data-rect="0,50,100,20"></textarea>
      <form><textarea id="main" data-rect="0,600,700,80"></textarea><button aria-label="Send" data-rect="710,620,30,30">↑</button></form>`;
    const c = findComposer(document)!;
    expect(c.id).toBe('main');
    expect(fillComposer(c, 'こんにちは')).toBe(true);
    expect((c as HTMLTextAreaElement).value).toBe('こんにちは');
    expect(findSend(c)?.getAttribute('aria-label')).toBe('Send');
  });

  it('知っている場所（ChatGPT）を優先する', () => {
    document.body.innerHTML = `<textarea id="other" data-rect="0,600,900,200"></textarea><textarea id="prompt-textarea" data-rect="0,700,500,40"></textarea>`;
    expect(findComposer(document)!.id).toBe('prompt-textarea');
  });

  it('回答: 見出しのある最後のコードブロック。送ったプロンプトの見本は除く', () => {
    const prompt = 'Do it.\n```markdown\n## Headline\n(a short title)\n\n## Key points\n(3–5 bullet points)\n```';
    document.body.innerHTML = `
      <div class="user"><pre><code>## Headline\n(a short title)\n\n## Key points\n(3–5 bullet points)</code></pre></div>
      <div class="bot"><pre><code>## Headline\nAIの見出し\n## Key points\n- 一つ目</code></pre></div>`;
    // jsdom は innerText を持たないので textContent で代用
    Object.defineProperty(HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });
    expect(findAnswer(document, prompt)).toBe('## Headline\nAIの見出し\n## Key points\n- 一つ目');
  });

  it('回答: Grok で考え中（見出しだけ）のときは回答とみなさない', () => {
    document.body.innerHTML = `<div data-testid="assistant-message"><h2 class="sr-only">Grok</h2><button>10s 作業しました</button></div>`;
    expect(findAnswer(document, 'p')).toBeNull();
    document.body.innerHTML = `<div data-testid="assistant-message"><h2>Grok</h2><button>10s 作業しました</button><pre><code>## Headline\nタイトル\n## Key points\n- 要点</code></pre></div>`;
    expect(findAnswer(document, 'p')).toContain('## Headline');
  });

  it('回答がまだなければ null（プロンプトの見本だけのとき）', () => {
    const prompt = '```markdown\n## Headline\n(x)\n## Key points\n(y)\n```';
    document.body.innerHTML = `<pre><code>## Headline\n(x)\n## Key points\n(y)</code></pre>`;
    expect(findAnswer(document, prompt)).toBeNull();
  });

  it('回答: ChatGPT のように pre を使わない code ブロックも拾う（行が span で分かれ改行がない）', () => {
    const prompt = '```markdown\n## Headline\n(x)\n## Key points\n(y)\n```';
    document.body.innerHTML = `
      <div data-code-block-source="true"><code class="block"><span><span class="hljs-section">## Headline</span></span> <span>運動音痴の練習記録</span> <span><span class="hljs-section">## Key points</span></span> <span>- 一つ目</span></code></div>`;
    const a = findAnswer(document, prompt)!;
    expect(a.startsWith('## Headline')).toBe(true);
    expect(a).toContain('\n## Key points');
  });
});
