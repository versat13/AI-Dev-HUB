import { parseAnswer, type SectionKey } from './ai';
import { db } from './db';
import type { AiAnswer, Fragment, PromptTemplate } from './types';

// AI回答とユーザー作成テンプレートの保存。原資料（scraps / fragments）は書き換えない。

async function refreshCount(scrapId: string, now: number): Promise<void> {
  const n = await db.aiAnswers.where('scrapId').equals(scrapId).count();
  await db.scraps.update(scrapId, { aiAnswerCount: n, updatedAt: now });
}

export async function listAiAnswers(scrapId: string): Promise<AiAnswer[]> {
  const list = await db.aiAnswers.where('scrapId').equals(scrapId).toArray();
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addAiAnswer(input: {
  scrapId: string;
  raw: string;
  service?: AiAnswer['service'];
  templateId?: string;
  fragmentIds?: string[];
  expected?: SectionKey[];
  applyToScrap?: boolean; // 見出し（と日本語訳）をスクラップに反映する
  now?: number;
}): Promise<AiAnswer & { applied?: ApplyResult }> {
  const now = input.now ?? Date.now();
  const raw = input.raw.replace(/\r\n?/g, '\n').trim();
  const parsed = parseAnswer(raw, input.expected);
  const answer: AiAnswer = {
    id: crypto.randomUUID(),
    scrapId: input.scrapId,
    fragmentIds: input.fragmentIds,
    service: input.service,
    templateId: input.templateId,
    raw, // 解析の成否にかかわらず全文を保存する
    sections: parsed.sections,
    parseStatus: parsed.parseStatus,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.aiAnswers, db.scraps, async () => {
    await db.aiAnswers.add(answer);
    await refreshCount(input.scrapId, now);
  });
  if (!input.applyToScrap) return answer;
  return { ...answer, applied: await applyAnswer(input.scrapId, answerParts(answer), now) };
}

export async function deleteAiAnswer(id: string): Promise<void> {
  await db.transaction('rw', db.aiAnswers, db.scraps, async () => {
    const a = await db.aiAnswers.get(id);
    if (!a) return;
    await db.aiAnswers.delete(id);
    await refreshCount(a.scrapId, Date.now());
  });
}

// ---- ユーザー作成テンプレート ----

export async function listCustomTemplates(): Promise<PromptTemplate[]> {
  const list = await db.promptTemplates.toArray();
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function saveTemplate(t: PromptTemplate): Promise<void> {
  await db.promptTemplates.put({ ...t, builtIn: false, updatedAt: Date.now() });
}

export async function newTemplate(name: string, body: string): Promise<PromptTemplate> {
  const now = Date.now();
  const last = await db.promptTemplates.orderBy('order').last();
  const t: PromptTemplate = {
    id: crypto.randomUUID(),
    name,
    body,
    builtIn: false,
    order: (last?.order ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.promptTemplates.add(t);
  return t;
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.promptTemplates.delete(id);
}

// ---- 見出し・日本語訳の反映 ----

/** 見出し行の装飾（#、**、「」、先頭の記号）を外して1行のタイトルにする */
export function cleanTitle(body: string): string {
  const line = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*・]\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^[「『"“](.+)[」』"”]$/, '$1')
    .trim()
    .slice(0, 200);
}

export interface AnswerParts {
  title: string; // 空なら適用しない
  body: string; // 空なら適用しない
}

export function answerParts(a: Pick<AiAnswer, 'sections'>): AnswerParts {
  return {
    title: cleanTitle(a.sections.find((s) => s.key === 'headline' || s.key === 'jaTitle')?.body ?? ''),
    body: (a.sections.find((s) => s.key === 'translation')?.body ?? '').trim(),
  };
}

export interface ApplyResult {
  titleChanged: boolean;
  fragmentAdded: boolean;
}

/**
 * 回答をスクラップに反映する: タイトルを見出しにし（元のタイトルは originalTitle に残す）、
 * 訳文を断片として追加する。元の本文の断片は変更しない。同じ訳文は重複して追加しない。
 */
export async function applyAnswer(
  scrapId: string,
  parts: AnswerParts,
  now = Date.now(),
): Promise<ApplyResult> {
  let titleChanged = false;
  let fragmentAdded = false;
  await db.transaction('rw', db.scraps, db.fragments, async () => {
    const scrap = await db.scraps.get(scrapId);
    if (!scrap) return;
    const patch: Partial<typeof scrap> = { updatedAt: now };
    if (parts.title && parts.title !== scrap.title) {
      patch.originalTitle = scrap.originalTitle ?? scrap.title;
      patch.title = parts.title;
      titleChanged = true;
    }
    if (parts.body) {
      const frags = await db.fragments.where('scrapId').equals(scrapId).toArray();
      if (!frags.some((f) => f.source === 'translation' && f.text === parts.body)) {
        const frag: Fragment = {
          id: crypto.randomUUID(),
          scrapId,
          order: frags.reduce((m, f) => Math.max(m, f.order), -1) + 1,
          source: 'translation',
          fieldLabel: 'translation',
          role: 'body',
          text: parts.body,
          truncated: false,
          createdAt: now,
        };
        await db.fragments.add(frag);
        fragmentAdded = true;
      }
    }
    await db.scraps.update(scrapId, patch);
  });
  return { titleChanged, fragmentAdded };
}

/** タイトルを適用前の元のタイトルに戻す（追加した訳文の断片は残す） */
export async function revertTitle(scrapId: string): Promise<void> {
  const scrap = await db.scraps.get(scrapId);
  if (!scrap?.originalTitle) return;
  await db.scraps.update(scrapId, { title: scrap.originalTitle, originalTitle: undefined, updatedAt: Date.now() });
}
