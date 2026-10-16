// クリックした要素から、再利用しやすいCSSセレクタを作る（要素ピッカー用）。
// 優先: data-testid > 安定した id > 安定したクラス。ハッシュ風のクラス名（css-xxxx 等）は使わない。

const UNSTABLE_CLASS = /^(css-|r-|sc-|jsx-|_)|\d{3,}|^[a-z]{1,3}[A-Z0-9_-]{6,}$/;
const UNSTABLE_ID = /\d{4,}|[0-9a-f]{8,}|^:r|__/i;

const esc = (s: string): string => s.replace(/[^\w-]/g, (c) => `\\${c}`);
const escAttr = (s: string): string => s.replace(/["\\]/g, '\\$&');

function part(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute('data-testid');
  if (testid) return `${tag}[data-testid="${escAttr(testid)}"]`;
  if (el.id && !UNSTABLE_ID.test(el.id)) return `${tag}#${esc(el.id)}`;
  const classes = Array.from(el.classList)
    .filter((c) => !UNSTABLE_CLASS.test(c) && c.length <= 32)
    .slice(0, 2);
  return tag + classes.map((c) => `.${esc(c)}`).join('');
}

function withNth(el: Element, p: string): string {
  const parent = el.parentElement;
  if (!parent) return p;
  const same = Array.from(parent.children).filter((c) => {
    try {
      return c.matches(p);
    } catch {
      return false;
    }
  });
  if (same.length <= 1) return p;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  return `${p}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

function count(doc: Document, selector: string): number {
  try {
    return doc.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

export interface GeneratedSelector {
  selector: string;
  matchCount: number; // ページ内でこのセレクタに一致する要素数（1 が理想）
}

export function generateSelector(el: Element, doc: Document): GeneratedSelector {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; cur && cur !== doc.documentElement && cur !== doc.body && depth < 8; depth++) {
    parts.unshift(withNth(cur, part(cur)));
    const selector = parts.join(' > ');
    // 先頭の1要素だけで一意になれば短く、深さ2以上なら親子で絞る
    if (count(doc, selector) === 1) return { selector, matchCount: 1 };
    // 属性やIDで一意な祖先に当たったら、そこで打ち切る
    cur = cur.parentElement;
  }
  const selector = parts.join(' > ');
  return { selector, matchCount: count(doc, selector) };
}
