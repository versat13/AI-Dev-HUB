import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, deleteScraps, listFragments } from './db';
import { seedSamples } from './samples';

describe('初回サンプル', () => {
  beforeEach(async () => { for (const t of db.tables) await t.clear(); });

  it('3件を「サンプル」カテゴリで作る。AI要約つき・断片2つのものを含む', async () => {
    expect(await seedSamples('ja')).toBe(true);
    const all = await db.scraps.toArray();
    expect(all).toHaveLength(3);
    const cat = (await db.categories.toArray())[0]!;
    expect(cat.name).toBe('サンプル');
    expect(all.every((s) => s.categoryIds.includes(cat.id))).toBe(true);
    const ai = all.find((s) => s.aiAnswerCount === 1)!;
    expect(ai.aiHeadline).toBe('AIの要約で、あとから5秒で思い出せる');
    expect((await db.aiAnswers.toArray())[0]!.parseStatus).toBe('ok');
    const sns = all.find((s) => s.url.includes('sns.example.com'))!;
    expect(await listFragments(sns.id)).toHaveLength(2);
  });

  it('消しても二度と作らない', async () => {
    await seedSamples('en');
    await deleteScraps((await db.scraps.toArray()).map((s) => s.id));
    expect(await seedSamples('en')).toBe(false);
    expect(await db.scraps.count()).toBe(0);
  });
});
