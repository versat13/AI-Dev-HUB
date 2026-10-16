import { HARD_CAP } from './limits';
import { normalizeText, truncate } from './text';
import type { FieldRule, FragmentRole, SiteProfile, UnitRule } from './types';

// ページ内で実行するプロファイル抽出。DOMだけに依存し、結果は構造化クローンできるオブジェクトで返す。

export interface ProfileDraft {
  fieldLabel: string;
  role: FragmentRole;
  text: string;
  truncated: boolean;
  anchor?: string;
  permalink?: string;
  extras?: { label: string; role: FragmentRole; text: string }[];
}

export interface ProfileExtraction {
  profileId: string;
  fieldDrafts: ProfileDraft[]; // ページ単位の項目（1項目=1断片）
  unitDrafts: ProfileDraft[]; // 選択された単位。選択がなければ既定の1単位
  unitsFromSelection: boolean; // true のとき、選択テキストは unitDrafts として保存済み
  selectionAnchor?: string; // 選択が1つの単位に収まるとき、その単位の番号など
  selectionPermalink?: string;
}

export const MAX_SELECTED_UNITS = 100;

const BLOCK = new Set([
  'DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'TR', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'DT', 'DD', 'DL', 'FIGURE', 'FIGCAPTION', 'HR',
]);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);

/** 要素の表示テキスト。<br> と ブロック境界を改行にし、画像は alt、省略されたリンク文字列は href に置き換える */
export function textOf(el: Element): string {
  return normalizeText(textOfNode(el));
}

function textOfNode(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    const tag = e.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === 'BR') {
      out.push('\n');
      return;
    }
    if (tag === 'IMG') {
      out.push(e.getAttribute('alt') ?? '');
      return;
    }
    if (tag === 'A') {
      const href = (e as HTMLAnchorElement).href;
      const inner = Array.from(e.childNodes).map((c) => textOfNode(c)).join('');
      out.push(/^https?:/.test(href ?? '') && inner.includes('…') ? href : inner);
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    for (const c of Array.from(e.childNodes)) walk(c);
    if (block) out.push('\n');
    else if (tag === 'TD' || tag === 'TH') out.push(' ');
  };
  walk(root);
  return out.join('');
}

const SINGLE_LINE_ROLES: FragmentRole[] = ['title', 'author', 'date'];

function safeAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return []; // 不正なセレクタは「見つからない」として扱う
  }
}

