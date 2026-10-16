import { makeExcerpt } from './text';
import type { AiAnswer, Fragment, PromptTemplate, Scrap } from './types';

// P4: AIに渡すプロンプトの生成と、AIの回答（固定Markdown形式）の読み取り。
// AIのAPIは呼ばない。プロンプトはコピーして、ユーザーが各AIサービスのWeb画面に貼る。

export type Lang = 'ja' | 'en';

export type SectionKey =
  | 'headline'
  | 'summary'
  | 'usefulness'
  | 'facts'
  | 'unverified'
  | 'prerequisites'
  | 'firstStep'
  | 'nextPrompt'
  | 'sources'
  | 'translation';

interface SectionDef {
  key: SectionKey;
  title: Record<Lang, string>; // 回答の見出し（プロンプトでこの文字列を指定する）
  hint: Record<Lang, string>; // 見出しの下に書く内容の説明
  aliases: string[]; // 見出しの言い換え（AIが少し変えても読み取れるように）
}

export const SECTIONS: SectionDef[] = [
  {
    key: 'headline',
    title: { ja: '見出し', en: 'Headline' },
    hint: { ja: '内容が一目で分かる1行のタイトル（40字以内）', en: 'a one-line title that conveys the content at a glance (under 40 characters if Japanese, 80 otherwise)' },
    // 旧「日本語タイトル」もここに寄せる
    aliases: ['日本語タイトル', '日本語の見出し', '日本語見出し', '邦題', 'japanese title', 'headline'],
  },
  {
    key: 'summary',
    title: { ja: '要点', en: 'Key points' },
    hint: { ja: '3〜5行の箇条書き', en: '3–5 bullet points' },
    aliases: ['要約', '概要', 'まとめ', 'summary', 'tl;dr', 'tldr', 'key takeaways'],
  },
  {
    key: 'usefulness',
    title: { ja: '有用性', en: 'Usefulness' },
    hint: { ja: '誰の・どんな作業の役に立つか', en: 'who it helps and for what work' },
    aliases: ['使いどころ', '役に立つ点', 'メリット', 'why it matters', 'value'],
  },
  {
    key: 'facts',
    title: { ja: '確認済みの事実', en: 'Verified facts' },
    hint: { ja: '資料や公式情報で確認できる事実（出典があれば添える）', en: 'facts confirmed by the material or official sources (with sources if any)' },
    aliases: ['確認できた事実', '事実', 'facts', 'confirmed facts'],
  },
  {
    key: 'unverified',
    title: { ja: '未確認事項・確度の根拠', en: 'Unverified claims and basis' },
    hint: { ja: '確認できていない主張と、そう判断した根拠（数値の確度は不要）', en: 'claims that could not be confirmed and why (no numeric confidence needed)' },
    aliases: ['未確認事項', '未確認', '確度の根拠', '注意点', 'unverified', 'unverified claims', 'open questions', 'caveats'],
  },
  {
    key: 'prerequisites',
    title: { ja: '前提条件', en: 'Prerequisites' },
    hint: { ja: '試す・使うのに必要な環境、費用、アカウントなど', en: 'environment, cost, accounts etc. needed to try or use it' },
    aliases: ['前提', '必要なもの', 'requirements'],
  },
  {
    key: 'firstStep',
    title: { ja: '最初の一歩', en: 'First step' },
    hint: { ja: '今日できる具体的な最初の操作', en: 'a concrete first action you can take today' },
    aliases: ['次の一歩', 'はじめの一歩', 'first steps', 'next step', 'next steps'],
  },
  {
    key: 'nextPrompt',
    title: { ja: '次回AIに渡す指示', en: 'Prompt for the next AI' },
    hint: { ja: '次にAIへ相談するときに、そのまま貼って使える指示文', en: 'an instruction I can paste as-is when asking an AI next time' },
    aliases: ['次回への指示', '次のAIへの指示', '次回の指示', 'next prompt', 'handoff', 'instructions for the next ai'],
  },
  {
    key: 'sources',
    title: { ja: '出典URL', en: 'Source URLs' },
    hint: { ja: '参照したURL（資料のURLを含む）', en: 'URLs referred to (including the material’s URL)' },
    aliases: ['出典', '参考URL', '参考', '参考文献', 'sources', 'references', 'links'],
  },
  {
    key: 'translation',
    title: { ja: '日本語訳', en: 'Translation' },
    hint: { ja: '本文全体の訳（意訳でよい。要約しない）', en: 'translation of the whole body (free translation is fine; do not summarize)' },
    aliases: ['本文の日本語訳', '翻訳', '和訳', '日本語訳本文', '訳文', 'japanese translation', 'translation'],
  },
];

