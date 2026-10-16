// AIサービスの画面から「入力欄」「送信ボタン」「回答」を探す。
// まず各サイトで分かっている場所を試し、見つからなければ画面の形から推定する（サイトの作りが変わっても動き続けるように）。
// DOM だけに依存する純粋な関数にして、テスト用の見本ページでも同じように動くようにする。

export const KNOWN = {
  composer: [
    '#prompt-textarea', // ChatGPT
    'div.ProseMirror[contenteditable="true"]', // Claude
    'rich-textarea .ql-editor', // Gemini
    'div[contenteditable="true"][role="textbox"]',
  ],
  send: [
    'button[data-testid="send-button"]', // ChatGPT
    'button[aria-label="Send message"]', // Claude
    'button[aria-label="Send prompt"]', // Gemini
    'button.send-button',
  ],
  assistant: [
    '[data-message-author-role="assistant"]', // ChatGPT（旧）
    '[data-code-block-source] code', // ChatGPT（コードブロックが pre ではなく div > code で出る）
    '.font-claude-response, [data-testid="assistant-message"]', // Claude
    'model-response, message-content', // Gemini
  ],
};

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
}

function editable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return (el as HTMLElement).isContentEditable;
}

/** 入力欄: 分かっている場所 → なければ「画面の下のほうにある、いちばん大きな書き込める欄」 */
export function findComposer(doc: Document = document): HTMLElement | null {
  for (const sel of KNOWN.composer) {
    const el = doc.querySelector(sel);
    if (el && visible(el) && editable(el)) return el as HTMLElement;
  }
  const cands = [...doc.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]')].filter(
    (el) => visible(el) && editable(el),
  );
  const vh = doc.defaultView?.innerHeight || 800;
  let best: HTMLElement | null = null;
  let score = -1;
  for (const el of cands) {
    const r = el.getBoundingClientRect();
    const s = Math.min(r.width * Math.max(r.height, 24), 400_000) * (r.top > vh * 0.4 ? 2 : 1);
    if (s > score) [best, score] = [el as HTMLElement, s];
  }
  return best;
}

/** 入力欄に文字を入れる。テキスト欄は値を直接、編集可能な欄は「貼り付け」と同じ方法で入れる */
export function fillComposer(el: HTMLElement, text: string): boolean {
  el.focus();
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value === text;
  }
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  sel?.selectAllChildren(el);
  let ok = false;
  try {
    ok = doc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok || !(el.innerText || '').includes(text.slice(0, 20))) {
    // execCommand が使えない欄には、貼り付けの出来事を送る
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }
  return (el.innerText || '').includes(text.slice(0, 20));
}

/** 送信ボタン: 分かっている場所 → なければ入力欄の近くの「送信らしい」ボタン */
export function findSend(composer: HTMLElement): HTMLButtonElement | null {
  const doc = composer.ownerDocument;
  for (const sel of KNOWN.send) {
    const b = doc.querySelector<HTMLButtonElement>(sel);
    if (b && visible(b)) return b;
  }
  const label = /send|送信|submit|提出/i;
  let node: HTMLElement | null = composer;
  for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
    const btns = [...node.querySelectorAll<HTMLButtonElement>('button')].filter((b) => visible(b));
    const named = btns.find((b) => label.test(`${b.getAttribute('aria-label') ?? ''} ${b.title} ${b.textContent ?? ''} ${b.getAttribute('data-testid') ?? ''}`));
    if (named) return named;
    const submit = btns.find((b) => b.type === 'submit');
    if (submit) return submit;
  }
  return null;
}

/**
 * 回答を探す。ScrapAIのプロンプトは「回答全体を1つのコードブロックで」と指示しているので、
 * 見出し（## ）を2つ以上含む最後のコードブロックを回答とみなす。プロンプト自身の見本は除く。
 * 見つからなければ、最後のAIの発言の文章を返す。
 */
export function findAnswer(doc: Document, prompt: string): string | null {
  const isHeadings = (t: string) => (t.match(/^\s*#{1,3}\s+\S/gm) ?? []).length >= 2;
  // 入力欄や表示で改行・空白が変わっても比べられるように、空白をそろえて比べる
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
  const sentPrompt = squash(prompt);
  // コードブロックは pre のほか、ChatGPT のように div[data-code-block-source] > code で出るものもある
  const blocks = [...doc.querySelectorAll('pre, [data-code-block-source], code')].reverse();
  for (const el of blocks) {
    const inner = el.matches('pre, [data-code-block-source]') ? el.querySelector('code') ?? el : el;
    let text = (inner as HTMLElement).innerText ?? inner.textContent ?? '';
    // 行が span で分かれて改行が失われた場合は、見出しの前で改行を補う
    if (!text.includes('\n')) text = text.replace(/\s+(#{1,3} )/g, '\n$1');
    const norm = text.trim();
    if (!norm || !isHeadings(norm)) continue;
    if (sentPrompt.includes(squash(norm).slice(0, 200))) continue; // 送ったプロンプト（またはその中の見本）
    return norm;
  }
  for (const sel of KNOWN.assistant) {
    const all = doc.querySelectorAll<HTMLElement>(sel);
    const last = all[all.length - 1];
    const text = last?.innerText?.trim();
    if (text) return text;
  }
  return null;
}
