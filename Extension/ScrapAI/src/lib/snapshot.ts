import { bury, db } from './db';
import type { Snapshot } from './types';

// スナップショット（ページの一部を切り抜いた画像）の保存と取得。画像はこの端末の IndexedDB にだけ置く。

export const SNAPSHOT_MAX_WIDTH = 1600; // これより大きい画像は縮小する

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  viewportW: number; // 撮影時の表示幅（CSS px）。画像の倍率を求めるのに使う
}

/** タブ全体の画像（dataURL）から範囲を切り抜き、WebP にする。background（OffscreenCanvas）で動く */
export async function cropScreenshot(dataUrl: string, r: SnapRect): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const ratio = bmp.width / r.viewportW;
  const sx = Math.round(r.x * ratio);
  const sy = Math.round(r.y * ratio);
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(r.w * ratio)));
  const sh = Math.max(1, Math.min(bmp.height - sy, Math.round(r.h * ratio)));
  const k = Math.min(1, SNAPSHOT_MAX_WIDTH / sw);
  const width = Math.round(sw * k);
  const height = Math.round(sh * k);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, width, height);
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }), width, height };
}

export async function addSnapshot(scrapId: string, img: { blob: Blob; width: number; height: number }): Promise<Snapshot> {
  const snap: Snapshot = { id: crypto.randomUUID(), scrapId, ...img, createdAt: Date.now() };
  await db.snapshots.add(snap);
  await db.scraps.update(scrapId, { updatedAt: snap.createdAt });
  return snap;
}

export async function listSnapshots(scrapId: string): Promise<Snapshot[]> {
  const list = await db.snapshots.where('scrapId').equals(scrapId).toArray();
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

/** 複数項目のスナップショットをまとめて消す（項目自体は残す） */
export async function deleteSnapshotsOf(scrapIds: string[]): Promise<void> {
  if (scrapIds.length === 0) return;
  await db.transaction('rw', db.snapshots, db.tombstones, db.scraps, async () => {
    const ids = (await db.snapshots.where('scrapId').anyOf(scrapIds).primaryKeys()) as string[];
    await bury('snapshots', ids);
    await db.snapshots.bulkDelete(ids);
    const now = Date.now();
    await db.scraps.where('id').anyOf(scrapIds).modify((s) => void (s.updatedAt = now));
  });
}

export async function deleteSnapshot(id: string): Promise<void> {
  await db.transaction('rw', db.snapshots, db.tombstones, async () => {
    await bury('snapshots', [id]);
    await db.snapshots.delete(id);
  });
}
