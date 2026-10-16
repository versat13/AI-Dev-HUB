import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_SECTION_KEYS, buildPrompt, parseAnswer, resolveTemplates, TRANSLATION_KEYS } from './ai';
import { addAiAnswer, applyTranslation, cleanTitle, revertTitle, translationParts } from './ai-db';
import { db, listFragments } from './db';
import type { ExtractResult } from './extract-page';
import { filterScraps } from './query';
import { saveFromPage } from './save';

const ex: ExtractResult = {
  url: 'https://en.example/post', title: 'Hello World', ogTitle: '', siteName: '', description: '', ogImage: '',
  faviconUrl: '', selection: 'This is the English body.', articleTitle: '', articleText: '', lang: 'en',
};
const ANSWER = `## 日本語タイトル
**こんにちは世界**

## 日本語訳
これが英語の本文です。

2段落目。`;

describe('日本語訳', () => {
  beforeEach(async () => { for (const t of db.tables) await t.clear(); });

  it('翻訳テンプレートの見出しは2つで、既定の見出しには含まれない', () => {
    const tpl = resolveTemplates([], 'ja').find((x) => x.id === 'builtin-translate')!;
    expect(tpl.sections).toEqual(TRANSLATION_KEYS);
    expect(ALL_SECTION_KEYS).not.toContain('jaTitle');
    const p = buildPrompt(tpl, { title: 'T', url: 'u', siteName: '', memo: '', createdAt: 0 }, [], 'ja');
    expect(p).toContain('## 日本語タイトル');
    expect(p).toContain('## 日本語訳');
  });

  it('回答を読み取り、タイトルの装飾を外す', () => {
    const r = parseAnswer(ANSWER, TRANSLATION_KEYS);
    expect(r.parseStatus).toBe('ok');
    const p = translationParts({ sections: r.sections });
    expect(p.title).toBe('こんにちは世界');
    expect(p.body).toBe('これが英語の本文です。\n\n2段落目。');
    expect(cleanTitle('「題名」')).toBe('題名');
  });

  it('適用: タイトルが日本語になり、訳文が断片に追加され、元は残る', async () => {
    const o = await saveFromPage({ url: ex.url, title: ex.title }, async () => ex, { articleMaxChars: 3000 });
    const id = o.scrapId!;
    const a = await addAiAnswer({ scrapId: id, raw: ANSWER, expected: TRANSLATION_KEYS });
    const parts = translationParts(a);
    expect(await applyTranslation(id, parts)).toEqual({ titleChanged: true, fragmentAdded: true });
    const s = (await db.scraps.get(id))!;
    expect(s.title).toBe('こんにちは世界');
    expect(s.originalTitle).toBe('Hello World');
    const frags = await listFragments(id);
    expect(frags.map((f) => f.text)).toEqual(['This is the English body.', parts.body]);
    expect(frags[1]!.source).toBe('translation');

    // 二重適用しても増えない。元のタイトルは最初のものを保つ
    expect(await applyTranslation(id, parts)).toEqual({ titleChanged: false, fragmentAdded: false });
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
