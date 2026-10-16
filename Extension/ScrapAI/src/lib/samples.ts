import { addAiAnswer } from './ai-db';
import { createCategory, db } from './db';
import type { Fragment, Scrap } from './types';

// 初めて入れたときに一覧へ置くサンプル3件。見れば何ができるか分かり、普通の項目と同じ手順で消せる。
// 一度作ったら（消されても）二度と作らない。

const SEEDED_KEY = 'samplesSeeded';

type Lang = 'ja' | 'en';

const T = {
  ja: {
    category: 'サンプル',
    deleteMemo: '使い終わったら、右上の「…」→「削除」を2回押すと消せます。',
    a: {
      title: 'ScrapAIで残す: 気になったページはボタン1つで保存',
      body: 'ブラウザのツールバーのScrapAIのアイコンを押し、「このページをスクラップ」を押すと、タイトル・URL・本文がこのブラウザの中に保存されます。外部には送られません。\n\nページの一部だけ残したいときは、その部分を範囲選択してから保存します。同じページで何度か選んで保存すると、断片として追加されていきます。\n\n保存したものには、星・カテゴリ・メモを付けて、あとから検索や絞り込みで探せます。',
      memo: '保存しただけの例です。星とメモを付けています。',
    },
    b: {
      title: 'Long article about organizing research notes',
      body: 'Researchers often collect dozens of articles before they write anything. Without a way to recall why each one mattered, the collection turns into a pile that is never read again. This sample shows how an AI answer turns a long text into something you can recall in five seconds.',
      answer: `\`\`\`markdown
## 見出し
AIの要約で、あとから5秒で思い出せる
## 要点
- 保存した記事は、理由を忘れると読み返されなくなる
- AIの回答を見出しごとに残すと、一覧で中身が分かる
- 一覧の「AI要約／原文」で、元の内容にもすぐ戻せる
## 有用性
調べものを貯める人が、あとで探すときに使える
## 次回AIに渡す指示
この要点をもとに、調べものを整理する手順を3つ提案してください。
## 出典URL
https://example.com/scrapai/sample-ai
\`\`\``,
      memo: 'AIの回答を貼り付けた例です。一覧の「AI」の印と、詳細の「AI要約」を見てください。英語の記事でも回答は日本語で返ります。',
    },
    c: {
      title: 'SNSの投稿を範囲選択で保存した例',
      posts: [
        { author: 'サンプルさん @sample', date: '2026-10-01', text: '拡張機能で、気になった投稿だけを切り抜いて保存できるようにした。ページ全体ではなく、選んだ投稿だけ残せる。' },
        { author: '別の人 @another', date: '2026-10-01', text: '返信も選べば一緒に残せるのが便利。あとで1件ずつ「別の項目に切り出す」こともできる。' },
      ],
      memo: '投稿ごとの断片が2つあります。断片の「別の項目に切り出す」で分けられます。',
    },
  },
  en: {
    category: 'Sample',
    deleteMemo: 'When you are done, open “…” at the top right and click Delete twice to remove it.',
    a: {
      title: 'Keep it with ScrapAI: save any page with one click',
      body: 'Click the ScrapAI icon in the toolbar and choose “Scrap this page”. The title, URL and text are saved inside this browser. Nothing is sent anywhere.\n\nTo keep only part of a page, select it before saving. Saving several selections from the same page adds them as fragments.\n\nAdd stars, categories and notes, then find things later with search and filters.',
      memo: 'A plain saved page. It has stars and a note.',
    },
    b: {
      title: 'Long article about organizing research notes',
      body: 'Researchers often collect dozens of articles before they write anything. Without a way to recall why each one mattered, the collection turns into a pile that is never read again. This sample shows how an AI answer turns a long text into something you can recall in five seconds.',
      answer: `\`\`\`markdown
## Headline
Recall any article in five seconds with an AI summary
## Key points
- Saved articles go unread once you forget why you saved them
- Keeping the AI answer by heading makes the list readable
- “AI summary / Original” switches back to the source at any time
## Usefulness
For anyone who collects research and needs to find it again
## Prompt for the next AI
Based on these key points, suggest three steps to organize research notes.
## Source URLs
https://example.com/scrapai/sample-ai
\`\`\``,
      memo: 'An AI answer pasted back. Look for the “AI” mark in the list and the AI summary in the detail view.',
    },
    c: {
      title: 'Posts saved from a social feed by selection',
      posts: [
        { author: 'Sample @sample', date: '2026-10-01', text: 'Made it possible to clip only the posts I care about, instead of the whole page.' },
        { author: 'Someone else @another', date: '2026-10-01', text: 'Replies can be kept too. Each one can be split into its own item later.' },
      ],
      memo: 'Two post fragments. Use “Split into a new item” on a fragment to separate them.',
    },
  },
};

