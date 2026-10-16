import { db } from './db';
import type { FieldRule, SiteProfile, UnitRule } from './types';

// 組み込みサイトプロファイル。セレクタは各サイトの現行DOMに基づく初期値で、
// サイト側の変更で合わなくなったときはユーザーが管理画面で編集できる。
// 何も取れなかった場合は汎用抽出（Readability）に自動で切り替わるため、保存は失敗しない。
// 内容を変えたら BUILTIN_VERSION を上げる（ユーザーが編集していないものだけ更新される）。

export const BUILTIN_VERSION = 3; // 2: Xのスナップショット、Zenn等を追加 / 3: ふたばを外す、YouTubeのスナップショット

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

/** 掲示板のレス単位の抽出例（組み込みからは外した。テストと、自作プロファイルの見本に使う） */
export const futabaUnit: UnitRule = {
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
    // 画像・動画・リンクカード・引用ポストがあるときだけ、投稿ごと撮れるようにする（引用元も写る）
    snapshot: {
      mode: 'ask',
      selector: '@unit',
      when: '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.wrapper"], div[role="link"] [data-testid="User-Name"]',
    },
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
  // ---- v2 で追加（実ページでのセレクタは未確認。合わなければ汎用抽出に切り替わる） ----
  article('builtin-zenn', 'Zenn', ['zenn.dev/*/articles/*', 'zenn.dev/*/scraps/*', 'zenn.dev/*/books/*/viewer/*'], {
    body: '.znc, [class*="BodyContent"] .znc, [class*="ArticleBody"], article [class*="markdown"]',
    author: 'a[href^="/"][class*="userName"], [class*="ArticleHeader"] a[href^="/"]',
    tags: 'a[href^="/topics/"]',
  }),
  article('builtin-qiita', 'Qiita', ['qiita.com/*/items/*'], {
    body: '#personal-public-article-body .mdContent-inner, .it-MdContent, section[class*="ArticleBody"]',
    author: 'a[href^="/"][class*="author"], [class*="AuthorName"]',
    tags: 'a[href^="/tags/"]',
  }),
  article('builtin-note', 'note', ['note.com/*/n/*'], {
    body: '.note-common-styles__textnote-body, .p-article__content, [data-name="body"]',
    author: '.o-noteContentHeader__name, a[class*="creator"]',
    tags: 'a[href*="/hashtag/"]',
  }),
  article('builtin-hatenablog', 'はてなブログ', ['*.hatenablog.com/entry/**', '*.hatenablog.jp/entry/**', '*.hateblo.jp/entry/**', '*.hatenadiary.com/entry/**', '*.hatenadiary.jp/entry/**'], {
    title: '.entry-title',
    body: '.entry-content',
    author: '.author.vcard',
    tags: '.entry-categories a',
  }),
  article('builtin-devto', 'DEV', ['dev.to/*/*'], {
    body: '#article-body',
    author: '.crayons-article__header__meta a.crayons-link',
    tags: '.crayons-article__header__meta .crayons-tag',
  }),
  article('builtin-medium', 'Medium', ['medium.com/**', '*.medium.com/**'], {
    body: 'article section',
    author: 'a[data-testid="authorName"]',
  }, 60),
  article('builtin-wikipedia', 'Wikipedia', ['*.wikipedia.org/wiki/**'], {
    title: '#firstHeading',
    body: '#mw-content-text .mw-parser-output > p',
    bodyMatch: 'all',
    bodyMax: 6000,
  }),
  {
    id: 'builtin-stackoverflow',
    name: 'Stack Overflow / Stack Exchange',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['stackoverflow.com/questions/*/**', '*.stackexchange.com/questions/*/**', 'superuser.com/questions/*/**', 'serverfault.com/questions/*/**'],
    priority: 100,
    fields: [f('title', 'title', 'title', '#question-header h1')],
    unit: {
      selector: '#question, .answer',
      permalinkSelector: 'a.js-share-link',
      fields: [
        f('body', 'post', 'body', '.s-prose', { maxChars: 4000 }),
        f('author', 'author', 'author', '.post-signature:last-child .user-details a, .post-signature .user-details a'),
        f('votes', 'votes', 'custom', '.js-vote-count'),
      ],
    },
  },
  {
    id: 'builtin-reddit',
    name: 'Reddit',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['reddit.com/r/*/comments/**', 'old.reddit.com/r/*/comments/**'],
    priority: 100,
    fields: [f('title', 'title', 'title', 'h1, a.title')],
    unit: {
      selector: 'shreddit-post, shreddit-comment, .thing.link, .thing.comment',
      fields: [
        f('body', 'post', 'body', '[slot="text-body"], [slot="comment"], .usertext-body', { maxChars: 3000 }),
        f('author', 'author', 'author', 'a[href^="/user/"], .author'),
      ],
    },
    snapshot: { mode: 'ask', selector: 'shreddit-post, .thing.link', when: 'img, video, shreddit-player, gallery-carousel' },
  },
  {
    id: 'builtin-hackernews',
    name: 'Hacker News',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['news.ycombinator.com/item'],
    priority: 100,
    fields: [f('title', 'title', 'title', '.titleline > a')],
    unit: {
      selector: '.fatitem, tr.comtr',
      permalinkSelector: '.age a',
      fields: [
        f('body', 'post', 'body', '.toptext, .commtext', { maxChars: 3000 }),
        f('author', 'author', 'author', '.hnuser'),
      ],
    },
  },
  {
    id: 'builtin-bluesky',
    name: 'Bluesky',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['bsky.app/profile/*/post/*'],
    priority: 100,
    fields: [],
    unit: {
      selector: '[data-testid^="postThreadItem-by-"]',
      fields: [
        f('body', 'post', 'body', '[data-testid="postText"]', { maxChars: 3000 }),
        f('author', 'author', 'author', 'a[href^="/profile/"][aria-label]'),
      ],
    },
    snapshot: { mode: 'ask', selector: '@unit', when: 'img[src*="cdn.bsky.app/img/feed"], video, [data-testid="contentHider-embed"], [role="link"] [data-testid="postText"]' },
  },
  {
    id: 'builtin-youtube',
    name: 'YouTube',
    builtIn: true,
    builtInVersion: BUILTIN_VERSION,
    enabled: true,
    urlPatterns: ['youtube.com/watch', 'youtube.com/shorts/*', 'm.youtube.com/watch'],
    priority: 100,
    fields: [
      f('title', 'title', 'title', 'h1.ytd-watch-metadata yt-formatted-string, #title h1'),
      f('author', 'author', 'author', '#owner #channel-name a, ytd-channel-name a'),
      f('description', 'description', 'body', '#description-inline-expander, ytd-text-inline-expander, #description', { maxChars: 4000 }),
    ],
    // 動画プレーヤーと題名の部分を、保存のたびにたずねて撮る
    snapshot: { mode: 'ask', selector: '#player, ytd-watch-metadata #title, #movie_player' },
  },
];

