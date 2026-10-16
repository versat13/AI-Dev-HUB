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
