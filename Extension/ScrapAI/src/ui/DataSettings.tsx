import { useState } from 'preact/hooks';
import { buildExport, DEFAULT_EXPORT_OPTIONS, exportFileName } from '@/lib/export';
import { t } from '@/lib/i18n';
import { importData, parseExport, type DuplicateMode } from '@/lib/import';
import type { Settings } from '@/lib/types';

// 設定画面の「データ」: エクスポート / インポート（P5）

export function DataSettings({ settings, onApplySettings }: {
  settings: Settings;
  onApplySettings: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [opts, setOpts] = useState({ ...DEFAULT_EXPORT_OPTIONS, includeSettings: false });
  const [mode, setMode] = useState<DuplicateMode>('skip');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const toggle = (k: keyof typeof opts) => (e: Event) =>
    setOpts({ ...opts, [k]: (e.target as HTMLInputElement).checked });

  async function doExport() {
    setErr('');
    const file = await buildExport({ ...opts, settings: opts.includeSettings ? settings : null });
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(t('exportDone', file.scraps.length));
  }

  async function doImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setMsg('');
    setErr('');
    try {
      const file = parseExport(await f.text());
      const r = await importData(file, mode);
      if (r.settings) await onApplySettings(r.settings);
      setMsg(t('importDone', r.scraps, r.skipped, r.fragments));
    } catch (ex) {
      const keys: Record<string, string> = {
        'invalid-json': 'importError_invalidJson',
        'invalid-format': 'importError_invalidFormat',
        'unsupported-version': 'importError_unsupportedVersion',
      };
      setErr(t((ex instanceof Error && keys[ex.message]) || 'importError_invalidData'));
    }
  }

  return (
    <div class="data-settings">
      <div class="data-pair">
        <section class="data-card">
          <h4>⬇ {t('exportTitle')}</h4>
          <p class="help">{t('exportHelp')}</p>
          <div class="data-opts">
            <label class="check"><input type="checkbox" checked={opts.organize} onChange={toggle('organize')} />{t('exportOrganize')}</label>
            <label class="check"><input type="checkbox" checked={opts.aiAnswers} onChange={toggle('aiAnswers')} />{t('exportAnswers')}</label>
            <label class="check"><input type="checkbox" checked={opts.snapshots} onChange={toggle('snapshots')} />{t('exportSnapshots')}</label>
            <label class="check"><input type="checkbox" checked={opts.sites} onChange={toggle('sites')} />{t('exportSites')}</label>
            <label class="check"><input type="checkbox" checked={opts.templates} onChange={toggle('templates')} />{t('exportTemplates')}</label>
            <label class="check"><input type="checkbox" checked={opts.includeSettings} onChange={toggle('includeSettings')} />{t('exportSettings')}</label>
          </div>
          <button class="primary data-action" onClick={doExport}>{t('exportButton')}</button>
        </section>

        <section class="data-card">
          <h4>⬆ {t('importTitle')}</h4>
          <p class="help">{t('importHelp')}</p>
          <div class="data-opts">
            <label class="field">
              <span>{t('importDuplicate')}</span>
              <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as DuplicateMode)}>
                <option value="skip">{t('dupSkip')}</option>
                <option value="overwrite">{t('dupOverwrite')}</option>
                <option value="add">{t('dupAdd')}</option>
              </select>
            </label>
          </div>
          <label class="primary data-action file-button">
            {t('importButton')}
            <input type="file" accept="application/json,.json" onChange={doImport} />
          </label>
        </section>
      </div>
      {msg && <p role="status" class="ok">{msg}</p>}
      {err && <p role="alert" class="error">{err}</p>}
    </div>
  );
}
