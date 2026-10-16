import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  AI_SERVICES,
  buildPrompt,
  resolveTemplates,
  sectionTitle,
  type AiServiceId,
} from '@/lib/ai';
import {
  addAiAnswer,
  applyTranslation,
  deleteAiAnswer,
  listAiAnswers,
  listCustomTemplates,
  revertTitle,
  translationParts,
} from '@/lib/ai-db';
import { getLocale, t } from '@/lib/i18n';
import { getSettings, setSettings } from '@/lib/settings';
import type { AiAnswer, Fragment, Scrap } from '@/lib/types';
import { copyText } from './clipboard';
import { formatDateTime, fragLabel } from './format';
import { useLive } from './hooks';

const SERVICE_NAMES: Record<string, string> = Object.fromEntries(AI_SERVICES.map((s) => [s.id, s.name]));

function AnswerCard({ a, scrap }: { a: AiAnswer; scrap: Scrap }) {
  const [showRaw, setShowRaw] = useState(a.parseStatus === 'failed');
  const [note, setNote] = useState('');
  const lang = getLocale();
  const next = a.sections.find((s) => s.key === 'nextPrompt')?.body;
  const status =
    a.parseStatus === 'ok' ? t('aiParsedOk') : a.parseStatus === 'partial' ? t('aiParsedPartial') : t('aiParsedFailed');

  const tr = translationParts(a);
  const canApply = !!(tr.title || tr.body);

  const copy = async (text: string) => setNote((await copyText(text)) ? t('copied') : t('copyFailed'));

  return (
    <li class="answer">
      <div class="answer-head">
        <strong>{SERVICE_NAMES[a.service ?? ''] ?? t('aiServiceOther')}</strong>
        <span class="muted">{formatDateTime(a.createdAt)}</span>
        <span class={`badge parse-${a.parseStatus}`}>{status}</span>
        <span class="spacer" />
        <button class="link" onClick={() => setShowRaw(!showRaw)} aria-expanded={showRaw}>
          {showRaw ? t('aiHideRaw') : t('aiShowRaw')}
        </button>
      </div>
      {!showRaw && (
        <dl class="answer-sections">
          {a.sections.map((s) => (
            <div key={s.key} class={`sec sec-${s.key}`}>
              {s.key !== 'intro' && <dt>{sectionTitle(s.key, lang)}</dt>}
              {/* AIの回答はプレーンテキストとして表示する（HTML・Markdownとして解釈しない） */}
              <dd><pre class="frag-text">{s.body}</pre></dd>
            </div>
          ))}
        </dl>
      )}
      {showRaw && (
        <>
          {a.parseStatus === 'failed' && <p class="help">{t('aiRawOnlyNote')}</p>}
          <pre class="frag-text">{a.raw}</pre>
        </>
      )}
      <div class="answer-actions">
        {canApply && (
          <button
            onClick={async () => {
              const r = await applyTranslation(scrap.id, tr);
              setNote(r.titleChanged || r.fragmentAdded ? t('translationApplied') : t('translationAlready'));
            }}
          >
            {t('translationApply')}
          </button>
        )}
        {canApply && scrap.originalTitle && (
          <button onClick={() => revertTitle(scrap.id)}>{t('translationRevert')}</button>
        )}
        {next && <button onClick={() => copy(next)}>{t('aiCopyNextPrompt')}</button>}
        <button onClick={() => copy(a.raw)}>{t('aiCopyRaw')}</button>
        <button
          class="link"
          onClick={async () => {
            if (window.confirm(t('confirmDeleteAnswer'))) await deleteAiAnswer(a.id);
          }}
        >
          {t('fragDelete')}
        </button>
        {note && <span class="muted" role="status">{note}</span>}
      </div>
    </li>
  );
}

