import { refreshCount } from './ai-db';
import { db, pruneFavicons, type SyncTable, type Tombstone } from './db';
import { fromBase64, toBase64 } from './export';

/*
  同期（同期フォルダ方式）
  - 利用者が選んだフォルダ（Google Drive / Dropbox / OneDrive のデスクトップアプリが同期している場所）に、
    PCごとに1つのファイル `scrapai-sync-<端末ID>.json` を書き出す。クラウドへの送受信は各社のアプリが行う。
  - 他のPCのファイルを読み、記録ごとに「新しく更新された方」を残して統合する。消したものは tombstones で伝える。
  - PCごとに別のファイルへ書くので、2台が同時に書いても上書きし合わない（Joplin のファイル同期などと同じ考え方）。
*/

export const SYNC_FORMAT = 'scrapai-sync';
export const SYNC_VERSION = 1;
const PREFIX = 'scrapai-sync-';
const TOMBSTONE_DAYS = 120; // これより古い削除記録は捨てる

/** 同期フォルダの最小の操作（本物は FileSystemDirectoryHandle、テストではメモリ上の偽物） */
export interface SyncDir {
  list(): Promise<{ name: string; lastModified: number }[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
}

type Rec = { id: string; updatedAt?: number; createdAt?: number; builtIn?: boolean; modified?: boolean };
interface SyncSnapshot { id: string; scrapId: string; width: number; height: number; createdAt: number; type: string; data: string }

export interface SyncFile {
  format: typeof SYNC_FORMAT;
  version: number;
  deviceId: string;
  deviceName: string;
  writtenAt: number;
  tables: Record<Exclude<SyncTable, 'snapshots'>, Rec[]>;
  snapshots: SyncSnapshot[];
  tombstones: Tombstone[];
}

export interface SyncReport {
  wrote: boolean;
  read: { deviceName: string; writtenAt: number }[];
  added: number;
  updated: number;
  removed: number;
}

const TABLES: Exclude<SyncTable, 'snapshots'>[] = ['scraps', 'fragments', 'aiAnswers', 'categories', 'siteProfiles', 'promptTemplates'];
const stamp = (r: Rec) => r.updatedAt ?? r.createdAt ?? 0;

// ---- この端末 ----

export async function deviceInfo(): Promise<{ id: string; name: string }> {
  let id = (await db.meta.get('deviceId'))?.value as string | undefined;
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    await db.meta.put({ key: 'deviceId', value: id });
  }
  const name = ((await db.meta.get('deviceName'))?.value as string | undefined) ?? '';
  return { id, name };
}

export async function setDeviceName(name: string): Promise<void> {
  await db.meta.put({ key: 'deviceName', value: name.trim() });
}

export const fileNameFor = (deviceId: string) => `${PREFIX}${deviceId}.json`;

// ---- 書き出し ----

export async function buildSyncFile(now = Date.now()): Promise<SyncFile> {
  const dev = await deviceInfo();
  const tables = {} as SyncFile['tables'];
  for (const t of TABLES) {
    let rows = (await db.table(t).toArray()) as Rec[];
    // 組み込みのサイト設定は各PCにあるので、編集したものだけ送る
    if (t === 'siteProfiles') rows = rows.filter((p) => !p.builtIn || p.modified);
    tables[t] = rows;
  }
  const snapshots = await Promise.all(
    (await db.snapshots.toArray()).map(async (s) => ({
      id: s.id,
      scrapId: s.scrapId,
      width: s.width,
      height: s.height,
      createdAt: s.createdAt,
      type: s.blob.type || 'image/webp',
      data: toBase64(new Uint8Array(await s.blob.arrayBuffer())),
    })),
  );
  const limit = now - TOMBSTONE_DAYS * 86400_000;
  const tombstones = (await db.tombstones.toArray()).filter((x) => x.deletedAt >= limit);
  return { format: SYNC_FORMAT, version: SYNC_VERSION, deviceId: dev.id, deviceName: dev.name, writtenAt: now, tables, snapshots, tombstones };
}

// ---- 取り込み（統合） ----

export function parseSyncFile(text: string): SyncFile | null {
  try {
    const f = JSON.parse(text) as SyncFile;
    if (f?.format !== SYNC_FORMAT || typeof f.version !== 'number' || f.version > SYNC_VERSION || !f.tables) return null;
    return f;
  } catch {
    return null; // 書きかけ・壊れたファイルは読み飛ばす（次の同期で読み直す）
  }
}

