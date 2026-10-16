import { db, findScrapByNormalizedUrl, listFragments } from './db';
import type { ExtractResult } from './extract-page';
import type { ProfileDraft } from './profile-extract';
import { cleanPageTitle, excerptOf, normalizeText, truncate } from './text';
import type {
  ExtractStatus,
  Fragment,
  SaveMode,
  SaveOutcome,
  Scrap,
  Settings,
} from './types';
import { domainOf, normalizeUrl } from './url';

export interface TabInfo {
  url: string;
  title: string;
}

/** ページ内抽出を実行する関数。失敗したら reject してよい（保存は続行される） */
export type Extractor = () => Promise<ExtractResult | null | undefined>;

type FragmentDraft = Omit<Fragment, 'id' | 'scrapId' | 'order' | 'createdAt'>;

function uuid(): string {
  return crypto.randomUUID();
}

async function safeExtract(extract: Extractor): Promise<ExtractResult | null> {
  try {
    return (await extract()) ?? null;
  } catch {
    return null;
  }
}

/** 抽出結果から保存する断片の下書きを作る */
export function buildDrafts(
  ex: ExtractResult | null,
  settings: Pick<Settings, 'articleMaxChars'>,
  opts: { selection: boolean; article: boolean; description: boolean },
): FragmentDraft[] {
  if (!ex) return [];
  const drafts: FragmentDraft[] = [];
  const p = ex.profile;
  const ruleDraft = (d: ProfileDraft): FragmentDraft => ({
    source: 'rule',
    fieldLabel: d.fieldLabel,
    role: d.role,
    text: d.text,
    truncated: d.truncated,
    anchor: d.anchor,
    permalink: d.permalink,
    extras: d.extras,
  });

  // 範囲選択: 複数の単位（レス・投稿）にまたがる選択は単位ごとの断片に、それ以外は選択テキストそのものを保存する
  if (opts.selection) {
    if (p?.unitsFromSelection) {
      drafts.push(...p.unitDrafts.map(ruleDraft));
    } else {
      const selection = normalizeText(ex.selection);
      if (selection) {
        drafts.push({
          source: 'selection',
          fieldLabel: 'selection',
          role: 'body',
          text: selection,
          truncated: false,
          anchor: p?.selectionAnchor,
          permalink: p?.selectionPermalink,
        });
      }
    }
  }

  // サイトプロファイルの結果。本文が取れたら汎用抽出（本文・概要）の代わりに使い、
  // 取れなければ汎用抽出も併用する（保存が空にならないようにする）
  const ruleDrafts = p
    ? [...p.fieldDrafts, ...(p.unitsFromSelection ? [] : p.unitDrafts)].map(ruleDraft)
    : [];
  const ruleHasBody = ruleDrafts.some((d) => d.role === 'body');
  if (opts.article) drafts.push(...ruleDrafts);

  if (!(opts.article && ruleHasBody)) {
    const article = normalizeText(ex.articleText);
    if (opts.article && article) {
      const cut = truncate(article, settings.articleMaxChars);
      drafts.push({
        source: 'readability',
        fieldLabel: 'article',
        role: 'body',
        text: cut.text,
        truncated: cut.truncated,
      });
    }

    const description = normalizeText(ex.description);
    if (opts.description && description) {
      drafts.push({
        source: 'meta',
        fieldLabel: 'description',
        role: 'custom',
        text: description,
        truncated: false,
      });
    }
  }
  return drafts;
}

function statusOf(drafts: FragmentDraft[]): ExtractStatus {
  if (drafts.some((d) => d.source === 'selection' || d.source === 'readability' || d.source === 'rule')) {
    return 'ok';
  }
  return drafts.length > 0 ? 'partial' : 'failed';
}

/**
 * 現在のページを保存する。
 * 1. まず URL・タイトルだけで Scrap を確定保存する（抽出失敗でもデータが残る）
 * 2. その後に抽出を実行し、断片を追記する
 * 同じURLが既にあれば、新しい Scrap は作らず断片を追加するのを基本動作とする。
 */
