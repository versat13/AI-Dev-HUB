import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_SECTION_KEYS,
  BUILTIN_TEMPLATES,
  buildPrompt,
  formatBlock,
  headingKey,
  parseAnswer,
  resolveTemplates,
  sourceBlock,
} from './ai';
import { addAiAnswer, deleteAiAnswer, deleteTemplate, listAiAnswers, listCustomTemplates, newTemplate } from './ai-db';
import { db, deleteScraps } from './db';
import { loadList } from './list';
import { DEFAULT_PARAMS } from './query';
import type { Scrap } from './types';

const scrap = {
  title: 'Claude Codeの小技',
  url: 'https://x.com/u/status/1',
  siteName: 'X',
  memo: 'あとで試す',
  createdAt: Date.UTC(2026, 9, 16),
};
const frags = [
  { fieldLabel: 'post', text: '本文です', anchor: undefined, permalink: 'https://x.com/u/status/1', extras: [{ label: 'author', role: 'author' as const, text: 'delost @thedelost' }] },
  { fieldLabel: 'res', text: 'レスです', anchor: 'No.5', permalink: undefined, extras: undefined },
];
const label = (l: string) => ({ post: '投稿', res: 'レス', author: '投稿者' })[l] ?? l;

describe('プロンプト生成', () => {
  it('形式の見出しはテンプレートの節だけ、この順で並ぶ', () => {
    const f = formatBlock(['summary', 'firstStep'], 'ja');
    expect(f).toBe('## 要点\n（3〜5行の箇条書き）\n\n## 最初の一歩\n（今日できる具体的な最初の操作）');
  });

  it('資料ブロックにタイトル・URL・メモ・断片（番号・投稿者）が入る', () => {
    const s = sourceBlock(scrap, frags, 'ja', label);
    expect(s).toContain('タイトル: Claude Codeの小技');
    expect(s).toContain('URL: https://x.com/u/status/1');
    expect(s).toContain('私のメモ: あとで試す');
    expect(s).toContain('## 断片1: 投稿\n投稿者: delost @thedelost\n\n本文です');
    expect(s).toContain('## 断片2: レス / No.5\n\nレスです');
    expect(s).not.toContain('URL: https://x.com/u/status/1\n\n本文'); // 項目と同じURLは重ねない
  });

  it('上限を超えた資料は省略し、その旨を書く', () => {
    const long = [{ ...frags[1]!, text: 'あ'.repeat(50) }, { ...frags[1]!, text: 'い'.repeat(50) }];
    const s = sourceBlock(scrap, long, 'ja', label, 60);
    expect(s).toContain('あ'.repeat(50));
    expect(s).toContain('い'.repeat(10));
    expect(s).not.toContain('い'.repeat(11));
    expect(s).toContain('以降は省略');
  });

  it('組み込みテンプレートを展開できる（未知の変数は残す）', () => {
    const tpl = resolveTemplates([], 'ja').find((t) => t.id === 'builtin-verify')!;
    const p = buildPrompt(tpl, scrap, frags, 'ja', label);
    expect(p).toContain('## 次回AIに渡す指示');
    expect(p).toContain('# 資料');
    expect(p).not.toContain('{{');
    expect(buildPrompt({ body: '{{title}} {{unknown}}', sections: [] }, scrap, [], 'ja')).toBe('Claude Codeの小技 {{unknown}}');
  });

  it('英語のテンプレートもある', () => {
    for (const b of BUILTIN_TEMPLATES) expect(b.body.en).toContain('{{source}}');
    expect(resolveTemplates([], 'en')[0]!.name).toBe('Summarize and verify');
  });
});