/** 他のPCのファイルを統合する。記録ごとに新しい方を残し、消したものは消す */
export async function mergeSyncFile(file: SyncFile, report: Pick<SyncReport, 'added' | 'updated' | 'removed'>): Promise<void> {
  const touchedScraps = new Set<string>();
  await db.transaction('rw', [db.scraps, db.fragments, db.aiAnswers, db.categories, db.siteProfiles, db.promptTemplates, db.snapshots, db.tombstones], async () => {
    const localTombs = new Map((await db.tombstones.toArray()).map((x) => [x.id, x]));

    // 1) 削除の記録: こちらの記録が消された時点より古ければ消す
    for (const tb of file.tombstones ?? []) {
      const tbl = db.table(tb.table);
      const cur = (await tbl.get(tb.id)) as Rec | undefined;
      if (cur && stamp(cur) <= tb.deletedAt) {
        await tbl.delete(tb.id);
        report.removed++;
        // 項目が消えたら、その断片・回答・スナップショットも消す（他のPCの削除記録が欠けていても残さない）
        if (tb.table === 'scraps') {
          await db.fragments.where('scrapId').equals(tb.id).delete();
          await db.aiAnswers.where('scrapId').equals(tb.id).delete();
          await db.snapshots.where('scrapId').equals(tb.id).delete();
        }
        const sid = (cur as { scrapId?: string }).scrapId;
        if (sid) touchedScraps.add(sid);
      }
      const known = localTombs.get(tb.id);
      if (!known || known.deletedAt < tb.deletedAt) await db.tombstones.put(tb);
      localTombs.set(tb.id, tb);
    }

    // 2) カテゴリは名前で寄せる（別々のPCで同じ名前を作ったとき二重にしない）
    const catMap = new Map<string, string>();
    const localCats = await db.categories.toArray();
    for (const c of file.tables.categories as (Rec & { name: string })[]) {
      const same = localCats.find((l) => l.name === c.name && l.id !== c.id);
      if (same) catMap.set(c.id, same.id);
    }

    // 3) 記録ごとに新しい方を残す
    for (const t of TABLES) {
      const tbl = db.table(t);
      for (const r0 of file.tables[t] ?? []) {
        if (t === 'categories' && catMap.has(r0.id)) continue;
        const tb = localTombs.get(r0.id);
        if (tb && tb.deletedAt >= stamp(r0)) continue; // こちらで消したもの
        let r = r0;
        if (t === 'scraps') {
          const ids = (r0 as unknown as { categoryIds: string[] }).categoryIds ?? [];
          r = { ...r0, categoryIds: ids.map((x) => catMap.get(x) ?? x) } as Rec;
        }
        const cur = (await tbl.get(r.id)) as Rec | undefined;
        if (!cur) {
          await tbl.put(r);
          report.added++;
        } else if (stamp(r) > stamp(cur)) {
          await tbl.put(r);
          report.updated++;
        } else continue;
        if (t === 'aiAnswers') touchedScraps.add((r as unknown as { scrapId: string }).scrapId);
      }
    }

    // 4) スナップショット（内容は変わらないので、ないものだけ足す）
    for (const s of file.snapshots ?? []) {
      if (localTombs.has(s.id) || (await db.snapshots.get(s.id))) continue;
      await db.snapshots.put({
        id: s.id,
        scrapId: s.scrapId,
        width: s.width,
        height: s.height,
        createdAt: s.createdAt,
        blob: new Blob([fromBase64(s.data)], { type: s.type }),
      });
      report.added++;
    }
  });
  // AI回答の件数・一覧用の要点を合わせ直す
  for (const id of touchedScraps) if (await db.scraps.get(id)) await refreshCount(id, (await db.scraps.get(id))!.updatedAt);
  await pruneFavicons();
}

