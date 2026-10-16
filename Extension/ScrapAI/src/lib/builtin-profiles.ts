import { db } from './db';
import type { FieldRule, SiteProfile, UnitRule } from './types';

// 組み込みサイトプロファイル。セレクタは各サイトの現行DOMに基づく初期値で、
// サイト側の変更で合わなくなったときはユーザーが管理画面で編集できる。
// 何も取れなかった場合は汎用抽出（Readability）に自動で切り替わるため、保存は失敗しない。
// 内容を変えたら BUILTIN_VERSION を上げる（ユーザーが編集していないものだけ更新される）。

export const BUILTIN_VERSION = 1;

const f = (
  id: string,
  label: string,
  role: FieldRule['role'],
  selector: string,
  extra: Partial<FieldRule> = {},
): FieldRule => ({ id, label, role, selector, match: 'first', maxChars: null, ...extra });

const xUnit: UnitRule = {
  selector: 'article[data-testid="tweet"]',
  permalinkSelector: 'a[href*="/status/"] time',
  fields: [
    f('body', 'post', 'body', '[data-testid="tweetText"]', { maxChars: 3000 }),
    f('author', 'author', 'author', '[data-testid="User-Name"]'),
    f('date', 'date', 'date', 'a[href*="/status/"] time', { attr: 'datetime' }),
  ],
};

const futabaUnit: UnitRule = {
  selector: '#master, td.rtd',
  anchorSelector: '.cno',
  fields: [
    f('body', 'res', 'body', 'blockquote', { maxChars: 3000 }),
    f('date', 'date', 'date', '.cnw'),
  ],
};

const githubRepoFields: FieldRule[] = [
  f(
    'about',
    'about',
    'custom',
    '[data-testid="about-section"] p, .BorderGrid-cell p.f4',
  ),
  f('topics', 'topics', 'custom', 'a.topic-tag', { match: 'all', joinWith: ', ' }),
  f('readme', 'readme', 'body', '#readme article.markdown-body, article.markdown-body', { maxChars: 3000 }),
];

const githubIssueFields: FieldRule[] = [
  f('title', 'title', 'title', 'bdi.js-issue-title, [data-testid="issue-title"]'),
  f(
    'body',
    'body',
    'body',
    '.js-comment-body, [data-testid="issue-body"] .markdown-body, [data-testid="markdown-body"]',
    { maxChars: 3000 },
  ),
];

export const BUILTIN_PROFILES: Omit<SiteProfile, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'builtin-x',
    name: 'X (Twitter)',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['x.com/*/status/**', 'twitter.com/*/status/**'],
    priority: 100,
    fields: [],
    unit: xUnit,
  },
  {
    id: 'builtin-github-issue',
    name: 'GitHub Issue / PR',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['github.com/*/*/issues/*', 'github.com/*/*/pull/*'],
    priority: 100,
    fields: githubIssueFields,
  },
  {
    id: 'builtin-github-repo',
    name: 'GitHub',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['github.com/*/*', 'github.com/*/*/tree/**', 'github.com/*/*/blob/**'],
    priority: 90,
    fields: githubRepoFields,
  },
  {
    id: 'builtin-futaba',
    name: 'ふたば☆ちゃんねる',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['*.2chan.net/*/res/*'],
    priority: 100,
    fields: [],
    unit: futabaUnit,
  },
];

function stamp(p: Omit<SiteProfile, 'createdAt' | 'updatedAt'>, now: number): SiteProfile {
  return { ...structuredClone(p), createdAt: now, updatedAt: now };
}

/** 組み込みプロファイルを用意する。未登録なら追加、未編集で版が古ければ更新、ユーザー編集済みは触らない */
export async function ensureBuiltInProfiles(now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.siteProfiles, async () => {
    for (const def of BUILTIN_PROFILES) {
      const cur = await db.siteProfiles.get(def.id);
      if (!cur) {
        await db.siteProfiles.add(stamp(def, now));
      } else if (!cur.modified && (cur.builtInVersion ?? 0) < BUILTIN_VERSION) {
        await db.siteProfiles.put({ ...stamp(def, now), createdAt: cur.createdAt, enabled: cur.enabled });
      }
    }
  });
}

/** 組み込みプロファイルを既定の内容に戻す */
export async function resetBuiltInProfile(id: string, now: number = Date.now()): Promise<void> {
  const def = BUILTIN_PROFILES.find((p) => p.id === id);
  if (!def) return;
  const cur = await db.siteProfiles.get(id);
  await db.siteProfiles.put({ ...stamp(def, now), createdAt: cur?.createdAt ?? now, enabled: cur?.enabled ?? true });
}
