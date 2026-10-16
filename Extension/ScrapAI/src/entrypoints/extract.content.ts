import { extractFromDocument } from '@/lib/extract-page';
import { markSnapshotTarget, runProfile } from '@/lib/profile-extract';
import type { SiteProfile } from '@/lib/types';

// 常駐させず、保存のたびに background から scripting.executeScript で注入する。
// main の戻り値が executeScript の結果として background に返る。
// サイトプロファイルは、直前に background が同じ分離ワールドへ置いた一時変数で受け取る。

/** アイコンを取り込む。ページ自身が読み込む画像なので追加の許可は要らない。取れなければ undefined（大きすぎるものは捨てる） */
async function fetchIcon(urls: string[]): Promise<string | undefined> {
  for (const u of urls) {
    if (!u) continue;
    try {
      const res = await fetch(new URL(u, location.href).href, { credentials: 'omit' });
      const blob = await res.blob();
      if (!res.ok || !blob.type.startsWith('image/') || blob.size > 200_000) continue;
      return await new Promise<string>((ok, ng) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = ng;
        r.readAsDataURL(blob);
      });
    } catch {
      // 別の出所のアイコンなど。次の候補へ
    }
  }
  return undefined;
}

export default defineContentScript({
  matches: ['*://*/*'],
  registration: 'runtime',
  async main() {
    const g = globalThis as unknown as { __scrapaiProfile?: SiteProfile | null };
    const profile = g.__scrapaiProfile;
    delete g.__scrapaiProfile;

    const result = extractFromDocument(document, window);
    if (profile) {
      const out = { units: [] as Element[] };
      try {
        result.profile = runProfile(profile, document, window, out);
      } catch {
        // プロファイルの失敗は汎用抽出だけで続行する
      }
      result.snapshot = markSnapshotTarget(profile.snapshot, document, out.units) ?? undefined;
    }
    result.faviconData = await fetchIcon([result.faviconUrl, '/favicon.ico']);
    return result;
  },
});