// 翻訳テンプレートの節。「日本語訳」は既定の見出しには含めない（見出しは全テンプレート共通）
export const TRANSLATION_KEYS: SectionKey[] = ['headline', 'translation'];
export const ALL_SECTION_KEYS: SectionKey[] = SECTIONS.map((s) => s.key).filter((k) => k !== 'translation');

export function sectionTitle(key: string, lang: Lang): string {
  if (key === 'jaTitle') key = 'headline'; // v1.0.6 で保存した回答
  return SECTIONS.find((s) => s.key === key)?.title[lang] ?? key;
}

// ---- 組み込みテンプレート ----

export interface BuiltinTemplate {
  id: string;
  name: Record<Lang, string>;
  body: Record<Lang, string>;
  sections: SectionKey[]; // {{format}} に入れる見出し
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-verify',
    name: { ja: '要約と検証', en: 'Summarize and verify' },
    sections: ALL_SECTION_KEYS,
    body: {
      ja: `次の資料について、内容を整理し、確かさを検証してください。

- 資料に書かれていることと、あなたの知識・推測をはっきり区別してください。
- 確かめられないことは「未確認事項」に入れ、そう判断した根拠を書いてください。

{{format}}

{{source}}`,
      en: `Please organize the following material and verify how reliable it is.

- Clearly separate what the material says from your own knowledge or guesses.
- Put anything you cannot confirm under the unverified section, with your reasoning.

{{format}}

{{source}}`,
    },
  },
  {
    id: 'builtin-try',
    name: { ja: '試し方を知りたい', en: 'How do I try this?' },
    sections: ['headline', 'summary', 'prerequisites', 'firstStep', 'unverified', 'nextPrompt', 'sources'],
    body: {
      ja: `次の資料の内容を、自分で試すための手順にしてください。

- 必要な環境・費用・アカウントなどの前提をすべて挙げてください。
- 最初の一歩は、30分以内に終わる具体的な操作にしてください。
- 資料から読み取れないことは推測で補わず、「未確認事項」に書いてください。

{{format}}

{{source}}`,
      en: `Turn the following material into steps I can follow to try it myself.

- List every prerequisite (environment, cost, accounts, etc.).
- Make the first step a concrete action that takes 30 minutes or less.
- Do not fill gaps with guesses; put them under the unverified section.

{{format}}

{{source}}`,
    },
  },
  {
    id: 'builtin-translate',
    name: { ja: '日本語に訳す', en: 'Translate to Japanese' },
    sections: TRANSLATION_KEYS,
    body: {
      ja: `次の資料の本文を{{lang}}に訳してください。

- 意訳でかまいませんが、要約や省略はせず、本文全体を訳してください。
- 固有名詞・コード・URLは原文のままにしてください。

{{format}}

{{source}}`,
      en: `Translate the body of the following material into {{lang}}.

- A free translation is fine, but translate the whole body without summarizing or omitting.
- Keep proper nouns, code and URLs as in the original.

{{format}}

{{source}}`,
    },
  },
  {
    id: 'builtin-brief',
    name: { ja: '短く要点だけ', en: 'Just the key points' },
    sections: ['headline', 'summary', 'usefulness'],
    body: {
      ja: `次の資料の要点を短くまとめてください。

{{format}}

{{source}}`,
      en: `Briefly summarize the key points of the following material.

{{format}}

{{source}}`,
    },
  },
];

export const DEFAULT_TEMPLATE_ID = 'builtin-verify';

/** 選択肢として使うテンプレート（組み込みは表示言語に合わせて展開する） */
export interface ResolvedTemplate {
  id: string;
  name: string;
  body: string;
  builtIn: boolean;
  sections: SectionKey[];
}

/** nameLang: 一覧に出す名前の言語（表示言語）、bodyLang: プロンプト本文の言語 */
export function resolveTemplates(custom: PromptTemplate[], nameLang: Lang, bodyLang: Lang = nameLang): ResolvedTemplate[] {
  return [
    ...BUILTIN_TEMPLATES.map((b) => ({ id: b.id, name: b.name[nameLang], body: b.body[bodyLang], builtIn: true, sections: b.sections })),
    ...[...custom]
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((c) => ({ id: c.id, name: c.name, body: c.body, builtIn: false, sections: ALL_SECTION_KEYS })),
  ];
}

// ---- プロンプト生成 ----

export const PROMPT_SOURCE_MAX = 30_000; // 資料部分の上限（文字）。超えたら末尾を省略する

const L = {
  ja: { material: '# 資料', title: 'タイトル', url: 'URL', site: 'サイト', saved: '保存日時', memo: '私のメモ', frag: '断片', omitted: '（文字数が多いため、以降は省略しました）' },
  en: { material: '# Material', title: 'Title', url: 'URL', site: 'Site', saved: 'Saved', memo: 'My note', frag: 'Fragment', omitted: '(The rest was omitted because it is too long.)' },
};

