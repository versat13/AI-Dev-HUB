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

/** ドメインの頭文字と、ドメインから決まる色の小さな印。外部のファビコンは読み込まない（通信を起こさないため） */
export function SourceMark({ domain }: { domain: string }) {
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) % 360;
  const letter = (domain.replace(/^www\./, '')[0] ?? '?').toUpperCase();
  return (
    <span class="src-mark" style={{ '--h': String(h) }} aria-hidden="true">
      {letter}
    </span>
  );
}