export async function saveFromPage(
  tab: TabInfo,
  extract: Extractor,
  settings: Pick<Settings, 'articleMaxChars'>,
  mode: SaveMode = 'auto',
  now: number = Date.now(),
): Promise<SaveOutcome> {
  const url = tab.url?.trim();
  if (!url) return { kind: 'failed', error: 'no-url' };

  const normalizedUrl = normalizeUrl(url);
  const existing = mode === 'separate' ? undefined : await findScrapByNormalizedUrl(normalizedUrl);

  if (!existing) {
    const domain = domainOf(url);
    const scrap: Scrap = {
      id: uuid(),
      url,
      normalizedUrl,
      title: tab.title?.trim() || url,
      siteName: domain,
      domain,
      extractStatus: 'failed', // 抽出に成功するまでの仮状態
      stars: null,
      pinned: false,
      archivedAt: null,
      categoryIds: [],
      memo: '',
      excerpt: '',
      aiAnswerCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.scraps.add(scrap);

    const ex = await safeExtract(extract);
    const drafts = buildDrafts(ex, settings, { selection: true, article: true, description: true });
    const extractStatus = statusOf(drafts);
    const rawTitle = tab.title?.trim() || ex?.ogTitle || ex?.articleTitle || url;
    const title = cleanPageTitle(rawTitle, {
      siteName: ex?.siteName,
      domain,
      body: drafts.find((d) => d.role === 'body' && d.source !== 'readability')?.text,
    });

    await db.transaction('rw', db.scraps, db.fragments, async () => {
      if (drafts.length > 0) {
        await db.fragments.bulkAdd(
          drafts.map((d, i) => ({ ...d, id: uuid(), scrapId: scrap.id, order: i, createdAt: now })),
        );
      }
      await db.scraps.update(scrap.id, {
        title,
        siteName: ex?.siteName || domain,
        ogImageUrl: ex?.ogImage || undefined,
        faviconUrl: ex?.faviconUrl || undefined,
        extractStatus,
        profileId: ex?.profile?.profileId,
        excerpt: excerptOf(drafts),
        updatedAt: now,
      });
    });

    return {
      kind: 'created',
      scrapId: scrap.id,
      title,
      extractStatus,
      fragmentCount: drafts.length,
    };
  }

  // 既存の項目がある場合
  const ex = await safeExtract(extract);
  const hasSelection = !!ex && normalizeText(ex.selection).length > 0;

  if (mode === 'auto' && !hasSelection) {
    // 選択がなければ何も変更せず「保存済み」を伝える
    const count = await db.fragments.where('scrapId').equals(existing.id).count();
    return {
      kind: 'already-saved',
      scrapId: existing.id,
      title: existing.title,
      extractStatus: existing.extractStatus,
      fragmentCount: count,
    };
  }

  // 範囲選択があるときは選択テキストだけを、再抽出のときは選択＋本文＋概要を追加候補にする
  const drafts =
    mode === 'reextract'
      ? buildDrafts(ex, settings, { selection: true, article: true, description: true })
      : buildDrafts(ex, settings, { selection: true, article: false, description: false });

  const current = await listFragments(existing.id);
  const known = new Set(current.map((f) => f.text));
  const fresh = drafts.filter((d) => !known.has(d.text));

  if (fresh.length === 0) {
    return {
      kind: 'duplicate-fragment',
      scrapId: existing.id,
      title: existing.title,
      extractStatus: existing.extractStatus,
      fragmentCount: current.length,
    };
  }

  const startOrder = current.reduce((m, f) => Math.max(m, f.order), -1) + 1;
  const nextStatus: ExtractStatus =
    existing.extractStatus === 'ok' ? 'ok' : statusOf(fresh) === 'failed' ? existing.extractStatus : statusOf(fresh);
  const rows: Fragment[] = fresh.map((d, i) => ({
    ...d,
    id: uuid(),
    scrapId: existing.id,
    order: startOrder + i,
    createdAt: now,
  }));

  await db.transaction('rw', db.scraps, db.fragments, async () => {
    await db.fragments.bulkAdd(rows);
    await db.scraps.update(existing.id, {
      extractStatus: nextStatus,
      excerpt: existing.excerpt || excerptOf(fresh),
      archivedAt: null, // アーカイブ済みなら自動で復元する
      updatedAt: now,
    });
  });

  return {
    kind: 'fragment-added',
    scrapId: existing.id,
    title: existing.title,
    extractStatus: nextStatus,
    fragmentCount: current.length + rows.length,
    addedFragmentIds: rows.map((r) => r.id),
  };
}