/**
 * 記事型サイト（ブログ・技術記事）用のプロファイルを作る。
 * 本文は1つの断片、著者・タグは添え書き。日付は <time datetime> から取る。
 */
function article(
  id: string,
  name: string,
  urlPatterns: string[],
  sel: { title?: string; body: string; author?: string; tags?: string; bodyMatch?: 'first' | 'all'; bodyMax?: number },
  priority = 100,
): Omit<SiteProfile, 'createdAt' | 'updatedAt'> {
  const fields: FieldRule[] = [
    f('title', 'title', 'title', sel.title ?? 'h1'),
    f('body', 'body', 'body', sel.body, { match: sel.bodyMatch ?? 'first', joinWith: '\n\n', maxChars: sel.bodyMax ?? 8000 }),
    f('date', 'date', 'date', 'time[datetime]', { attr: 'datetime' }),
  ];
  if (sel.author) fields.push(f('author', 'author', 'author', sel.author));
  if (sel.tags) fields.push(f('tags', 'tags', 'custom', sel.tags, { match: 'all', joinWith: ', ' }));
  return { id, name, builtIn: true, builtInVersion: BUILTIN_VERSION, enabled: true, urlPatterns, priority, fields };
}

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
    // 組み込みから外したもの: 未編集なら消し、編集済みなら自作として残す（作ったルールを失わない）
    const ids = new Set(BUILTIN_PROFILES.map((p) => p.id));
    for (const cur of await db.siteProfiles.toArray()) {
      if (!cur.builtIn || ids.has(cur.id)) continue;
      if (cur.modified) await db.siteProfiles.update(cur.id, { builtIn: false, modified: false, updatedAt: now });
      else await db.siteProfiles.delete(cur.id);
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
