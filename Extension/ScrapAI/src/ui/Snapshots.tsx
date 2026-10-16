import { useEffect, useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import { deleteSnapshot, listSnapshots } from '@/lib/snapshot';
import type { Snapshot } from '@/lib/types';
import { useLive } from './hooks';

/** 詳細の本文タブの先頭に出すスナップショット。クリックで原寸を新しいタブで開く */
export function Snapshots({ scrapId }: { scrapId: string }) {
  const snaps = useLive(() => listSnapshots(scrapId), [scrapId]) ?? [];
  if (snaps.length === 0) return null;
  return (
    <ul class="snaps" aria-label={t('snapshots')}>
      {snaps.map((s) => <SnapItem key={s.id} snap={s} />)}
    </ul>
  );
}

function SnapItem({ snap }: { snap: Snapshot }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(snap.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [snap.id]);
  return (
    <li class="snap">
      <a href={url} target="_blank" rel="noopener" title={t('snapshotOpen')}>
        <img src={url} width={snap.width} height={snap.height} alt={t('snapshotAlt')} loading="lazy" />
      </a>
      <button
        class="link snap-del"
        onClick={async () => {
          if (window.confirm(t('confirmDeleteSnapshot'))) await deleteSnapshot(snap.id);
        }}
      >
        {t('fragDelete')}
      </button>
    </li>
  );
}
