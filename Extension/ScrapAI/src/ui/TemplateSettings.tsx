import { useState } from 'preact/hooks';
import { ALL_SECTION_KEYS, BUILTIN_TEMPLATES, sectionTitle, type Lang, type SectionKey } from '@/lib/ai';
import { deleteTemplate, listCustomTemplates, newTemplate, saveTemplate } from '@/lib/ai-db';
import { getLocale, t } from '@/lib/i18n';
import type { PromptTemplate } from '@/lib/types';
import { useLive } from './hooks';

/** 管理画面「AIテンプレート」: 組み込みは閲覧と複製、自作は編集・削除 */
export function TemplateSettings() {
  const custom = useLive(listCustomTemplates, []) ?? [];
  const lang = getLocale() as Lang;
  const [draft, setDraft] = useState<PromptTemplate | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  async function duplicate(name: string, body: string) {
    const created = await newTemplate(t('templateCopyName', name), body);
    setDraft(created);
    setViewing(null);
  }

  async function save() {
    if (!draft || !draft.name.trim()) return;
    await saveTemplate(draft);
    setDraft(null);
  }

  return (
    <section class="templates">
      <h2>{t('navTemplates')}</h2>
      <p class="help">{t('templatesIntro')}</p>
      <dl class="tpl-vars">
        {VARS.map((v) => (
          <div key={v}>
            <dt class="mono">{`{{${v}}}`}</dt>
            <dd>{t(`tplVar_${v}`)}</dd>
          </div>
        ))}
      </dl>

      <h3>{t('templatesBuiltIn')}</h3>
      <ul class="tpl-list">
        {BUILTIN_TEMPLATES.map((b) => (
          <li key={b.id} class="tpl-card">
            <div class="tpl-head">
              <strong>{b.name[lang]}</strong>
              <span class="spacer" />
              <button class="link" onClick={() => setViewing(viewing === b.id ? null : b.id)} aria-expanded={viewing === b.id}>
                {viewing === b.id ? t('close') : t('templateView')}
              </button>
              <button onClick={() => duplicate(b.name[lang], b.body[lang])}>{t('templateDuplicate')}</button>
            </div>
            <p class="tpl-lead">{firstLine(b.body[lang])}</p>
            <Heads keys={b.sections} lang={lang} />
            {viewing === b.id && <pre class="frag-text tpl-body">{b.body[lang]}</pre>}
          </li>
        ))}
      </ul>

      <h3>{t('templatesCustom')}</h3>
      {custom.length === 0 && <p class="muted">{t('templatesNone')}</p>}
      <ul class="tpl-list">
        {custom.map((c) => (
          <li key={c.id} class="tpl-card">
            <div class="tpl-head">
            <strong>{c.name}</strong>
            <span class="spacer" />
            <button onClick={() => setDraft({ ...c })}>{t('templateEdit')}</button>
            <button
              class="danger"
              onClick={async () => {
                if (window.confirm(t('confirmDeleteTemplate', c.name))) {
                  await deleteTemplate(c.id);
                  if (draft?.id === c.id) setDraft(null);
                }
              }}
            >
              {t('deleteCategory')}
            </button>
            </div>
            <p class="tpl-lead">{firstLine(c.body)}</p>
            {c.body.includes('{{format}}') && <Heads keys={ALL_SECTION_KEYS} lang={lang} />}
          </li>
        ))}
      </ul>
      <button onClick={() => duplicate(t('templateNewName'), '{{source}}\n\n{{format}}')}>{t('templateNew')}</button>

      {draft && (
        <div class="tpl-editor">
          <label class="block">
            <span>{t('templateName')}</span>
            <input value={draft.name} onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="block">
            <span>{t('templateBody')}</span>
            <textarea
              rows={14}
              class="mono"
              value={draft.body}
              onInput={(e) => setDraft({ ...draft, body: (e.target as HTMLTextAreaElement).value })}
            />
          </label>
          <div class="editor-actions">
            <button class="primary" disabled={!draft.name.trim()} onClick={save}>{t('save')}</button>
            <button onClick={() => setDraft(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

const VARS = ['source', 'format', 'title', 'url', 'site', 'memo', 'fragments'] as const;

function firstLine(body: string): string {
  return body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('{{')) ?? '';
}

/** そのテンプレートで回答に求める見出しの並び */
function Heads({ keys, lang }: { keys: SectionKey[]; lang: Lang }) {
  return (
    <ol class="tpl-heads" aria-label={t('templateHeads')}>
      {keys.map((k) => <li key={k}>{sectionTitle(k, lang)}</li>)}
    </ol>
  );
}