/** 同期を1回行う: 他のPCのファイルを読んで統合し、この端末のファイルを書き出す */
export async function syncOnce(dir: SyncDir, now = Date.now()): Promise<SyncReport> {
  const dev = await deviceInfo();
  const report: SyncReport = { wrote: false, read: [], added: 0, updated: 0, removed: 0 };
  const seen = ((await db.meta.get('syncSeen'))?.value as Record<string, number> | undefined) ?? {};
  const names = ((await db.meta.get('syncNames'))?.value as Record<string, string> | undefined) ?? {};
  for (const f of await dir.list()) {
    if (!f.name.startsWith(PREFIX) || !f.name.endsWith('.json') || f.name === fileNameFor(dev.id)) continue;
    if (seen[f.name] === f.lastModified) continue; // 前回から変わっていない
    const file = parseSyncFile(await dir.read(f.name));
    if (!file || file.deviceId === dev.id) continue;
    await mergeSyncFile(file, report);
    report.read.push({ deviceName: file.deviceName || file.deviceId, writtenAt: file.writtenAt });
    names[file.deviceId] = file.deviceName;
    seen[f.name] = f.lastModified;
  }
  await db.meta.put({ key: 'syncSeen', value: seen });
  await db.meta.put({ key: 'syncNames', value: names });
  // 中身が前回の書き出しから変わっていなければ書かない（クラウドへの無駄な送信を増やさない）
  const fp = await fingerprint();
  const mineExists = (await dir.list()).some((f) => f.name === fileNameFor(dev.id));
  if (!mineExists || fp !== (await db.meta.get('syncFingerprint'))?.value) {
    await dir.write(fileNameFor(dev.id), JSON.stringify(await buildSyncFile(now)));
    await db.meta.put({ key: 'syncFingerprint', value: fp });
    report.wrote = true;
  }
  await db.meta.put({ key: 'syncLast', value: { at: now, ...report } });
  return report;
}

/** 内容が変わったかを手早く見分けるための指紋（件数と最終更新の合計） */
async function fingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const t of [...TABLES, 'snapshots', 'tombstones'] as const) {
    const rows = (await db.table(t).toArray()) as (Rec & { deletedAt?: number })[];
    parts.push(`${t}:${rows.length}:${rows.reduce((m, r) => Math.max(m, stamp(r), r.deletedAt ?? 0), 0)}`);
  }
  parts.push(`name:${(await deviceInfo()).name}`);
  return parts.join('|');
}

/** 同期フォルダの他のPC（ファイル名と最終更新）。画面に一覧で出す */
export async function listDevices(dir: SyncDir): Promise<{ deviceId: string; name: string; lastModified: number; mine: boolean }[]> {
  const dev = await deviceInfo();
  const names = ((await db.meta.get('syncNames'))?.value as Record<string, string> | undefined) ?? {};
  return (await dir.list())
    .filter((f) => f.name.startsWith(PREFIX) && f.name.endsWith('.json'))
    .map((f) => {
      const deviceId = f.name.slice(PREFIX.length, -5);
      const mine = f.name === fileNameFor(dev.id);
      return { deviceId, name: (mine ? dev.name : names[deviceId]) || deviceId, lastModified: f.lastModified, mine };
    });
}

// ---- 本物のフォルダ（File System Access API） ----

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  values?: () => AsyncIterable<FileSystemHandle>;
};

export function handleDir(h: FileSystemDirectoryHandle): SyncDir {
  const d = h as DirHandle;
  return {
    async list() {
      const out: { name: string; lastModified: number }[] = [];
      for await (const e of d.values!()) {
        if (e.kind === 'file') out.push({ name: e.name, lastModified: (await (e as FileSystemFileHandle).getFile()).lastModified });
      }
      return out;
    },
    async read(name) {
      return (await (await d.getFileHandle(name)).getFile()).text();
    },
    async write(name, text) {
      // 一時ファイルに書いてから置き換えるので、書きかけを他のPCが読むことはない
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
  };
}

export async function savedFolder(): Promise<FileSystemDirectoryHandle | null> {
  return ((await db.meta.get('syncFolder'))?.value as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function saveFolder(h: FileSystemDirectoryHandle | null): Promise<void> {
  if (h) await db.meta.put({ key: 'syncFolder', value: h });
  else await db.meta.delete('syncFolder');
  await db.meta.delete('syncSeen');
}

/** 'granted' / 'prompt'（クリックで許可し直す）/ 'denied' */
export async function folderPermission(h: FileSystemDirectoryHandle, ask = false): Promise<PermissionState> {
  const d = h as DirHandle;
  const opt = { mode: 'readwrite' as const };
  const q = (await d.queryPermission?.(opt)) ?? 'granted';
  if (q === 'granted' || !ask) return q;
  return (await d.requestPermission?.(opt)) ?? 'denied';
}
