/** 改行・空白を整える（連続空行は1つに、行内の連続空白は1つに） */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t 　]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** コードポイント単位で上限に切り詰める。max が null なら無制限 */
export function truncate(text: string, max: number | null): { text: string; truncated: boolean } {
  if (max == null || text.length <= max) return { text, truncated: false };
  const chars = Array.from(text);
  if (chars.length <= max) return { text, truncated: false };
  return { text: chars.slice(0, max).join(''), truncated: true };
}

/** 一覧用の1行概要 */
export function makeExcerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return truncate(flat, max).text;
}

/** 断片の集合から一覧用の概要を決める（選択テキスト > サイト別の本文 > OGP概要 > 本文 > 先頭） */
export function excerptOf(frags: { source: string; text: string; role?: string }[]): string {
  const pick =
    frags.find((f) => f.source === 'selection') ??
    frags.find((f) => f.source === 'rule' && f.role === 'body') ??
    frags.find((f) => f.source === 'rule') ??
    frags.find((f) => f.source === 'meta') ??
    frags.find((f) => f.source === 'readability') ??
    frags[0];
  return pick ? makeExcerpt(pick.text) : '';
}

const TITLE_SEPS = [' / ', ' - ', ' | ', '｜', ' — ', ' – ', ' :: '];
const GENERIC_SITE_NAMES = ['x', 'twitter', 'youtube', 'bluesky', 'threads', 'reddit', 'note'];

/** 本文の最初の一文（句点・改行まで）。長ければ max 字で切る */
export function firstSentence(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = flat.match(/^(.+?(?:[。．！？]|[.!?](?=\s|$)))/);
  return truncate(m ? m[1]! : flat, max).text;
}

/**
 * ページのタイトルを、一覧で読みやすい形に整える（どのサイトにも効く2つの規則）。
 * 1. 末尾の「 / X」「 - YouTube」のような、サイト名だけの付け足しを外す
 * 2. タイトルが本文をそのまま含む（SNSの「◯◯さん:「本文」」形式など）なら、本文の最初の一文にする
 */
export function cleanPageTitle(raw: string, opts: { siteName?: string; domain?: string; body?: string }): string {
  let title = raw.replace(/\s+/g, ' ').trim();
  const names = new Set(
    [opts.siteName, opts.domain?.replace(/^www\./, '').split('.')[0], ...GENERIC_SITE_NAMES]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase()),
  );
  for (const sep of TITLE_SEPS) {
    const i = title.lastIndexOf(sep);
    if (i > 0 && names.has(title.slice(i + sep.length).trim().toLowerCase())) {
      title = title.slice(0, i).trim();
      break;
    }
  }
  const body = opts.body?.replace(/\s+/g, ' ').trim() ?? '';
  const probe = body.slice(0, 20);
  if (probe.length >= 8 && title.includes(probe) && title.length > probe.length + 4) {
    return firstSentence(body);
  }
  return title || raw;
}