/**
 * プロンプトの言語の組み合わせ。
 * - bodyLang: 指示文の言語（既定は英語。英語の指示のほうが守られやすい）
 * - headLang: 見出しの言語（表示言語。回答をそのまま読めるように）
 * - answerLang: 回答させる言語の名前（bodyLang の言葉で書く。例: 'Japanese' / '日本語'）
 */
export interface PromptLangs {
  bodyLang: Lang;
  headLang: Lang;
  answerLang: string;
}

export function languageName(code: string, inLang: Lang): string {
  try {
    return new Intl.DisplayNames([inLang], { type: 'language' }).of(code.split('-')[0]!) ?? code;
  } catch {
    return code;
  }
}

/** 表示言語の設定から、プロンプトの言語の組み合わせを決める */
export function promptLangs(uiLang: Lang, mode: 'en' | 'native', uiLanguageCode: string = uiLang): PromptLangs {
  const bodyLang: Lang = mode === 'en' ? 'en' : uiLang;
  return { bodyLang, headLang: uiLang, answerLang: languageName(uiLanguageCode, bodyLang) };
}

const asLangs = (l: Lang | PromptLangs): PromptLangs =>
  typeof l === 'string' ? { bodyLang: l, headLang: l, answerLang: languageName(l, l) } : l;

const RULES = {
  ja: (lang: string) => `## 回答の形式（厳守）
- 回答全体を、1つのコードブロック（\`\`\`markdown で始め \`\`\` で終える）の中に書いてください。コピーしたときに「##」が消えないようにするためです。
- 下の見出しを、名前を変えず・訳さず・番号を付けず、この順番で使ってください。各見出しは「## 」で始まる1行にしてください。
- 見出しを増やさないでください。書くことがない見出しは「なし」と書いてください。
- 回答の中でコードを示すときは、\`\`\` ではなく ~~~ で囲んでください。
- コードブロックの外には何も書かないでください。
- 回答は${lang}で書いてください。`,
  en: (lang: string) => `## Answer format (follow strictly)
- Put the entire answer inside ONE fenced code block (start with \`\`\`markdown and end with \`\`\`), so the "##" marks survive copying.
- Use the headings below exactly as written — do not rename, translate or number them — in this order, each on its own line starting with "## ".
- Do not add headings. If a heading has nothing to say, write "None".
- If you show code inside the answer, fence it with ~~~ instead of \`\`\`.
- Write nothing outside the code block.
- Write the answer in ${lang}.`,
};

export function formatBlock(keys: SectionKey[], langs: Lang | PromptLangs): string {
  const { bodyLang, headLang, answerLang } = asLangs(langs);
  const heads = keys
    .map((k) => {
      const s = SECTIONS.find((x) => x.key === k)!;
      const hint = bodyLang === 'ja' ? `（${s.hint.ja}）` : `(${s.hint.en})`;
      return `## ${s.title[headLang]}\n${hint}`;
    })
    .join('\n\n');
  return `${RULES[bodyLang](answerLang)}\n\n\`\`\`markdown\n${heads}\n\`\`\``;
}

export function sourceBlock(
  scrap: Pick<Scrap, 'title' | 'url' | 'siteName' | 'memo' | 'createdAt'>,
  frags: Pick<Fragment, 'fieldLabel' | 'text' | 'anchor' | 'permalink' | 'extras'>[],
  lang: Lang,
  labelOf: (label: string) => string = (x) => x,
  max = PROMPT_SOURCE_MAX,
): string {
  const l = L[lang];
  const head = [
    l.material,
    `${l.title}: ${scrap.title}`,
    `${l.url}: ${scrap.url}`,
    scrap.siteName ? `${l.site}: ${scrap.siteName}` : '',
    `${l.saved}: ${new Date(scrap.createdAt).toISOString().slice(0, 10)}`,
    scrap.memo.trim() ? `${l.memo}: ${scrap.memo.trim()}` : '',
  ].filter(Boolean);

  const parts: string[] = [];
  let used = 0;
  let omitted = false;
  frags.forEach((f, i) => {
    if (omitted) return;
    const tags = [labelOf(f.fieldLabel), f.anchor].filter(Boolean).join(' / ');
    const meta = [
      ...(f.extras ?? []).map((x) => `${labelOf(x.label)}: ${x.text}`),
      f.permalink && f.permalink !== scrap.url ? `URL: ${f.permalink}` : '',
    ].filter(Boolean);
    let text = f.text;
    if (used + text.length > max) {
      text = text.slice(0, Math.max(0, max - used));
      omitted = true;
    }
    used += text.length;
    parts.push([`## ${l.frag}${i + 1}: ${tags}`, ...meta, '', text].join('\n').trimEnd());
  });
  if (omitted) parts.push(l.omitted);
  return [head.join('\n'), ...parts].join('\n\n');
}

