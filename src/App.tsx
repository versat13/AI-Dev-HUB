import { useEffect, useState } from 'preact/hooks';
import { bootUi } from '@/ui/boot';
import type { Settings } from '@/lib/types';
import { App as ManagerApp } from '@/entrypoints/manager/App';
import { App as PopupApp } from '@/entrypoints/popup/App';
import { App as SidePanelApp } from '@/entrypoints/sidepanel/App';

type ViewMode = 'manager' | 'popup' | 'sidepanel';

export function RootApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<ViewMode>('manager');

  useEffect(() => {
    bootUi().then((s) => setSettings(s));

    const handleSwitch = (e: Event) => {
      const custom = e as CustomEvent<ViewMode>;
      if (custom.detail) setView(custom.detail);
    };
    window.addEventListener('scrapai-switch-view', handleSwitch);
    return () => window.removeEventListener('scrapai-switch-view', handleSwitch);
  }, []);

  if (!settings) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#4a5468' }}>Loading ScrapAI...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Dev Switcher Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          background: 'var(--surface, #ffffff)',
          borderBottom: '1px solid var(--line, #e3e6eb)',
          fontSize: '12px',
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/icon/32.png" width="16" height="16" alt="" />
          <strong style={{ color: 'var(--ink, #1f2a44)' }}>ScrapAI</strong>
          <span style={{ color: 'var(--ink-3, #5f6980)', fontSize: '11px' }}>v1.3.6 (Web Preview)</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--paper, #f6f7f9)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: view === 'manager' ? 600 : 400,
              border: 'none',
              borderRadius: '4px',
              background: view === 'manager' ? 'var(--surface, #ffffff)' : 'transparent',
              color: view === 'manager' ? 'var(--accent, #2e4bd8)' : 'var(--ink-2, #4a5468)',
              boxShadow: view === 'manager' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setView('manager')}
          >
            管理画面 (Manager)
          </button>
          <button
            type="button"
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: view === 'popup' ? 600 : 400,
              border: 'none',
              borderRadius: '4px',
              background: view === 'popup' ? 'var(--surface, #ffffff)' : 'transparent',
              color: view === 'popup' ? 'var(--accent, #2e4bd8)' : 'var(--ink-2, #4a5468)',
              boxShadow: view === 'popup' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setView('popup')}
          >
            ポップアップ (Popup)
          </button>
          <button
            type="button"
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: view === 'sidepanel' ? 600 : 400,
              border: 'none',
              borderRadius: '4px',
              background: view === 'sidepanel' ? 'var(--surface, #ffffff)' : 'transparent',
              color: view === 'sidepanel' ? 'var(--accent, #2e4bd8)' : 'var(--ink-2, #4a5468)',
              boxShadow: view === 'sidepanel' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
            onClick={() => setView('sidepanel')}
          >
            サイドパネル (SidePanel)
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {view === 'manager' && <ManagerApp initial={settings} />}
        {view === 'popup' && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--paper, #f6f7f9)',
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '460px',
                height: '580px',
                maxHeight: '90vh',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--line, #e3e6eb)',
              }}
            >
              <PopupApp settings={settings} />
            </div>
          </div>
        )}
        {view === 'sidepanel' && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'flex-end',
              background: 'var(--paper, #f6f7f9)',
            }}
          >
            <div
              style={{
                width: '420px',
                height: '100%',
                borderLeft: '1px solid var(--line, #e3e6eb)',
                background: 'var(--surface, #ffffff)',
                boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.05)',
              }}
            >
              <SidePanelApp settings={settings} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
