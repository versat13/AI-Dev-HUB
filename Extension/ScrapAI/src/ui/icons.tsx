import { useFavicon } from './hooks';

// 小さな線画アイコン（外部ライブラリを使わない）。装飾ではなく、ボタンの意味を補うためだけに使う。
const P: Record<string, string> = {
  panel: 'M3 4h14v12H3zM12 4v12',
  manager: 'M3 4h5v5H3zM12 4h5v5h-5zM3 11h5v5H3zM12 11h5v5h-5z',
  filter: 'M3 5h14M6 10h8M8.5 15h3',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  external: 'M11 4h5v5M16 4l-7 7M14 12v4H4V6h4',
  close: 'M5 5l10 10M15 5L5 15',
  back: 'M12 4l-6 6 6 6',
  pick: 'M4 4l5 12 2-5 5-2z',
  sites: 'M10 3a7 7 0 100 14 7 7 0 000-14zM3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z',
  copy: 'M7 7h9v9H7zM4 13V4h9',
  undo: 'M7 7H4V4M4.5 7A7 7 0 1110 17',
  pin: 'M8 3h4l-1 5 3 3H6l3-3-1-5zM10 11v6',
  tag: 'M3 3h7l7 7-7 7-7-7zM7 7h.01',
  star: 'M10 3l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.4 5.5 16.8l.9-5L2.8 8.3l5-.7z',
  archive: 'M3 4h14v4H3zM4 8v8h12V8M8 12h4',
  trash: 'M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10',
  image: 'M3 4h14v12H3zM3 13l4-4 4 4 2-2 4 4M13 8h.01',
  check: 'M4 10l4 4 8-8',
  translate: 'M3 5h8M7 3v2M5 5c0 3 2 5 5 6M9 5c-1 3-3 5-6 6M12 17l3-8 3 8M13 14.5h4',
};

export function Icon({ name, size = 16 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg
      class="ic"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] ?? ''} />
    </svg>
  );
}

/** そのドメインの保存済みアイコン。なければ頭文字と、ドメインから決まる色の小さな印（外部からは読み込まない） */
export function SourceMark({ domain }: { domain: string }) {
  const icon = useFavicon(domain);
  if (icon) return <img class="src-mark src-icon" src={icon} alt="" width="14" height="14" />;
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) % 360;
  const letter = (domain.replace(/^www\./, '')[0] ?? '?').toUpperCase();
  return (
    <span class="src-mark" style={{ '--h': String(h) }} aria-hidden="true">
      {letter}
    </span>
  );
}