describe('回答の読み取り', () => {
  it('見出しのゆれ（番号・太字・括弧・英語・コロン）を読み取る', () => {
    expect(headingKey('## 要点')).toBe('summary');
    expect(headingKey('### 1. 要点（3行）')).toBe('summary');
    expect(headingKey('**最初の一歩**')).toBe('firstStep');
    expect(headingKey('未確認事項：')).toBe('unverified');
    expect(headingKey('## Key points')).toBe('summary');
    expect(headingKey('# Sources')).toBe('sources');
    expect(headingKey('## 実装の詳細')).toBeNull(); // 知らない見出しは本文扱い
    expect(headingKey('要点です。今日は晴れ')).toBeNull();
  });

  it('全ての見出しがあれば ok、節の本文を取り出す', () => {
    const raw = ALL_SECTION_KEYS.map((k, i) => `## ${['見出し', '要点', '有用性', '確認済みの事実', '未確認事項・確度の根拠', '前提条件', '最初の一歩', '次回AIに渡す指示', '出典URL'][i]}\n${k}の本文`).join('\n\n');
    const r = parseAnswer('はい、まとめます。\n\n' + raw);
    expect(r.parseStatus).toBe('ok');
    expect(r.sections[0]).toEqual({ key: 'intro', body: 'はい、まとめます。' });
    expect(r.sections.find((s) => s.key === 'nextPrompt')?.body).toBe('nextPromptの本文');
  });

  it('知らない小見出しは直前の節の本文に含める', () => {
    const r = parseAnswer('## 要点\n- a\n### 詳細\n- b\n## 最初の一歩\nやる', ['summary', 'firstStep']);
    expect(r.parseStatus).toBe('ok');
    expect(r.sections.find((s) => s.key === 'summary')?.body).toBe('- a\n### 詳細\n- b');
  });

  it('一部だけなら partial、見出しが無ければ failed（節は空）', () => {
    expect(parseAnswer('## 要点\nx').parseStatus).toBe('partial');
    expect(parseAnswer('ただの文章です。\n見出しはありません。')).toEqual({ sections: [], parseStatus: 'failed' });
  });
});

describe('AI回答の保存', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  const addScrap = async (id: string) => {
    const s: Scrap = {
      id, url: 'https://e.com/' + id, normalizedUrl: 'https://e.com/' + id, title: 't' + id, siteName: '', domain: 'e.com',
      extractStatus: 'ok', stars: null, pinned: false, archivedAt: null, categoryIds: [], memo: '', excerpt: '',
      aiAnswerCount: 0, createdAt: 1, updatedAt: 1,
    };
    await db.scraps.add(s);
  };

  it('解析に失敗しても原文を保存し、件数（AI要約あり）を更新する。削除で戻る', async () => {
    await addScrap('a');
    const a1 = await addAiAnswer({ scrapId: 'a', raw: '見出しのない回答\r\nです', service: 'chatgpt', now: 10 });
    expect(a1.parseStatus).toBe('failed');
    expect(a1.raw).toBe('見出しのない回答\nです');
    await addAiAnswer({ scrapId: 'a', raw: '## 要点\nx', service: 'claude', now: 20 });
    expect((await db.scraps.get('a'))?.aiAnswerCount).toBe(2);
    expect((await listAiAnswers('a')).map((x) => x.service)).toEqual(['claude', 'chatgpt']);
    await deleteAiAnswer(a1.id);
    expect((await db.scraps.get('a'))?.aiAnswerCount).toBe(1);
  });

  it('AIの回答も検索で見つかる。項目を消すと回答も消える', async () => {
    await addScrap('a');
    await addScrap('b');
    await addAiAnswer({ scrapId: 'b', raw: '## 要点\nワークフロースクリプト' });
    const found = await loadList({ ...DEFAULT_PARAMS, q: 'ワークフロー' });
    expect(found.items.map((s) => s.id)).toEqual(['b']);
    const noneFilter = await loadList({ ...DEFAULT_PARAMS, ai: 'none' });
    expect(noneFilter.items.map((s) => s.id)).toEqual(['a']);
    await deleteScraps(['b']);
    expect(await db.aiAnswers.count()).toBe(0);
  });

  it('ユーザーのテンプレートは組み込みの後ろに並ぶ', async () => {
    const t1 = await newTemplate('自分用', '{{title}}を解説して');
    await newTemplate('二つ目', '{{url}}');
    const list = resolveTemplates(await listCustomTemplates(), 'ja');
    expect(list.slice(BUILTIN_TEMPLATES.length).map((t) => t.name)).toEqual(['自分用', '二つ目']);
    await deleteTemplate(t1.id);
    expect((await listCustomTemplates()).map((t) => t.name)).toEqual(['二つ目']);
  });
});
