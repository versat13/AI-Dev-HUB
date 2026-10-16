import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, ensureBuiltInProfiles } from './builtin-profiles';
import { db } from './db';

const old = (id: string, modified: boolean) => ({
  id, name: id, builtIn: true, builtInVersion: 2, modified, enabled: true,
  urlPatterns: ['*.2chan.net/*/res/*'], priority: 100, fields: [], createdAt: 1, updatedAt: 1,
});

describe('組み込みプロファイルの更新', () => {
  beforeEach(async () => { await db.siteProfiles.clear(); });

  it('組み込みから外したものは、未編集なら消し、編集済みなら自作として残す', async () => {
    await db.siteProfiles.bulkAdd([old('builtin-futaba', false), old('builtin-gone', true)]);
    await ensureBuiltInProfiles();
    expect(await db.siteProfiles.get('builtin-futaba')).toBeUndefined();
    const kept = await db.siteProfiles.get('builtin-gone');
    expect(kept?.builtIn).toBe(false);
    expect(await db.siteProfiles.count()).toBe(BUILTIN_PROFILES.length + 1);
    expect((await db.siteProfiles.get('builtin-youtube'))?.snapshot?.mode).toBe('ask');
  });
});