/** 詳細画面の「AI」欄: プロンプトを作ってコピー／AIサイトを開く、回答を貼り付けて保存 */
export function AiPanel({ scrap, frags }: { scrap: Scrap; frags: Fragment[] }) {
  const custom = useLive(listCustomTemplates, []) ?? [];
  const answers = useLive(() => listAiAnswers(scrap.id), [scrap.id]) ?? [];
  const lang = getLocale();
  const templates = useMemo(() => resolveTemplates(custom, lang), [custom, lang]);

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [raw, setRaw] = useState('');
  const [service, setService] = useState<AiServiceId>('chatgpt');
  const [lastService, setLastService] = useState<AiServiceId | null>(null);

  useEffect(() => {
    void getSettings().then((s) => setTemplateId(s.aiTemplateId));
  }, []);
  useEffect(() => setExcluded(new Set()), [scrap.id]);

  const tpl = templates.find((x) => x.id === templateId) ?? templates[0]!;
  const used = frags.filter((f) => !excluded.has(f.id));
  const prompt = buildPrompt(tpl, scrap, used, lang, fragLabel);

  async function chooseTemplate(id: string) {
    setTemplateId(id);
    await setSettings({ aiTemplateId: id });
  }

  async function copyPrompt(open?: (typeof AI_SERVICES)[number]) {
    const ok = await copyText(prompt);
    setNote(ok ? (open ? t('aiCopiedAndOpen', open.name) : t('copied')) : t('copyFailed'));
    if (open) {
      setService(open.id);
      setLastService(open.id);
      await browser.tabs.create({ url: open.url });
    }
  }

  async function saveAnswer() {
    if (!raw.trim()) return;
    await addAiAnswer({
      scrapId: scrap.id,
      raw,
      service,
      templateId: tpl.id,
      fragmentIds: used.length === frags.length ? undefined : used.map((f) => f.id),
      expected: tpl.sections,
    });
    setRaw('');
    setNote(t('aiAnswerSaved'));
  }

  return (
    <section class="ai-panel" aria-label={t('aiSection')}>
      <h3>{t('aiSection')}</h3>

      <div class="ai-ask">
        <label class="field">
          <span>{t('aiTemplate')}</span>
          <select value={tpl.id} onChange={(e) => chooseTemplate((e.target as HTMLSelectElement).value)}>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>

        {frags.length > 1 && (
          <details class="ai-frags">
            <summary>{t('aiFragsUsed', used.length, frags.length)}</summary>
            {frags.map((f, i) => (
              <label class="check" key={f.id}>
                <input
                  type="checkbox"
                  checked={!excluded.has(f.id)}
                  onChange={(e) => {
                    const next = new Set(excluded);
                    if ((e.target as HTMLInputElement).checked) next.delete(f.id);
                    else next.add(f.id);
                    setExcluded(next);
                  }}
                />
                {i + 1}. {fragLabel(f.fieldLabel)}
                {f.anchor ? ` ${f.anchor}` : ''} — {f.text.slice(0, 40)}
              </label>
            ))}
          </details>
        )}

        <div class="ai-buttons">
          <button class="primary" onClick={() => copyPrompt()}>{t('aiCopyPrompt')}</button>
          {AI_SERVICES.map((s) => (
            <button key={s.id} onClick={() => copyPrompt(s)} title={t('aiCopyAndOpenTitle', s.name)}>
              {s.name} ↗
            </button>
          ))}
        </div>
        {note && <p class="muted" role="status">{note}</p>}
        <details class="ai-preview">
          <summary>{t('aiPreview', prompt.length)}</summary>
          <pre class="frag-text">{prompt}</pre>
        </details>
      </div>

      <div class="ai-paste">
        <textarea
          rows={4}
          value={raw}
          placeholder={t('aiPastePlaceholder')}
          aria-label={t('aiPasteLabel')}
          onInput={(e) => setRaw((e.target as HTMLTextAreaElement).value)}
        />
        <div class="ai-buttons">
          <select
            aria-label={t('aiService')}
            value={service}
            onChange={(e) => setService((e.target as HTMLSelectElement).value as AiServiceId)}
          >
            {AI_SERVICES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="other">{t('aiServiceOther')}</option>
          </select>
          <button class="primary" disabled={!raw.trim()} onClick={saveAnswer}>{t('aiSaveAnswer')}</button>
          {lastService && <span class="muted">{t('aiPasteHint')}</span>}
        </div>
      </div>

      {answers.length > 0 && (
        <>
          <h4>{t('aiAnswers', answers.length)}</h4>
          <ul class="answers">
            {answers.map((a) => (
              <AnswerCard key={a.id} a={a} scrap={scrap} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