/** まだ作っていなければ、サンプル3件を作る。作ったら true */
export async function seedSamples(lang: Lang, now = Date.now()): Promise<boolean> {
  if ((await db.meta.get(SEEDED_KEY))?.value) return false;
  await db.meta.put({ key: SEEDED_KEY, value: true }); // 先に印を付け、二重に作らない
  const L = T[lang];
  const cat = await createCategory(L.category);

  const scrap = (id: string, p: Partial<Scrap> & Pick<Scrap, 'title' | 'url' | 'excerpt'>, at: number): Scrap => ({
    id,
    normalizedUrl: p.url,
    siteName: new URL(p.url).hostname,
    domain: new URL(p.url).hostname,
    extractStatus: 'ok',
    stars: null,
    pinned: false,
    archivedAt: null,
    categoryIds: [cat.id],
    memo: '',
    aiAnswerCount: 0,
    createdAt: at,
    updatedAt: at,
    ...p,
  });
  const frag = (scrapId: string, order: number, p: Partial<Fragment> & Pick<Fragment, 'text'>, at: number): Fragment => ({
    id: crypto.randomUUID(),
    scrapId,
    order,
    source: 'rule',
    fieldLabel: 'article',
    role: 'body',
    truncated: false,
    createdAt: at,
    ...p,
  });

  // ① 保存しただけ
  const a = crypto.randomUUID();
  await db.scraps.add(scrap(a, { title: L.a.title, url: 'https://example.com/scrapai/sample-saved', excerpt: L.a.body.slice(0, 120), stars: 4, memo: `${L.a.memo}\n${L.deleteMemo}` }, now - 3000));
  await db.fragments.add(frag(a, 0, { text: L.a.body, source: 'readability' }, now - 3000));

  // ② AIで要約した（タイトルはそのまま、一覧の「AI要約」表示で見出しが出る）
  const b = crypto.randomUUID();
  await db.scraps.add(scrap(b, { title: L.b.title, url: 'https://example.com/scrapai/sample-ai', excerpt: L.b.body.slice(0, 120), memo: `${L.b.memo}\n${L.deleteMemo}` }, now - 2000));
  await db.fragments.add(frag(b, 0, { text: L.b.body, source: 'readability' }, now - 2000));
  await addAiAnswer({ scrapId: b, raw: L.b.answer, service: 'claude', templateId: 'builtin-summary', expected: ['headline', 'summary', 'usefulness', 'nextPrompt', 'sources'], now: now - 1500 });

  // ③ SNSの投稿を範囲選択で保存した（投稿ごとの断片）
  const c = crypto.randomUUID();
  await db.scraps.add(scrap(c, { title: L.c.title, url: 'https://sns.example.com/sample/status/1', excerpt: L.c.posts[0]!.text.slice(0, 120), stars: 5, memo: `${L.c.memo}\n${L.deleteMemo}` }, now - 1000));
  await db.fragments.bulkAdd(
    L.c.posts.map((x, i) =>
      frag(c, i, {
        text: x.text,
        source: 'selection',
        fieldLabel: 'post',
        extras: [
          { label: 'author', role: 'author', text: x.author },
          { label: 'date', role: 'date', text: x.date },
        ],
      }, now - 1000),
    ),
  );
  return true;
}
