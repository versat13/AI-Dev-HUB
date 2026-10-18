// ScrapAI 通し確認（e2e）。ビルド済み拡張（dist/chrome-mv3）を実Chromiumに読み込んで操作する。
// 実行: npm run test:e2e（先に wxt build される）。初回のみ: npx playwright install chromium
// テスト用の複製 e2e/.ext には localhost 用の host_permissions を足す（本番のビルドには入れない）。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, '.ext');
const OUT = path.join(HERE, '.out'); // スクリーンショット
const PROFILE = path.join(HERE, '.profile-' + path.basename(fileURLToPath(import.meta.url), '.mjs'));
fs.rmSync(EXT, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(HERE, '../dist/chrome-mv3'), EXT, { recursive: true });
{
  const f = path.join(EXT, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  m.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*'];
  fs.writeFileSync(f, JSON.stringify(m));
}

const para = 'これは本文の段落です。拡張機能の動作確認に使う十分な長さの文章を入れておきます。'.repeat(12);
const pages = {
  '/article': `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>テスト記事</title>
    <meta property="og:site_name" content="TestSite"><meta property="og:description" content="OGの概要文です">
    </head><body><nav>メニュー</nav><article><h1>見出し</h1><p>${para}</p><p>${para}</p><p>${para}</p></article></body></html>`,
  '/other': `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>別の記事</title>
    <meta property="og:description" content="別記事の概要"></head><body><article><h1>別</h1><p>${para}</p><p>${para}</p><p>${para}</p></article></body></html>`,
  '/thread': `<!doctype html><html><head><meta charset="utf-8"><title>AIスレ</title></head><body>
    <div id="res1"><p>レス1: プロンプトのコツ</p></div><div id="res2"><p>レス2: ローカルLLMの設定</p></div></body></html>`,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const body = pages[url.pathname];
  if (!body) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
console.log('extension id:', extId);

// 拡張ページ（IndexedDB と chrome.* にアクセスする足場）
const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${extId}/popup.html`);
await ext.waitForTimeout(500);

// 初回サンプル（インストール時に3件作られる）を確認してから消し、テストを空の状態から始める
const seeded = await ext.evaluate(async () => {
  const read = () => new Promise((resolve) => {
    const open = indexedDB.open('scrapai');
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('meta')) return resolve(null);
      const tx = db.transaction(['meta', 'scraps', 'categories'], 'readonly');
      const out = {};
      tx.objectStore('meta').get('samplesSeeded').onsuccess = (e) => (out.flag = e.target.result?.value);
      tx.objectStore('scraps').getAll().onsuccess = (e) => (out.scraps = e.target.result);
      tx.objectStore('categories').getAll().onsuccess = (e) => (out.cats = e.target.result);
      tx.oncomplete = () => resolve(out);
    };
  });
  for (let i = 0; i < 40; i++) {
    const r = await read();
    if (r?.flag && r.scraps.length >= 3) return { n: r.scraps.length, cats: r.cats.map((c) => c.name), ai: r.scraps.filter((s) => s.aiHeadline).length };
    await new Promise((res) => setTimeout(res, 150));
  }
  return null;
});
await ext.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    const names = ['scraps', 'fragments', 'aiAnswers', 'categories', 'snapshots'];
    const tx = open.result.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve(true);
  };
}));

const tabIdOf = (pageUrl) =>
  ext.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id ?? null, pageUrl);
const save = (tabId, mode) =>
  ext.evaluate(([id, m]) => chrome.runtime.sendMessage({ type: 'save', tabId: id, mode: m }), [tabId, mode]);
const dump = () =>
  ext.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('scrapai');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const out = {};
          const names = ['scraps', 'fragments', 'meta', 'aiAnswers'];
          const tx = db.transaction(names, 'readonly');
          let left = names.length;
          for (const n of names) {
            const req = tx.objectStore(n).getAll();
            req.onsuccess = () => { out[n] = req.result; if (--left === 0) resolve(out); };
          }
        };
      }),
  );

// ===== 同期（同期フォルダ方式）=====
// 本物のフォルダ選択画面は自動操作できないため、ブラウザ内のフォルダ（OPFS）を同期フォルダとして使う
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
const art = await ctx.newPage();
await art.goto(`${base}/article`);
let out = await save(await tabIdOf(`${base}/article*`), 'auto');
check('準備: 記事を保存', out?.kind === 'created');
const mine = out.scrapId;

const errs = [];
const mg = await ctx.newPage();
mg.on('pageerror', (e) => errs.push(e.message));
await mg.setViewportSize({ width: 1280, height: 900 });
await mg.goto(`chrome-extension://${extId}/manager.html#section=sync`);
await mg.waitForTimeout(600);
check('同期: 新しいメニューがある・初回は手順を表示', (await mg.locator('.m-nav').getByRole('button', { name: '同期', exact: true }).count()) === 1 && (await mg.locator('.sync-steps li').count()) === 3);
await mg.screenshot({ path: path.join(OUT, 'p14-sync-empty.png'), fullPage: true });

await mg.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('SyncFolder', { create: true });
  await new Promise((resolve) => {
    const open = indexedDB.open('scrapai');
    open.onsuccess = () => {
      const tx = open.result.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'syncFolder', value: dir });
      tx.oncomplete = resolve;
    };
  });
});
await mg.reload();
await mg.waitForTimeout(800);
check('同期: フォルダに接続中と表示', (await mg.locator('.sync .badge').first().innerText()).includes('接続中'));
await mg.getByLabel('PCの名前').fill('テスト用PC');
await mg.getByLabel('PCの名前').blur();
await mg.getByRole('button', { name: '今すぐ同期' }).click();
await mg.waitForTimeout(800);
const files1 = await mg.evaluate(async () => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('SyncFolder');
  const out = [];
  for await (const e of dir.values()) out.push(e.name);
  return out;
});
check('同期: このPCのファイルを書き出す', files1.length === 1 && /^scrapai-sync-[\w-]+\.json$/.test(files1[0]), files1.join(','));
const mineFile = await mg.evaluate(async (name) => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('SyncFolder');
  return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
}, files1[0]);
check('同期: ファイルに記事とPC名が入る', mineFile.tables.scraps.some((x) => x.id === mine) && mineFile.deviceName === 'テスト用PC');

