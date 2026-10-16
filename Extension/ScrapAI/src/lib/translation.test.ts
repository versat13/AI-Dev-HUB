import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_SECTION_KEYS, buildPrompt, parseAnswer, resolveTemplates, type SectionKey } from './ai';

const TRANSLATION_KEYS: SectionKey[] = ['headline', 'translation']; // v1.0.6〜1.0.9 の翻訳回答
import { addAiAnswer, applyAnswer, cleanTitle, revertTitle, answerParts } from './ai-db';
import { db, listFragments } from './db';
import type { ExtractResult } from './extract-page';
import { filterScraps } from './query';
import { saveFromPage } from './save';

const ex: ExtractResult = {
  url: 'https://en.example/post', title: 'Hello World', ogTitle: '', siteName: '', description: '', ogImage: '',
  faviconUrl: '', selection: 'This is the English body.', articleTitle: '', articleText: '', lang: 'en',
};
const ANSWER = `## 見出し
**こんにちは世界**

## 日本語訳
これが英語の本文です。

2段落目。`;

describe('日本語訳', () => {
  beforeEach(async () => { for (const t of db.tables) await t.clear(); });

  it('既定の見出しに旧版の「日本語訳」は含まれない', () => {
    expect(ALL_SECTION_KEYS).not.toContain('translation');
    expect(ALL_SECTION_KEYS[0]).toBe('headline');
    expect(resolveTemplates([], 'ja').some((x) => x.id === 'builtin-translate')).toBe(false);
  });

  it('回答を読み取り、タイトルの装飾を外す', () => {
    const r = parseAnswer(ANSWER, TRANSLATION_KEYS);
    expect(r.parseStatus).toBe('ok');
    const p = answerParts({ sections: r.sections });
    expect(p.title).toBe('こんにちは世界');
    expect(p.body).toBe('これが英語の本文です。\n\n2段落目。');
    expect(cleanTitle('「題名」')).toBe('題名');
  });

  it('適用: タイトルが日本語になり、訳文が断片に追加され、元は残る', async () => {
    const o = await saveFromPage({ url: ex.url, title: ex.title }, async () => ex, { articleMaxChars: 3000 });
    const id = o.scrapId!;
    const a = await addAiAnswer({ scrapId: id, raw: ANSWER, expected: TRANSLATION_KEYS });
    const parts = answerParts(a);
    expect(await applyAnswer(id, parts)).toEqual({ titleChanged: true, fragmentAdded: true });
    const s = (await db.scraps.get(id))!;
    expect(s.title).toBe('こんにちは世界');
    expect(s.originalTitle).toBe('Hello World');
    const frags = await listFragments(id);
    expect(frags.map((f) => f.text)).toEqual(['This is the English body.', parts.body]);
    expect(frags[1]!.source).toBe('translation');

    // 二重適用しても増えない。元のタイトルは最初のものを保つ
    expect(await applyAnswer(id, parts)).toEqual({ titleChanged: false, fragmentAdded: false });
    expect((await listFragments(id)).length).toBe(2);
    expect((await db.scraps.get(id))!.originalTitle).toBe('Hello World');

    // 日本語タイトルでも元の英語タイトルでも検索できる
    const all = await db.scraps.toArray();
    const find = (q: string) => filterScraps(all, { ...baseParams, q }).length;
    expect(find('こんにちは')).toBe(1);
    expect(find('hello')).toBe(1);

    await revertTitle(id);
    const back = (await db.scraps.get(id))!;
    expect(back.title).toBe('Hello World');
    expect(back.originalTitle).toBeUndefined();
    expect((await listFragments(id)).length).toBe(2);
  });
});

import { DEFAULT_PARAMS } from './query';
const baseParams = DEFAULT_PARAMS;

describe('見出しの自動反映', () => {
  beforeEach(async () => { for (const t of db.tables) await t.clear(); });

  it('全組み込みテンプレートが見出しを先頭に要求する', () => {
    for (const tpl of resolveTemplates([], 'ja')) {
      expect(tpl.sections[0]).toBe('headline');
      expect(buildPrompt(tpl, { title: 'T', url: 'u', siteName: '', memo: '', createdAt: 0 }, [], 'ja')).toContain('## 見出し');
    }
  });

  it('保存時に見出しでタイトルを置き換える（applyToScrap）', async () => {
    const o = await saveFromPage({ url: ex.url, title: ex.title }, async () => ex, { articleMaxChars: 3000 });
    const a = await addAiAnswer({ scrapId: o.scrapId!, raw: '## 見出し\n英語記事の要約\n\n## 要点\n- x', applyToScrap: true });
    expect(a.applied).toEqual({ titleChanged: true, fragmentAdded: false });
    const s = (await db.scraps.get(o.scrapId!))!;
    expect(s.title).toBe('英語記事の要約');
    expect(s.originalTitle).toBe('Hello World');
  });

  it('applyToScrapなしでは置き換えない。旧形式(jaTitle)も読める', async () => {
    const o = await saveFromPage({ url: ex.url, title: ex.title }, async () => ex, { articleMaxChars: 3000 });
    await addAiAnswer({ scrapId: o.scrapId!, raw: '## 見出し\n変えない' });
    expect((await db.scraps.get(o.scrapId!))!.title).toBe('Hello World');
    expect(answerParts({ sections: [{ key: 'jaTitle', body: '旧' }] }).title).toBe('旧');
  });

  it('本文中の「タイトル：」だけの行は見出しとみなさない', () => {
    const r = parseAnswer('## 見出し\n正しい見出し\n\n## 確認済みの事実\nタイトル：\n記事名', ['headline', 'facts']);
    expect(answerParts(r).title).toBe('正しい見出し');
    expect(r.sections.find((x) => x.key === 'facts')?.body).toContain('記事名');
  });
});
