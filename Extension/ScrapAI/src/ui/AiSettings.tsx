import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { AI_SERVICES, getServices, resolveTemplates } from '@/lib/ai';
import { listCustomTemplates } from '@/lib/ai-db';
import { getGeminiKey, setGeminiKey } from '@/lib/ai-run';
import { getLocale, t } from '@/lib/i18n';
import { getSettings } from '@/lib/settings';
import { GEMINI_API, type AiServiceCfg, type Settings } from '@/lib/types';
import { ConfirmDelete } from './ConfirmDelete';
import { useLive } from './hooks';

let queue: Promise<unknown> = Promise.resolve(); // 保存を1つずつ順番に行う（読み→書きが重ならないように）
const input = (e: Event) => (e.target as HTMLInputElement).value;

/** 管理画面「AI連携」: AIボタンの既定、Gemini API、AIサービスごとの設定 */
export function AiSettings({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => Promise<void> }) {
  const custom = useLive(listCustomTemplates, []) ?? [];
  const lang = getLocale();
  const templates = resolveTemplates(custom, lang, lang);
  const services = getServices(settings.aiServices);
  // 続けて編集しても前の変更を上書きしないよう、そのつど保存済みの最新の一覧から作り直す
  const saveServices = (list: AiServiceCfg[]) => onChange({ aiServices: list });
  const edit = (fn: (cur: AiServiceCfg[]) => AiServiceCfg[]) =>
    (queue = queue.then(async () => saveServices(fn(getServices((await getSettings()).aiServices)))));
  const patchService = (id: string, patch: Partial<AiServiceCfg>) => edit((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <section class="settings">
      <h2>{t('navAi')}</h2>
      <p class="help">{t('aiIntro')}</p>

      <div class="set-card">
        <h3>✦ {t('aiButtonTitle')}</h3>
        <label class="set-row">
          <span>{t('aiButtonService')}</span>
          <select value={settings.aiButtonService} onChange={(e) => onChange({ aiButtonService: input(e) })}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value={GEMINI_API}>{t('geminiApiName')}</option>
          </select>
        </label>
        <label class="set-row">
          <span>{t('aiButtonPrompt')}</span>
          <select value={settings.aiButtonTemplateId} onChange={(e) => onChange({ aiButtonTemplateId: input(e) })}>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </label>
        <p class="help">{t('aiButtonHelp')}</p>
      </div>

      <GeminiCard settings={settings} onChange={onChange} />

      <div class="set-card">
        <h3>{t('svcTitle')}</h3>
        <p class="help">{t('svcHelp')}</p>
        {services.map((s) => (
          <ServiceEditor
            key={s.id}
            svc={s}
            onPatch={(patch) => patchService(s.id, patch)}
            onReset={() => edit((cur) => cur.map((x) => (x.id === s.id ? { ...(AI_SERVICES.find((d) => d.id === s.id) as AiServiceCfg) } : x)))}
            onRemove={async () => {
              await edit((cur) => cur.filter((x) => x.id !== s.id));
              if (settings.aiButtonService === s.id) await onChange({ aiButtonService: AI_SERVICES[0]!.id });
            }}
          />
        ))}
        <button
          onClick={() =>
            edit((cur) => [
              ...cur,
              { id: `custom-${crypto.randomUUID().slice(0, 8)}`, name: t('svcNew'), url: 'https://', builtIn: false, autoSend: false, closeOnDone: true },
            ])
          }
        >
          {t('svcAdd')}
        </button>
      </div>

      <div class="set-card">
        <h3>{t("aiGeneral")}</h3>
        <label class="set-row">
          <span>{t('aiPromptLang')}</span>
          <select
            value={settings.aiPromptLang}
            onChange={(e) => onChange({ aiPromptLang: (e.target as HTMLSelectElement).value as Settings['aiPromptLang'] })}
          >
            <option value="en">{t('setPromptEn')}</option>
            <option value="native">{t('setPromptNative')}</option>
          </select>
        </label>
        <label class="set-row check">
          <input
            type="checkbox"
            checked={settings.aiTemporaryChat}
            onChange={(e) => onChange({ aiTemporaryChat: (e.target as HTMLInputElement).checked })}
          />
          {t('setTemporaryChat')}
        </label>
        <p class="help">{t('setTemporaryChatHelp')}</p>
        <label class="set-row check">
          <input
            type="checkbox"
            checked={settings.aiDirect}
            onChange={(e) => onChange({ aiDirect: (e.target as HTMLInputElement).checked })}
          />
          {t('setAiDirect')}
        </label>
        <p class="help">{t('setAiDirectHelp')}</p>
        {settings.aiDirect && (
          <label class="set-row check">
            <input
              type="checkbox"
              checked={settings.aiAutoSend}
              onChange={(e) => onChange({ aiAutoSend: (e.target as HTMLInputElement).checked })}
            />
            {t('setAiAutoSend')}
          </label>
        )}
        <label class="set-row check">
          <input
            type="checkbox"
            checked={settings.aiApplyHeadline}
            onChange={(e) => onChange({ aiApplyHeadline: (e.target as HTMLInputElement).checked })}
          />
          {t('aiApplyHeadline')}
        </label>
      </div>

    </section>
  );
}

function GeminiCard({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => Promise<void> }) {
  const stored = useLive(getGeminiKey, []);
  const [key, setKey] = useState<string | null>(null);
  const shown = key ?? stored ?? '';
  const [model, setModel] = useState(settings.geminiModel);
  return (
    <div class="set-card">
      <h3>{t('geminiTitle')}</h3>
      <p class="help">{t('geminiHelp')}</p>
      <label class="set-row">
        <span>{t('geminiKey')}</span>
        <input
          type="password"
          autocomplete="off"
          value={shown}
          placeholder="AIza…"
          onInput={(e) => setKey(input(e))}
          onBlur={async () => {
            if (key == null) return;
            await setGeminiKey(key);
            // キーを消したら権限も返す
            if (!key.trim()) void browser.permissions.remove({ origins: ['https://generativelanguage.googleapis.com/*'] }).catch(() => undefined);
          }}
        />
      </label>
      <label class="set-row">
        <span>{t('geminiModel')}</span>
        <input
          value={model}
          onInput={(e) => setModel(input(e))}
          onBlur={() => model.trim() && model.trim() !== settings.geminiModel && onChange({ geminiModel: model.trim() })}
        />
      </label>
      <p class="help">{t('geminiPrivacy')}</p>
    </div>
  );
}

function ServiceEditor({ svc, onPatch, onReset, onRemove }: { svc: AiServiceCfg; onPatch: (p: Partial<AiServiceCfg>) => void; onReset: () => void; onRemove: () => void }) {
  const text = (label: string, key: 'name' | 'url' | 'tempUrl' | 'composerSel' | 'sendSel' | 'answerSel', ph = '') => (
    <label class="set-row">
      <span>{label}</span>
      <CommitInput value={svc[key] ?? ''} placeholder={ph} onCommit={(v) => onPatch({ [key]: v.trim() || undefined } as Partial<AiServiceCfg>)} />
    </label>
  );
  return (
    <details class="svc">
      <summary>{svc.name || svc.id}</summary>
      {text(t('svcName'), 'name')}
      {text(t('svcUrl'), 'url', 'https://')}
      {text(t('svcTempUrl'), 'tempUrl')}
      {text(t('svcComposer'), 'composerSel', t('svcAuto'))}
      {text(t('svcSend'), 'sendSel', t('svcAuto'))}
      {text(t('svcAnswer'), 'answerSel', t('svcAuto'))}
      <label class="set-row check">
        <input type="checkbox" checked={svc.autoSend} onChange={(e) => onPatch({ autoSend: (e.target as HTMLInputElement).checked })} />
        {t('svcAutoSend')}
      </label>
      <label class="set-row check">
        <input type="checkbox" checked={svc.closeOnDone} onChange={(e) => onPatch({ closeOnDone: (e.target as HTMLInputElement).checked })} />
        {t('svcClose')}
      </label>
      <div class="svc-actions">
        {svc.builtIn ? <button onClick={onReset}>{t('svcReset')}</button> : <ConfirmDelete label={t('svcRemove')} onConfirm={onRemove} />}
      </div>
    </details>
  );
}

/** 入力中は自分の値を持ち、確定（フォーカスが外れる・Enter）したときだけ保存する。他の欄の保存による再描画で入力が消えない */
function CommitInput({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      onInput={(e) => setV(input(e))}
      onBlur={(e) => {
        const cur = (e.target as HTMLInputElement).value; // 描画前の入力でも取りこぼさないよう、画面の値を読む
        if (cur !== value) onCommit(cur);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