function safeOne(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function attrValue(el: Element, attr: string): string {
  if (attr === 'href' || attr === 'src') {
    const v = (el as HTMLAnchorElement).href ?? (el as HTMLImageElement).src;
    if (v) return v;
  }
  return el.getAttribute(attr) ?? '';
}

/** 1つの項目ルールを root 内で評価する。何も取れなければ null */
export function evalField(
  root: ParentNode,
  rule: FieldRule,
): { text: string; truncated: boolean } | null {
  if (!rule.selector.trim()) return null;
  const els = rule.match === 'all' ? safeAll(root, rule.selector) : [safeOne(root, rule.selector)];
  const values: string[] = [];
  for (const el of els) {
    if (!el) continue;
    let v = rule.attr ? normalizeText(attrValue(el, rule.attr)) : textOf(el);
    if (SINGLE_LINE_ROLES.includes(rule.role)) v = v.replace(/\s+/g, ' ').trim();
    if (v && !values.includes(v)) values.push(v);
  }
  if (values.length === 0) return null;
  const joined = values.join(rule.joinWith ?? (rule.match === 'all' ? '\n' : ''));
  const cap = rule.maxChars == null ? HARD_CAP : Math.min(rule.maxChars, HARD_CAP);
  return truncate(joined, cap);
}

function permalinkOf(el: Element, selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  const target = safeOne(el, selector);
  if (!target) return undefined;
  const a = target.closest('a') ?? (target as HTMLAnchorElement);
  const href = (a as HTMLAnchorElement).href;
  return href && /^https?:/.test(href) ? href : undefined;
}

function buildUnit(el: Element, rule: UnitRule): ProfileDraft | null {
  let body: { label: string; text: string; truncated: boolean } | null = null;
  const extras: NonNullable<ProfileDraft['extras']> = [];
  for (const f of rule.fields) {
    const v = evalField(el, f);
    if (!v) continue;
    if (f.role === 'body' && !body) body = { label: f.label, ...v };
    else extras.push({ label: f.label, role: f.role, text: v.text });
  }
  if (!body) return null;
  const anchorEl = rule.anchorSelector ? safeOne(el, rule.anchorSelector) : null;
  const anchor = anchorEl ? textOf(anchorEl).replace(/\s+/g, ' ') : undefined;
  return {
    fieldLabel: body.label,
    role: 'body',
    text: body.text,
    truncated: body.truncated,
    anchor: anchor || undefined,
    permalink: permalinkOf(el, rule.permalinkSelector),
    extras: extras.length > 0 ? extras : undefined,
  };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** out.units には、保存に使った単位の要素が入る（スナップショットの範囲に使う） */
export function runProfile(profile: SiteProfile, doc: Document, win: Window, out?: { units: Element[] }): ProfileExtraction {
  const result: ProfileExtraction = {
    profileId: profile.id,
    fieldDrafts: [],
    unitDrafts: [],
    unitsFromSelection: false,
  };

  for (const f of profile.fields) {
    const v = evalField(doc, f);
    if (v) result.fieldDrafts.push({ fieldLabel: f.label, role: f.role, text: v.text, truncated: v.truncated });
  }

  const rule = profile.unit;
  if (!rule?.selector.trim()) return result;
  const unitEls = safeAll(doc, rule.selector);
  if (unitEls.length === 0) return result;

  // 範囲選択がかかっている単位を調べる
  const sel = win.getSelection?.();
  const range = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : null;
  if (range) {
    const hit = unitEls.filter((el) => range.intersectsNode(el));
    const insideOne = hit.length === 1 && hit[0]!.contains(range.commonAncestorContainer);
    if (hit.length > 0 && !insideOne) {
      for (const el of hit.slice(0, MAX_SELECTED_UNITS)) {
        const d = buildUnit(el, rule);
        if (d) {
          result.unitDrafts.push(d);
          out?.units.push(el);
        }
      }
      if (result.unitDrafts.length > 0) {
        result.unitsFromSelection = true;
        return result;
      }
    }
    if (insideOne) {
      const d = buildUnit(hit[0]!, rule);
      result.selectionAnchor = d?.anchor;
      result.selectionPermalink = d?.permalink;
    }
  }

  // 既定: URLと同じ permalink を持つ単位（X の投稿詳細など）。なければ最初の単位
  const here = pathOf(doc.location?.href ?? '');
  let fallback: ProfileDraft | null = null;
  let fallbackEl: Element | null = null;
  for (const el of unitEls) {
    const d = buildUnit(el, rule);
    if (!d) continue;
    if (!fallback) [fallback, fallbackEl] = [d, el];
    if (d.permalink && pathOf(d.permalink) === here) {
      [fallback, fallbackEl] = [d, el];
      break;
    }
  }
  if (fallback) result.unitDrafts.push(fallback);
  if (fallbackEl) out?.units.push(fallbackEl);
  return result;
}

export const SNAP_ATTR = 'data-scrapai-snap';

/**
 * スナップショットの範囲を決めて印を付ける（撮影は background が後で行う）。
 * 撮れないとき（設定がオフ・範囲がない・when の要素がない）は null。
 */
export function markSnapshotTarget(
  rule: SiteProfile['snapshot'],
  doc: Document,
  units: Element[],
): 'ask' | 'auto' | null {
  doc.querySelectorAll(`[${SNAP_ATTR}]`).forEach((el) => el.removeAttribute(SNAP_ATTR));
  if (!rule || rule.mode === 'off' || !rule.selector.trim()) return null;
  let el: Element | null = null;
  try {
    el = rule.selector.trim() === '@unit' ? (units[0] ?? null) : doc.querySelector(rule.selector);
    if (el && rule.when?.trim() && !el.querySelector(rule.when)) el = null;
  } catch {
    return null; // セレクタの書き間違い
  }
  if (!el) return null;
  el.setAttribute(SNAP_ATTR, '');
  return rule.mode;
}
