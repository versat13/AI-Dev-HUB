import { useState } from 'preact/hooks';
import { t } from '@/lib/i18n';

/**
 * 削除ボタン（赤字）。押すとその場に確認が出て、「削除する」でだけ実行する。
 * window.confirm を使わないので、メニューやバーの中でも流れが途切れない。
 */
export function ConfirmDelete({ label, question, onConfirm }: {
  label: string;
  question: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button class="danger" onClick={(e) => { e.stopPropagation(); setAsking(true); }}>
        {label}
      </button>
    );
  }
  return (
    <div class="confirm" role="alertdialog" aria-label={question} onClick={(e) => e.stopPropagation()}>
      <p>{question}</p>
      <div class="confirm-actions">
        <button class="danger solid" onClick={() => void onConfirm()}>{t('confirmDeleteYes')}</button>
        <button onClick={() => setAsking(false)}>{t('cancel')}</button>
      </div>
    </div>
  );
}
