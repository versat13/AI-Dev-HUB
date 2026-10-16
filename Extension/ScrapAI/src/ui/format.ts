import { getLocale, t } from '@/lib/i18n';

const tag = () => (getLocale() === 'ja' ? 'ja-JP' : 'en-US');

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat(tag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

/** 「3日前」のような相対表示。1週間より前は日付だけにする */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.round((ts - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag(), { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(tag(), { year: 'numeric', month: 'short', day: 'numeric' }).format(ts);
}

/** 組み込みの断片ラベル（selection / article / description）は翻訳し、ユーザー定義のラベルはそのまま出す */
export function fragLabel(label: string): string {
  const key = `fragLabel_${label}`;
  const v = t(key);
  return v === key ? label : v;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
