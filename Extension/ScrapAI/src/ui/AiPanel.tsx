import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  AI_SERVICES,
  buildPrompt,
  getServices,
  promptLangs,
  serviceUrl,
  resolveTemplates,
  sectionTitle,
  type AiServiceId,
} from '@/lib/ai';
import {
  addAiAnswer,
  answerParts,
  applyAnswer,
  deleteAiAnswer,
  listAiAnswers,
  listCustomTemplates,
} from '@/lib/ai-db';
import { getLocale, t } from '@/lib/i18n';
import { getSettings, setSettings } from '@/lib/settings';
import type { AiAnswer, AiServiceCfg, Fragment, Scrap } from '@/lib/types';
import { copyText } from './clipboard';
import { formatDateTime, formatRelative, fragLabel } from './format';
import { useAiJobs, useLive } from './hooks';
import { runAi } from './ai-run-ui';
import { getGeminiKey } from '@/lib/ai-run';
import { Icon } from './icons';

const SERVICE_NAMES: Record<string, string> = { ...Object.fromEntries(AI_SERVICES.map((s) => [s.id, s.name])), 'gemini-api': 'Gemini API' };

function AnswerCard({ a, scrap }: { a: AiAnswer; scrap: Scrap }) {
  const [showRaw, setShowRaw] = useState(a.parseStatus === 'failed');
  const [note, setNote] = useState('');
  const lang = getLocale();
  const next = a.sections.find((s) => s.key === 'nextPrompt')?.body;
  const status =
    a.parseStatus === 'ok' ? t('aiParsedOk') : a.parseStatus === 'partial' ? t('aiParsedPartial') : t('aiParsedFailed');
  const parts = answerParts(a);
  const canApply = !!parts.body || (!!parts.title && parts.title !== scrap.title);
  // 見出しと要点を先に見せ、残りは折りたたむ
  const isHead = (k: string) => k === 'headline' || k === 'jaTitle';
  const lead = a.sections.filter((s) => s.key === 'summary' || s.key === 'intro');
  const rest = a.sections.filter((s) => !isHead(s.key) && s.key !== 'summary' && s.key !== 'intro');

  const copy = async (text: string) => setNote((await copyText(text)) ? t('copied') : t('copyFailed'));
  const Section = ({ k, body }: { k: string; body: string }) => (
    <div class={`sec sec-${k}`}>
      {k !== 'intro' && <dt>{sectionTitle(k, lang)}</dt>}
      {/* AIの回答はプレーンテキストとして表示する（HTML・Markdownとして解釈しない） */}
      <dd><pre class="frag-text">{body}</pre></dd>
    </div>
  );

  return (
    <li class="answer">
      <div class="answer-head">
        <span>{SERVICE_NAMES[a.service ?? ''] ?? (a.service || t('aiServiceOther'))}</span>
        <time title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</time>
        <span class={`badge parse-${a.parseStatus}`}>{status}</span>
        <span class="spacer" />
        <button class="link" onClick={() => setShowRaw(!showRaw)} aria-expanded={showRaw}>
          {showRaw ? t('aiHideRaw') : t('aiShowRaw')}
        </button>
      </div>
      {!showRaw && (
        <>
          {parts.title && <p class="answer-headline">{parts.title}</p>}
          <dl class="answer-sections">
            {lead.map((s) => <Section key={s.key} k={s.key} body={s.body} />)}
          </dl>
          {rest.length > 0 && (
            <details class="answer-more">
              <summary>{t('aiMoreSections', rest.length)}</summary>
              <dl class="answer-sections">
                {rest.map((s) => <Section key={s.key} k={s.key} body={s.body} />)}
              </dl>
            </details>
          )}
        </>
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
              const r = await applyAnswer(scrap.id, parts);
              setNote(r.titleChanged || r.fragmentAdded ? t('translationApplied') : t('translationAlready'));
            }}
          >
            {parts.body ? t('translationApply') : t('applyHeadline')}
          </button>
        )}
        {next && <button onClick={() => copy(next)}>{t('aiCopyNextPrompt')}</button>}
        <button class="link" onClick={() => copy(a.raw)}>{t('aiCopyRaw')}</button>
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

