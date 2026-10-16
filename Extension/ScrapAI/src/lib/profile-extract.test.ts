// @vitest-environment jsdom
import futaba from './__fixtures__/futaba-thread.html?raw';
import xStatus from './__fixtures__/x-status.html?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from './builtin-profiles';
import { evalField, markSnapshotTarget, runProfile, SNAP_ATTR, textOf } from './profile-extract';
import { generateSelector } from './selector-gen';
import type { FieldRule, SiteProfile } from './types';

const profile = (id: string): SiteProfile => {
  const p = BUILTIN_PROFILES.find((x) => x.id === id)!;
  return { ...p, createdAt: 1, updatedAt: 1 };
};
const FIXTURES: Record<string, string> = { 'futaba-thread.html': futaba, 'x-status.html': xStatus };
const load = (name: string, path = '/') => {
  document.documentElement.innerHTML = FIXTURES[name]!;
  window.history.pushState({}, '', path);
  window.getSelection()?.removeAllRanges();
};
const select = (from: Element, to: Element) => {
  const r = document.createRange();
  r.setStartBefore(from);
  r.setEndAfter(to);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
};

describe('textOf', () => {
  it('<br> とブロック境界を改行にし、画像は alt、省略リンクは href にする', () => {
    document.body.innerHTML =
      '<div id="a">1行目<br>2行目<p>段落</p><img alt="😀">末尾 <a href="https://e.com/long">https://e.com/lo…</a></div>';
    expect(textOf(document.getElementById('a')!)).toBe('1行目\n2行目\n段落\n😀末尾 https://e.com/long');
  });
});

describe('evalField', () => {
  const rule = (p: Partial<FieldRule>): FieldRule => ({
    id: 'r', label: 'l', role: 'body', selector: 'p', match: 'first', maxChars: null, ...p,
  });
  it('first / all+joinWith / attr / 上限', () => {
    document.body.innerHTML = '<p>あいうえお</p><p>かき</p><a href="/x" class="t">T</a>';
    expect(evalField(document, rule({}))?.text).toBe('あいうえお');
    expect(evalField(document, rule({ match: 'all', joinWith: ', ' }))?.text).toBe('あいうえお, かき');
    expect(evalField(document, rule({ selector: 'a.t', attr: 'href' }))?.text).toBe('http://localhost:3000/x');
    expect(evalField(document, rule({ maxChars: 3 }))).toEqual({ text: 'あいう', truncated: true });
  });
  it('見つからない・不正なセレクタは null', () => {
    document.body.innerHTML = '<p>a</p>';
    expect(evalField(document, rule({ selector: '.none' }))).toBeNull();
    expect(evalField(document, rule({ selector: '[[[' }))).toBeNull();
  });
});

describe('ふたば（実ページ由来の見本）', () => {
  beforeEach(() => load('futaba-thread.html', '/b/res/1478296132.htm'));
  const p = () => profile('builtin-futaba');

  it('選択なし: スレ主の投稿を1断片で取る（番号・日時つき）', () => {
    const r = runProfile(p(), document, window);
    expect(r.unitsFromSelection).toBe(false);
    expect(r.unitDrafts).toHaveLength(1);
    const d = r.unitDrafts[0]!;
    expect(d.text).toBe('デイリーガルド教えて\n今日の初遭遇ガルドはドワーフのガルドだった');
    expect(d.anchor).toBe('No.1478296132');
    expect(d.extras?.[0]?.text).toBe('26/10/16(金)11:36:04');
  });

  it('複数のレスにまたがる選択: レスごとに別の断片になる', () => {
    const tds = document.querySelectorAll('td.rtd');
    select(tds[0]!, tds[2]!);
    const r = runProfile(p(), document, window);
    expect(r.unitsFromSelection).toBe(true);
    expect(r.unitDrafts.map((d) => d.anchor)).toEqual(['No.1478298230', 'No.1478298627', 'No.1478298836']);
    expect(r.unitDrafts[1]!.text).toBe('コナンの新刊見たら\n殺害の動機がWSSでzetaのプロットみを感じた');
  });

  it('1つのレスの中の選択: 選択テキストはそのまま、番号だけ引き継ぐ', () => {
    const bq = document.querySelectorAll('td.rtd blockquote')[1]!;
    select(bq.firstChild as Element, bq.firstChild as Element);
    const r = runProfile(p(), document, window);
    expect(r.unitsFromSelection).toBe(false);
    expect(r.selectionAnchor).toBe('No.1478298627');
  });
});