export function buildPrompt(
  tpl: Pick<ResolvedTemplate, 'body' | 'sections'>,
  scrap: Pick<Scrap, 'title' | 'url' | 'siteName' | 'memo' | 'createdAt'>,
  frags: Pick<Fragment, 'fieldLabel' | 'text' | 'anchor' | 'permalink' | 'extras'>[],
  langs: Lang | PromptLangs,
  labelOf?: (label: string) => string,
): string {
  const l = asLangs(langs);
  const source = sourceBlock(scrap, frags, l.bodyLang, labelOf);
  const vars: Record<string, string> = {
    format: formatBlock(tpl.sections, l),
    lang: l.answerLang,
    source,
    title: scrap.title,
    url: scrap.url,
    site: scrap.siteName,
    memo: scrap.memo,
    fragments: source.split('\n\n').slice(1).join('\n\n'),
  };
  // 未知の {{...}} はそのまま残す
  return tpl.body.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m).trim();
}

// ---- 回答の読み取り ----

function norm(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '') // 括弧書きの補足を除く
    .replace(/[\s・:：*_`#.。、,]/g, '');
}

const NAME_TO_KEY = new Map<string, SectionKey>();
// 記号のない行は、正式な見出し名と完全に一致するときだけ見出しとみなす（別名は本文中に出やすいため使わない）
const PLAIN_TITLE_TO_KEY = new Map<string, SectionKey>();
for (const s of SECTIONS) {
  for (const n of [s.title.ja, s.title.en, ...s.aliases]) NAME_TO_KEY.set(norm(n), s.key);
  for (const n of [s.title.ja, s.title.en]) PLAIN_TITLE_TO_KEY.set(norm(n), s.key);
}

/** 見出し行なら、その節のキーを返す（#見出し、**太字だけの行**、「見出し：」だけの行） */
export function headingKey(line: string): SectionKey | null {
  const t = line.trim();
  if (!t || t.length > 60) return null;
  let m = t.match(/^#{1,6}\s+(.+?)\s*#*$/);
  let name = m?.[1];
  if (!name) {
    m = t.match(/^\*\*(.+?)\*\*\s*[:：]?$/) ?? t.match(/^(.{1,30}?)\s*[:：]$/);
    name = m?.[1];
  }
  if (!name) return PLAIN_TITLE_TO_KEY.get(norm(t)) ?? null;
  name = name.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^(\d+[.)．、]|[①-⑳]|[-・])\s*/, '');
  return NAME_TO_KEY.get(norm(name)) ?? null;
}

export interface ParsedAnswer {
  sections: AiAnswer['sections'];
  parseStatus: AiAnswer['parseStatus'];
}

/**
 * 貼り付けられた回答を節に分ける。原文は呼び出し側で必ず保存する（ここでは捨てない）。
 * ok: 期待した見出しが全てある / partial: 一部だけ / failed: 1つも見つからない
 */
export function parseAnswer(raw: string, expected: SectionKey[] = ALL_SECTION_KEYS): ParsedAnswer {
  // コードブロックの囲み（```markdown など）だけの行は捨てる
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*(```|~~~)[\w-]*\s*$/.test(line));
  const found = new Map<string, string[]>();
  const order: string[] = [];
  let cur = 'intro';
  const push = (key: string, line: string) => {
    if (!found.has(key)) {
      found.set(key, []);
      order.push(key);
    }
    found.get(key)!.push(line);
  };
  for (const line of lines) {
    const k = headingKey(line);
    if (k) {
      cur = k;
      if (!found.has(k)) {
        found.set(k, []);
        order.push(k);
      }
      continue;
    }
    push(cur, line);
  }
  const sections = order
    .map((key) => ({ key, body: found.get(key)!.join('\n').trim() }))
    .filter((s) => s.body || s.key !== 'intro');
  const known = new Set(sections.map((s) => s.key).filter((k) => k !== 'intro'));
  if (known.size === 0) return { sections: [], parseStatus: 'failed' };
  const complete = expected.every((k) => known.has(k));
  return { sections, parseStatus: complete ? 'ok' : 'partial' };
}

/** 一覧などで使う回答の短い説明 */
export function answerExcerpt(a: Pick<AiAnswer, 'sections' | 'raw'>): string {
  const s = a.sections.find((x) => x.key === 'summary') ?? a.sections.find((x) => x.key !== 'intro');
  return makeExcerpt(s?.body ?? a.raw);
}

// ---- AIサービス ----

export const AI_SERVICES = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
] as const;

export type AiServiceId = (typeof AI_SERVICES)[number]['id'] | 'other';
