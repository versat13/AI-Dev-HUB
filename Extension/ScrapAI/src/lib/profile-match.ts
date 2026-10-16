import type { SiteProfile } from './types';

// URLパターン: 'host/path'。クエリ・#は無視する。
//   host: 'x.com' / '*.2chan.net'（サブドメインのみ）
//   path: セグメントごとに比較。* は1セグメント内の任意文字、** は残り全部（0個以上のセグメント）
//   例: 'github.com/*/*' → 'github.com/owner/repo'（issues/1 などは一致しない）

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function segmentRegex(seg: string): RegExp {
  const escaped = seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

export function matchUrlPattern(pattern: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const trimmed = pattern.trim().replace(/^https?:\/\//i, '');
  if (!trimmed) return false;
  const slash = trimmed.indexOf('/');
  const hostPat = stripWww(slash === -1 ? trimmed : trimmed.slice(0, slash));
  const pathPat = slash === -1 ? '**' : trimmed.slice(slash + 1);
  const host = stripWww(u.hostname);

  if (hostPat.startsWith('*.')) {
    const base = hostPat.slice(2);
    if (!host.endsWith('.' + base)) return false;
  } else if (hostPat !== host) {
    return false;
  }

  const patSegs = pathPat.split('/').filter((s) => s !== '');
  const urlSegs = u.pathname.split('/').filter((s) => s !== '');
  for (let i = 0; i < patSegs.length; i++) {
    const p = patSegs[i]!;
    if (p === '**') return true;
    const seg = urlSegs[i];
    if (seg === undefined) return false;
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      // そのまま比較する
    }
    if (!segmentRegex(p).test(decoded)) return false;
  }
  return urlSegs.length === patSegs.length;
}

/** 有効なプロファイルのうち、URLに一致して priority が最も高いものを返す（同点ならユーザー作成が優先） */
export function pickProfile(profiles: SiteProfile[], url: string): SiteProfile | undefined {
  const hits = profiles.filter((p) => p.enabled && p.urlPatterns.some((pat) => matchUrlPattern(pat, url)));
  if (hits.length === 0) return undefined;
  return hits.reduce((a, b) => {
    if (b.priority !== a.priority) return b.priority > a.priority ? b : a;
    if (a.builtIn !== b.builtIn) return a.builtIn ? b : a;
    return b.updatedAt > a.updatedAt ? b : a;
  });
}
