import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, BUILTIN_VERSION, ensureBuiltInProfiles, resetBuiltInProfile } from './builtin-profiles';
import { db, deleteProfile, listFragments, newProfile, saveProfile } from './db';
import type { ExtractResult } from './extract-page';
import type { ProfileDraft, ProfileExtraction } from './profile-extract';
import { saveFromPage } from './save';

const settings = { articleMaxChars: 3000 as number | null };
const tab = { url: 'https://img.2chan.net/b/res/1478296132.htm', title: 'スレ' };

const draft = (text: string, anchor?: string): ProfileDraft => ({
  fieldLabel: 'res', role: 'body', text, truncated: false, anchor,
  extras: [{ label: 'date', role: 'date', text: '26/10/16' }],
});
const ex = (over: Partial<ExtractResult> = {}, profile?: Partial<ProfileExtraction>): ExtractResult => ({
  url: tab.url, title: tab.title, ogTitle: '', siteName: '', description: 'ページ概要', ogImage: '', faviconUrl: '',
  selection: '', articleTitle: '', articleText: '汎用本文', lang: '',
  profile: profile ? { profileId: 'builtin-futaba', fieldDrafts: [], unitDrafts: [], unitsFromSelection: false, ...profile } : undefined,
  ...over,
});
const run = (e: ExtractResult, mode: 'auto' | 'reextract' | 'separate' = 'auto') =>
  saveFromPage(tab, async () => e, settings, mode);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('サイトプロファイル付きの保存', () => {
  it('本文が取れたら汎用の本文・概要の代わりにプロファイルの結果を保存する', async () => {
    const out = await run(ex({}, { unitDrafts: [draft('スレ主の投稿', 'No.1')] }));
    const frags = await listFragments(out.scrapId!);
    expect(frags.map((f) => [f.source, f.fieldLabel, f.anchor])).toEqual([['rule', 'res', 'No.1']]);
    expect(frags[0]!.extras?.[0]?.text).toBe('26/10/16');
    const scrap = await db.scraps.get(out.scrapId!);
    expect(scrap?.profileId).toBe('builtin-futaba');
    expect(scrap?.excerpt).toBe('スレ主の投稿');
    expect(out.extractStatus).toBe('ok');
  });

  it('プロファイルが何も取れなければ汎用抽出に切り替わる（保存が空にならない）', async () => {
    const out = await run(ex({}, {}));
    const frags = await listFragments(out.scrapId!);
    expect(frags.map((f) => f.source)).toEqual(['readability', 'meta']);
  });

  it('本文以外（概要など）だけ取れたときは、汎用の本文も併せて保存する', async () => {
    const out = await run(ex({}, { fieldDrafts: [{ fieldLabel: 'about', role: 'custom', text: '説明', truncated: false }] }));
    const frags = await listFragments(out.scrapId!);
    expect(frags.map((f) => f.source)).toEqual(['rule', 'readability', 'meta']);
  });

  it('複数レスの範囲選択は、レスごとの断片として既存の項目に追加される', async () => {
    const first = await run(ex({}, { unitDrafts: [draft('スレ主の投稿', 'No.1')] }));
    const out = await run(
      ex({ selection: 'レスA レスB' }, { unitsFromSelection: true, unitDrafts: [draft('レスA', 'No.2'), draft('レスB', 'No.3')] }),
    );
    expect(out.kind).toBe('fragment-added');
    expect(out.scrapId).toBe(first.scrapId);
    expect(out.addedFragmentIds).toHaveLength(2);
    const frags = await listFragments(first.scrapId!);
    expect(frags.map((f) => f.anchor)).toEqual(['No.1', 'No.2', 'No.3']);
    // 同じ選択をもう一度保存しても重複しない
    const again = await run(
      ex({ selection: 'レスA レスB' }, { unitsFromSelection: true, unitDrafts: [draft('レスA', 'No.2'), draft('レスB', 'No.3')] }),
    );
    expect(again.kind).toBe('duplicate-fragment');
  });

  it('1つのレス内の選択は選択テキストのまま、番号を引き継ぐ', async () => {
    const out = await run(ex({ selection: '一部だけ' }, { selectionAnchor: 'No.5', unitDrafts: [draft('全文', 'No.1')] }));
    const frags = await listFragments(out.scrapId!);
    const sel = frags.find((f) => f.source === 'selection')!;
    expect(sel.text).toBe('一部だけ');
    expect(sel.anchor).toBe('No.5');
  });
});

describe('組み込みプロファイルの管理', () => {
  it('初回に全て登録され、2回目は重複しない', async () => {
    await ensureBuiltInProfiles();
    await ensureBuiltInProfiles();
    expect(await db.siteProfiles.count()).toBe(BUILTIN_PROFILES.length);
  });

  it('ユーザーが編集したものは更新で上書きされず、既定に戻せる', async () => {
    await ensureBuiltInProfiles();
    const x = (await db.siteProfiles.get('builtin-x'))!;
    await saveProfile({ ...x, name: '自分のX', builtInVersion: 0 });
    expect((await db.siteProfiles.get('builtin-x'))?.modified).toBe(true);
    await ensureBuiltInProfiles();
    expect((await db.siteProfiles.get('builtin-x'))?.name).toBe('自分のX');
    await resetBuiltInProfile('builtin-x');
    const reset = (await db.siteProfiles.get('builtin-x'))!;
    expect(reset.name).toBe('X (Twitter)');
    expect(reset.modified).toBeUndefined();
    expect(reset.builtInVersion).toBe(BUILTIN_VERSION);
  });

  it('未編集で版が古い組み込みは更新される（有効/無効は維持）', async () => {
    await ensureBuiltInProfiles();
    const x = (await db.siteProfiles.get('builtin-x'))!;
    await db.siteProfiles.put({ ...x, name: '古い', builtInVersion: 0, enabled: false });
    await ensureBuiltInProfiles();
    const now = (await db.siteProfiles.get('builtin-x'))!;
    expect(now.name).toBe('X (Twitter)');
    expect(now.enabled).toBe(false);
  });

  it('自作プロファイルは削除でき、組み込みは削除できない', async () => {
    await ensureBuiltInProfiles();
    const mine = newProfile({ name: 'mine', urlPatterns: ['example.com/**'] });
    await saveProfile(mine);
    await deleteProfile(mine.id);
    await deleteProfile('builtin-x');
    expect(await db.siteProfiles.get(mine.id)).toBeUndefined();
    expect(await db.siteProfiles.get('builtin-x')).toBeDefined();
  });
});
