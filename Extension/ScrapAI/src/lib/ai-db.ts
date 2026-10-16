import { parseAnswer, type SectionKey } from './ai';
import { db } from './db';
import type { AiAnswer, PromptTemplate } from './types';

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
  now?: number;
}): Promise<AiAnswer> {
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
  return answer;
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