describe('X（実ページ由来の見本）', () => {
  const p = () => profile('builtin-x');
  it('URLの投稿を既定で取る。引用ツイートではなく本人の本文・投稿者・日時・リンク', () => {
    load('x-status.html', '/thedelost/status/2110472847084650726');
    const r = runProfile(p(), document, window);
    const d = r.unitDrafts[0]!;
    expect(d.text.startsWith('これは純粋なクソ金脈だ')).toBe(true);
    expect(d.text).toContain('claude --model opus --effort ultracode');
    expect(d.text).toContain('https://code.claude.com/docs/en/workflows'); // 省略表示のリンクは完全なURLに
    expect(d.extras?.find((x) => x.role === 'author')?.text).toBe('delost @thedelost');
    expect(d.extras?.find((x) => x.role === 'date')?.text).toBe('2026-10-14T20:48:32.000Z');
    expect(d.permalink).toBe('https://x.com/thedelost/status/2110472847084650726');
  });
  it('URLが2番目の投稿を指すなら、そちらを既定にする', () => {
    load('x-status.html', '/Ex0_Byte/status/2110736737148248486');
    const d = runProfile(p(), document, window).unitDrafts[0]!;
    expect(d.text).toContain('私が今まで見た中で最もバカげた投稿');
    expect(d.extras?.find((x) => x.role === 'author')?.text).toContain('@Ex0_Byte');
  });
});

describe('selector-gen', () => {
  it('data-testid を優先し、生成したセレクタが元の要素に一致する', () => {
    load('x-status.html', '/thedelost/status/2110472847084650726');
    const el = document.querySelector('[data-testid="tweetText"]')!;
    const g = generateSelector(el, document);
    expect(g.selector).toContain('data-testid="tweetText"');
    expect(document.querySelector(g.selector)).toBe(el);
  });
  it('ハッシュ風クラス・数字だらけのidは使わず、重なる兄弟は nth-of-type で区別する', () => {
    document.body.innerHTML =
      '<div id="x"><ul class="list"><li class="css-1a2b3c r-9z">a</li><li class="css-1a2b3c r-9z" id="id__98765">b</li></ul></div>';
    const el = document.querySelectorAll('li')[1]!;
    const g = generateSelector(el, document);
    expect(g.selector).not.toMatch(/css-|r-9z|98765/);
    expect(g.matchCount).toBe(1);
    expect(document.querySelector(g.selector)).toBe(el);
  });
});

const XPATH = '/thedelost/status/2110472847084650726';
describe('スナップショットの範囲（X）', () => {
  it('動画のある投稿では、保存した投稿に印を付けて「たずねる」を返す', () => {
    load('x-status.html', XPATH);
    const out = { units: [] as Element[] };
    const p = profile('builtin-x');
    runProfile(p, document, window, out);
    expect(markSnapshotTarget(p.snapshot, document, out.units)).toBe('ask');
    const marked = document.querySelectorAll(`[${SNAP_ATTR}]`);
    expect(marked.length).toBe(1);
    expect(marked[0]).toBe(out.units[0]);
  });

  it('画像・動画・引用がなければ撮らない。オフ・不正なセレクタでも落ちない', () => {
    load('x-status.html', XPATH);
    const unit = document.querySelector('article[data-testid="tweet"]')!;
    unit.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.wrapper"], div[role="link"]').forEach((e) => e.remove());
    const p = profile('builtin-x');
    expect(markSnapshotTarget(p.snapshot, document, [unit])).toBeNull();
    expect(document.querySelector(`[${SNAP_ATTR}]`)).toBeNull();
    expect(markSnapshotTarget({ mode: 'off', selector: '@unit' }, document, [unit])).toBeNull();
    expect(markSnapshotTarget({ mode: 'auto', selector: '[[bad' }, document, [unit])).toBeNull();
    expect(markSnapshotTarget({ mode: 'auto', selector: 'article' }, document, [])).toBe('auto');
  });
});
