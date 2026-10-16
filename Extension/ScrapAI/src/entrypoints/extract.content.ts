import { extractFromDocument } from '@/lib/extract-page';
import { runProfile } from '@/lib/profile-extract';
import type { SiteProfile } from '@/lib/types';

// 常駐させず、保存のたびに background から scripting.executeScript で注入する。
// main の戻り値が executeScript の結果として background に返る。
// サイトプロファイルは、直前に background が同じ分離ワールドへ置いた一時変数で受け取る。
export default defineContentScript({
  matches: ['*://*/*'],
  registration: 'runtime',
  main() {
    const g = globalThis as unknown as { __scrapaiProfile?: SiteProfile | null };
    const profile = g.__scrapaiProfile;
    delete g.__scrapaiProfile;

    const result = extractFromDocument(document, window);
    if (profile) {
      try {
        result.profile = runProfile(profile, document, window);
      } catch {
        // プロファイルの失敗は汎用抽出だけで続行する
      }
    }
    return result;
  },
});