// 別のPCのファイルを置く（記事1件を追加、こちらの記事は削除済み）
await mg.evaluate(async (myId) => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('SyncFolder');
  const now = Date.now() + 60_000;
  const other = {
    format: 'scrapai-sync', version: 1, deviceId: 'otherpc', deviceName: '職場のPC', writtenAt: now,
    tables: {
      scraps: [{ id: 'remote-1', url: 'https://remote.example/a', normalizedUrl: 'https://remote.example/a', title: '別のPCで保存した記事', siteName: 'remote.example', domain: 'remote.example', extractStatus: 'ok', stars: 4, pinned: false, archivedAt: null, categoryIds: [], memo: '', excerpt: '職場で保存', aiAnswerCount: 0, createdAt: now, updatedAt: now }],
      fragments: [{ id: 'rf-1', scrapId: 'remote-1', order: 0, source: 'selection', fieldLabel: 'selection', role: 'body', text: '職場で保存', truncated: false, createdAt: now }],
      aiAnswers: [], categories: [], siteProfiles: [], promptTemplates: [],
    },
    snapshots: [],
    tombstones: [{ id: myId, table: 'scraps', deletedAt: now }],
  };
  const w = await (await dir.getFileHandle('scrapai-sync-otherpc.json', { create: true })).createWritable();
  await w.write(JSON.stringify(other));
  await w.close();
}, mine);
await mg.getByRole('button', { name: '今すぐ同期' }).click();
await mg.waitForTimeout(1000);
check('同期: 結果を表示', /ほかのPC 1台を読み込み/.test(await mg.locator('.sync [role=status]').innerText()));
let db = await dump();
check('同期: 別のPCの記事が入る', db.scraps.some((x) => x.id === 'remote-1') && db.fragments.some((f) => f.id === 'rf-1'));
check('同期: 別のPCで消した記事は消える', !db.scraps.some((x) => x.id === mine) && !db.fragments.some((f) => f.scrapId === mine));
check('同期: PCの一覧に2台（名前で表示）', (await mg.locator('.sync-devices li').count()) === 2 && (await mg.locator('.sync-devices').innerText()).includes('職場のPC'));
await mg.screenshot({ path: path.join(OUT, 'p14-sync.png'), fullPage: true });
await mg.locator('.m-nav').getByRole('button', { name: '一覧' }).click();
await mg.waitForTimeout(400);
check('同期: 一覧に表示される', (await mg.locator('.m-main').innerText()).includes('別のPCで保存した記事'));
check('JSエラーなし', errs.length === 0, errs.join(' | '));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