/** 詳細画面の「AI」欄: プロンプトを作ってコピー／AIサービスを開く、回答を貼り付けて保存 */
export function AiPanel({ scrap, frags }: { scrap: Scrap; frags: Fragment[] }) {
  const custom = useLive(listCustomTemplates, []) ?? [];
  const answers = useLive(() => listAiAnswers(scrap.id), [scrap.id]) ?? [];
  const lang = getLocale();
  const [promptMode, setPromptMode] = useState<'en' | 'native'>('en');
  const [temporaryChat, setTemporaryChat] = useState(true);
  const [services, setServices] = useState<AiServiceCfg[]>(AI_SERVICES);
  const [direct, setDirect] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [uiCode, setUiCode] = useState<string>(lang);
  const langs = promptLangs(lang, promptMode, uiCode);
  const templates = useMemo(() => resolveTemplates(custom, lang, langs.bodyLang), [custom, lang, langs.bodyLang]);

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [raw, setRaw] = useState('');
  const [service, setService] = useState<AiServiceId>('chatgpt');
  const [lastService, setLastService] = useState<AiServiceId | null>(null);

  const [applyHeadline, setApplyHeadline] = useState(true);
  const [askOpen, setAskOpen] = useState(true); // 回答があっても「もう一度AIに聞く」は開いておく（畳めます）
  const jobs = useAiJobs();
  const apiJob = jobs[scrap.id];
  const hasKey = !!useLive(getGeminiKey, []);
  useEffect(() => {
    void getSettings().then((s) => {
      setTemplateId((cur) => cur ?? s.aiTemplateId); // 読み込み前に選んだものは上書きしない
      setApplyHeadline(s.aiApplyHeadline);
      setPromptMode(s.aiPromptLang);
      setTemporaryChat(s.aiTemporaryChat);
      setDirect(s.aiDirect);
      setServices(getServices(s.aiServices));
      setAutoSend(s.aiAutoSend);
      // 回答の言語: 表示言語を固定していればそれ、自動ならブラウザの言語（日英以外も可）
      setUiCode(s.locale === 'auto' ? browser.i18n.getUILanguage() : lang);
    });
  }, []);
  useEffect(() => setExcluded(new Set()), [scrap.id]);

  const tpl = templates.find((x) => x.id === templateId) ?? templates[0]!;
  const used = frags.filter((f) => !excluded.has(f.id));
  // 資料の項目名（本文・投稿者など）もプロンプトの言語にそろえる
  const prompt = buildPrompt(tpl, scrap, used, langs, (l) => fragLabel(l, langs.bodyLang));

  async function chooseTemplate(id: string) {
    setTemplateId(id);
    await setSettings({ aiTemplateId: id });
  }

  async function copyPrompt(open?: AiServiceCfg) {
    // ボタン一つ方式: そのサイトへのアクセスを（初回だけ）許可してもらい、入力と取り込みを自動にする。
    // 許可の確認はクリックの直後に出す必要があるので、コピーより先に行う
    if (open && direct) {
      const origins = [new URL(open.url).origin + '/*'];
      let granted = false;
      try {
        granted = (await browser.permissions.contains({ origins })) || (await browser.permissions.request({ origins }));
      } catch {
        granted = false;
      }
      if (granted) {
        void copyText(prompt); // 予備としてクリップボードにも入れておく
        setService(open.id);
        setLastService(open.id);
        setNote(t('aiDirectOpened', open.name));
        await browser.runtime.sendMessage({
          type: 'ai-open',
          url: serviceUrl(open, temporaryChat),
          bridge: {
            prompt,
            autoSend: autoSend || open.autoSend,
            sel: { composer: open.composerSel, send: open.sendSel, answer: open.answerSel },
            scrapId: scrap.id,
            service: open.id,
            templateId: tpl.id,
            expected: tpl.sections,
            labels: {
              capture: t('bridgeCapture'),
              saved: t('bridgeSaved'),
              notFound: t('bridgeNotFound'),
              failed: t('bridgeFailed'),
              filled: autoSend || open.autoSend ? t('bridgeSent') : t('bridgeFilled'),
              auto: t('bridgeAuto'),
            },
          },
        });
        return;
      }
    }
    const ok = await copyText(prompt);
    setNote(ok ? (open ? t('aiCopiedAndOpen', open.name) : t('copied')) : t('copyFailed'));
    if (open) {
      setService(open.id);
      setLastService(open.id);
      await browser.tabs.create({ url: serviceUrl(open, temporaryChat) });
    }
  }

  async function saveAnswer() {
    if (!raw.trim()) return;
    const saved = await addAiAnswer({
      scrapId: scrap.id,
      raw,
      service,
      templateId: tpl.id,
      fragmentIds: used.length === frags.length ? undefined : used.map((f) => f.id),
      expected: tpl.sections,
      applyToScrap: applyHeadline,
    });
    setRaw('');
    setAskOpen(false); // 保存したら回答を主役にする
    setNote(saved.applied?.titleChanged ? t('aiAnswerSavedTitled') : t('aiAnswerSaved'));
  }

  // 手順（聞く→貼る）。回答がまだないときは先頭に大きく、回答があるときは回答の下に折りたたむ
  const steps = (
    <>
      <div class="ai-step">
        <h4><span class="step-no">1</span>{t('aiStepAsk')}</h4>
        <div class="ai-ask">
          <div class="tpl-row">
          <label class="field">
            <span>{t('aiTemplate')}</span>
            <select value={tpl.id} onChange={(e) => chooseTemplate((e.target as HTMLSelectElement).value)}>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          {lang !== 'en' && (
            <div class="seg" role="group" aria-label={t('aiPromptLang')} title={t('aiPromptLangHelp')}>
              {(['en', 'native'] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={promptMode === m}
                  onClick={async () => {
                    setPromptMode(m);
                    await setSettings({ aiPromptLang: m });
                  }}
                >
                  {m === 'en' ? 'EN' : t('aiPromptNative')}
                </button>
              ))}
            </div>
          )}
          </div>

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

          <div class="ai-services">
            <button
              class="service"
              disabled={apiJob?.state === 'running'}
              title={t('geminiApiTitle')}
              onClick={async () => {
                if (!hasKey) return setNote(t('geminiNoKey'));
                setNote(t('aiRunning'));
                await runAi(await getSettings(), scrap.id, { serviceId: 'gemini-api', templateId: tpl.id });
              }}
            >
              {t('geminiApiName')}
            </button>
            {services.map((s) => (
              <button key={s.id} class="service" onClick={() => copyPrompt(s)} title={t('aiCopyAndOpenTitle', s.name)}>
                {s.name} <Icon name="external" size={12} />
              </button>
            ))}
          </div>
          <div class="ai-sub">
            <button class="link" onClick={() => copyPrompt()}>{t('aiCopyPrompt')}</button>
            <details class="ai-preview">
              <summary>{t('aiPreview', prompt.length)}</summary>
              <pre class="frag-text">{prompt}</pre>
            </details>
          </div>
          {apiJob?.state === 'failed' && apiJob.reason && <p class="note-line warn" role="status">{t('aiRunFailed')}: {apiJob.reason}</p>}
          {note && <p class="note-line" role="status">{note}</p>}
        </div>
      </div>

      <div class="ai-step">
        <h4><span class="step-no">2</span>{t('aiStepPaste')}</h4>
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
              onChange={(e) => setService((e.target as HTMLSelectElement).value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="other">{t('aiServiceOther')}</option>
            </select>
            <button class="primary" disabled={!raw.trim()} onClick={saveAnswer}>{t('aiSaveAnswer')}</button>
          </div>
          <label class="check small">
            <input
              type="checkbox"
              checked={applyHeadline}
              onChange={async (e) => {
                const v = (e.target as HTMLInputElement).checked;
                setApplyHeadline(v);
                await setSettings({ aiApplyHeadline: v });
              }}
            />
            {t('aiApplyHeadline')}
          </label>
          {lastService && <p class="help">{t('aiPasteHint')}</p>}
        </div>
      </div>

    </>
  );

  return (
    <section class="ai-panel" aria-label={t('aiSection')}>
      {answers.length === 0 ? (
        steps
      ) : (
        <>
          {/* 回答はAI要約の枠に出ているので、ここでは折りたたんでおく */}
          <details class="ai-step ai-answers-fold">
            <summary>{t('aiAnswers', answers.length)}</summary>
            <ul class="answers">
              {answers.map((a) => (
                <AnswerCard key={a.id} a={a} scrap={scrap} />
              ))}
            </ul>
          </details>
          <details class="ai-again" open={askOpen} onToggle={(e) => setAskOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{t('aiAskAgain')}</summary>
            {steps}
          </details>
        </>
      )}
    </section>
  );
}
