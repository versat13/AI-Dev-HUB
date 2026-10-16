// URL正規化（仕様書4章）。重複検出キーとして使う。元のURLは書き換えない。

const TRACKING_PARAM =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|yclid|twclid|mc_cid|mc_eid|igshid|ref_src|ref_url|_hsenc|_hsmi)$/i;

const X_HOSTS = new Set([
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.x.com',
]);

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

// github.com/<owner>/<repo> ではないトップレベルのパス
const GITHUB_RESERVED = new Set([
  'orgs',
  'settings',
  'topics',
  'search',
  'marketplace',
  'sponsors',
  'features',
  'explore',
  'collections',
  'notifications',
  'issues',
  'pulls',
  'apps',
  'enterprise',
  'users',
  'login',
  'signup',
  'about',
  'pricing',
  'trending',
]);

export function isXHost(hostname: string): boolean {
  return X_HOSTS.has(hostname.toLowerCase());
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  const isWeb = u.protocol === 'http:' || u.protocol === 'https:';
  if (!isWeb) {
    u.hash = '';
    return u.toString();
  }

  if (u.protocol === 'http:') u.protocol = 'https:';
  u.hash = '';

  const host = u.hostname.toLowerCase();

  // X（旧Twitter）: ホストを x.com に統一し、/<user>/status/<id> までを残す
  if (X_HOSTS.has(host)) {
    u.hostname = 'x.com';
    const m = u.pathname.match(/^(\/(?:i\/web|i|[^/]+)\/status\/\d+)/);
    if (m) return `https://x.com${m[1]}`;
  }

  // GitHub: リポジトリ単位。issues / pull は個別のキー
  if (GITHUB_HOSTS.has(host)) {
    const [owner, repoRaw, kind, num] = u.pathname.split('/').filter(Boolean);
    if (owner && repoRaw && !GITHUB_RESERVED.has(owner.toLowerCase())) {
      const base = `https://github.com/${owner}/${repoRaw.replace(/\.git$/i, '')}`;
      if ((kind === 'issues' || kind === 'pull') && /^\d+$/.test(num ?? '')) {
        return `${base}/${kind}/${num}`;
      }
      return base;
    }
  }

  // 汎用: 追跡パラメータを除去し、残りをキー順に並べる
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = params.length
    ? '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  return `${u.protocol}//${u.host}${path}${search}`;
}

/** 表示用ドメイン（www. を除く） */
export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}
