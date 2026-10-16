import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/lib/i18n';

/**
 * 2回押して消す削除ボタン。1回目でボタンが赤く塗られ「もう一度押すと削除」に変わる。
 * 3秒たつか、ボタンからフォーカスが外れると元に戻る。
 */
export function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void | Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      class={`danger${armed ? ' solid' : ''}`}
      aria-live="polite"
      onBlur={() => setArmed(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          window.clearTimeout(timer.current);
          void onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? t('deleteAgain') : label}
    </button>
  );
}
