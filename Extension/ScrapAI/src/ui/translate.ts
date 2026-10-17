import { db } from '@/lib/db';
import { getLocale } from '@/lib/i18n';
import type { Scrap } from '@/lib/types';

// カードの翻訳。Chrome に内蔵された翻訳機能（Translator / LanguageDetector、Chrome 138 以降）を使う。
// 翻訳は端末の中で行われ、外部には送らない。初回は Chrome が言語モデルをダウンロードすることがある。

interface TranslatorLike {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorLike>;
}
interface DetectorStatic {
  create(): Promise<{ detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
}
const api = () => globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };

export function canTranslate(): boolean {
  return !!api().Translator && !!api().LanguageDetector;
}

/** 訳す先: 表示言語 */
export function targetLang(): string {
  return getLocale();
}

/** 表示言語と違う文字が中心か（ボタンを出すかどうかの目安。厳密な判定は翻訳時に行う） */
export function looksForeign(text: string, target = targetLang()): boolean {
  const t = text.replace(/https?:\/\/\S+/g, '');
  if (!t.trim()) return false;
  if (target === 'ja') return !/[ぁ-んァ-ヶ]/.test(t);
  return /[ぁ-んァ-ヶ一-龯가-힣Ѐ-ӿ]/.test(t);
}

const cache = new Map<string, Promise<TranslatorLike>>();
async function translator(source: string, target: string): Promise<TranslatorLike> {
  const key = `${source}>${target}`;
  if (!cache.has(key)) {
    const T = api().Translator!;
    const p = (async () => {
      const a = await T.availability({ sourceLanguage: source, targetLanguage: target });
      if (a === 'unavailable') throw new Error('unavailable');
      return T.create({ sourceLanguage: source, targetLanguage: target });
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

export async function translateTexts(texts: string[], target = targetLang()): Promise<string[] | null> {
  const joined = texts.filter(Boolean).join('\n');
  if (!joined) return null;
  const det = await (await api().LanguageDetector!.create()).detect(joined);
  const source = det[0]?.detectedLanguage;
  if (!source || source === 'und' || source.split('-')[0] === target) return null; // すでに同じ言語
  const tr = await translator(source, target);
  return Promise.all(texts.map((x) => (x ? tr.translate(x) : Promise.resolve(''))));
}

/**
 * カードの翻訳を切り替える。訳がなければ訳して保存し、あれば表示/非表示を切り替える。
 * 戻り値: 'shown' / 'hidden' / 'same'（同じ言語で訳す必要なし） / 'unavailable'
 */
export type TranslateResult = 'shown' | 'hidden' | 'same' | 'unavailable' | 'pair' | 'failed';

/** 失敗の理由ごとの案内文のキー */
export function translateNoteKey(r: 'unavailable' | 'pair' | 'failed'): string {
  return r === 'unavailable' ? 'translateUnavailable' : r === 'pair' ? 'translatePair' : 'translateFailed';
}

/** 失敗の理由: 言語の組み合わせが使えない（pair）か、それ以外（準備中・ダウンロード待ちなど。failed） */
export function translateFailure(e: unknown): 'pair' | 'failed' {
  return e instanceof Error && e.message === 'unavailable' ? 'pair' : 'failed';
}

export async function toggleScrapTranslation(s: Scrap): Promise<TranslateResult> {
  const target = targetLang();
  if (s.translation && s.translation.lang === target) {
    const on = !s.translation.on;
    await db.scraps.update(s.id, { translation: { ...s.translation, on } });
    return on ? 'shown' : 'hidden';
  }
  if (!canTranslate()) return 'unavailable';
  try {
    const out = await translateTexts([s.originalTitle ?? s.title, s.excerpt], target);
    if (!out) return 'same';
    await db.scraps.update(s.id, { translation: { lang: target, title: out[0]!, excerpt: out[1]!, on: true } });
    return 'shown';
  } catch (e) {
    return translateFailure(e);
  }
}
