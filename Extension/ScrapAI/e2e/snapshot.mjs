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
  // captureVisibleTab は activeTab か <all_urls> が要る。e2e は操作でなくメッセージで保存するため <all_urls> を足す
  m.host_permissions = ['<all_urls>'];
  fs.writeFileSync(f, JSON.stringify(m));
}

const para = 'これは本文の段落です。拡張機能の動作確認に使う十分な長さの文章を入れておきます。'.repeat(12);
const pages = {
  '/article': `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>テスト記事</title>
    <meta property="og:site_name" content="TestSite"><meta property="og:description" content="OGの概要文です">
    </head><body><nav>メニュー</nav><article><h1>見出し</h1><p>${para}</p><p>${para}</p><p>${para}</p></article></body></html>`,
  '/other': `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>別の記事</title>
    <meta property="og:description" content="別記事の概要"></head><body><article><h1>別</h1><p>${para}</p><p>${para}</p><p>${para}</p></article></body></html>`,
  '/tweet1': `<!doctype html><html><head><meta charset="utf-8"><title>投稿1</title></head><body style="margin:0">
    <div style="height:900px">上の余白</div><article id="post" style="width:420px;padding:12px;border:1px solid #ccc"><p>画像つきの投稿です</p>
    <img alt="" width="300" height="160" style="background:#4a7;display:block" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></article>
    <div style="height:900px"></div></body></html>`,
  '/tweet2': `<!doctype html><html><head><meta charset="utf-8"><title>投稿2</title></head><body>
    <article id="post" style="width:420px;padding:12px"><p>二つ目の投稿</p><img alt="" width="200" height="80" style="background:#47a;display:block"></article></body></html>`,
  '/text': `<!doctype html><html><head><meta charset="utf-8"><title>文字だけ</title></head><body>
    <article id="post"><p>画像のない投稿</p></article></body></html>`,
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
          const names = ['scraps', 'fragments', 'siteProfiles', 'snapshots'];
          const tx = db.transaction(names, 'readonly');
          let left = names.length;
          for (const n of names) {
            const req = tx.objectStore(n).getAll();
            req.onsuccess = () => { out[n] = req.result; if (--left === 0) resolve(out); };
          }
        };
      }),
  );

// ===== スナップショット =====
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
// localhost 用のサイト設定（画像があるときだけ、#post を撮る。毎回たずねる）
await ext.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    const tx = open.result.transaction(['siteProfiles'], 'readwrite');
    tx.objectStore('siteProfiles').put({
      id: 'user-local', name: 'local', builtIn: false, enabled: true, urlPatterns: ['localhost/tweet*', 'localhost/text'], priority: 500,
      fields: [{ id: 'b', label: 'body', role: 'body', selector: '#post p', match: 'first', maxChars: null }],
      snapshot: { mode: 'ask', selector: '#post', when: 'img' }, createdAt: 1, updatedAt: 1,
    });
    tx.oncomplete = resolve;
  };
}));

const t1 = await ctx.newPage();
await t1.setViewportSize({ width: 900, height: 700 });
await t1.goto(`${base}/tweet1`);
await t1.bringToFront();
const tab1 = await tabIdOf(`${base}/tweet1*`);
let out = await save(tab1, 'auto');
check('たずねる: 保存結果に「撮れる」', out?.kind === 'created' && out.snapshot === 'available', JSON.stringify(out));
const scrap1 = out.scrapId;
const y0 = await t1.evaluate(() => scrollY);
const res = await ext.evaluate(([tabId, scrapId]) => chrome.runtime.sendMessage({ type: 'snapshot', tabId, scrapId, remember: true }), [tab1, scrap1]);
let db = await dump();
const s1 = db.snapshots.filter((x) => x.scrapId === scrap1);
check('撮影: 画像が1枚保存される', res?.ok === true && s1.length === 1, JSON.stringify(res));
const size = await ext.evaluate(async () => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    open.result.transaction('snapshots').objectStore('snapshots').getAll().onsuccess = (e) => {
      const s = e.target.result[0];
      resolve({ type: s.blob.type, bytes: s.blob.size, w: s.width, h: s.height });
    };
  };
}));
check('撮影: 範囲だけを切り抜いたWebP', size.type === 'image/webp' && size.bytes > 100 && size.w >= 400 && size.w < 600 && size.h > 150 && size.h < 400, JSON.stringify(size));
check('撮影: スクロール位置を元に戻す', (await t1.evaluate(() => scrollY)) === y0);
check('「次から自動」: サイト設定が自動になる', db.siteProfiles.find((p) => p.id === 'user-local')?.snapshot?.mode === 'auto');

const t2 = await ctx.newPage();
await t2.goto(`${base}/tweet2`);
await t2.bringToFront();
out = await save(await tabIdOf(`${base}/tweet2*`), 'auto');
check('自動: 保存と同時に撮る', out?.snapshot === 'taken', JSON.stringify(out));
out = await save(await tabIdOf(`${base}/tweet2*`), 'auto');
check('再保存: 同じ内容では画像を増やさない', out?.kind !== 'created' && out?.snapshot === undefined && (await dump()).snapshots.length === 2, JSON.stringify(out?.kind));
const t3 = await ctx.newPage();
await t3.goto(`${base}/text`);
await t3.bringToFront();
out = await save(await tabIdOf(`${base}/text*`), 'auto');
check('条件: 画像がなければ自動では撮らず、選択だけ出す', out?.kind === 'created' && out.snapshot === 'available', JSON.stringify(out));
db = await dump();
check('件数: 2枚', db.snapshots.length === 2);
// 自動で撮る設定のサイトで「上書き保存」しても撮る
out = await save(await tabIdOf(`${base}/tweet2*`), 'reextract');
check('上書き保存でも自動で撮る', out?.snapshot === 'taken', JSON.stringify(out));
// 右クリック・ショートカット相当（explicit）なら、保存済みのページでも自動で撮る
out = await ext.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'save', tabId, explicit: true }), await tabIdOf(`${base}/tweet2*`));
check('右クリック相当の保存でも自動で撮る', out?.snapshot === 'taken', JSON.stringify(out));
db = await dump();
check('件数: 4枚', db.snapshots.length === 4);

// 詳細に表示・削除
const errs = [];
const mg = await ctx.newPage();
mg.on('pageerror', (e) => errs.push(e.message));
mg.on('dialog', (d) => d.accept());
await mg.setViewportSize({ width: 1280, height: 900 });
await mg.goto(`chrome-extension://${extId}/manager.html#scrap=${scrap1}`);
await mg.waitForTimeout(800);
const img = mg.locator('.m-detail .snaps img');
check('詳細: スナップショットが本文の先頭に出る', (await img.count()) === 1 && (await img.evaluate((el) => el.naturalWidth)) > 0);
await mg.screenshot({ path: path.join(OUT, 'p9-snapshot.png') });

// エクスポートに含まれる
const [dl] = await Promise.all([
  mg.waitForEvent('download'),
  (async () => {
    await mg.locator('.m-nav').getByRole('button', { name: '設定', exact: true }).click();
    await mg.getByRole('button', { name: 'エクスポート', exact: true }).click();
  })(),
]);
const file = path.join(OUT, 'export-snap.json');
await dl.saveAs(file);
check('エクスポート: 画像を含む', JSON.parse(fs.readFileSync(file, 'utf8')).snapshots?.length === 4);

await mg.goto(`chrome-extension://${extId}/manager.html#scrap=${scrap1}`);
await mg.reload();
await mg.waitForTimeout(800);
await mg.locator('.m-detail .snap').hover();
await mg.locator('.m-detail .snap-del').click();
await mg.waitForTimeout(500);
check('詳細: スナップショットを削除', (await dump()).snapshots.length === 3);

// カードにスナップショットを出す（カード表示 + 画像オン）。文字を押しのけない大きさに収まる
await ext.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, listStyle: 'card', listSnapshots: true } });
});
await mg.goto(`chrome-extension://${extId}/manager.html`);
await mg.waitForSelector('.rows .row');
await mg.waitForTimeout(600);
const thumbs = mg.locator('.rows .row-thumb');
check('カード: スナップショットが出る', (await thumbs.count()) > 0);
check('カード: 画像は高さ100px以内', (await thumbs.first().evaluate((el) => el.getBoundingClientRect().height)) <= 101);
await mg.screenshot({ path: path.join(OUT, 'p16-card-snap.png') });
// 一括: スナップショットだけを消す
await mg.getByRole('button', { name: '表示中をすべて選択' }).click();
await mg.locator('.bulkbar').getByRole('button', { name: 'その他' }).click();
await mg.getByRole('button', { name: /スナップショットを削除/ }).click();
await mg.getByRole('button', { name: 'もう一度押すと削除' }).click();
await mg.waitForTimeout(600);
db = await dump();
check('一括: スナップショットだけが消え、項目は残る', db.snapshots.length === 0 && db.scraps.length > 0);

// 設定のないサイト（どのプロファイルにも当たらない 127.0.0.1）で「次から自動で撮る」を覚えさせると、そのドメイン用の設定ができる
const t4 = await ctx.newPage();
await t4.goto(`http://127.0.0.1:${port}/text`);
await t4.bringToFront();
const tab4 = await tabIdOf(`http://127.0.0.1:${port}/text*`);
out = await save(tab4, 'auto');
check('設定のないサイト: 保存時に撮る選択が出る', out?.snapshot === 'available', JSON.stringify(out));
out = await ext.evaluate((a) => chrome.runtime.sendMessage({ type: 'snapshot', ...a, remember: true }), { tabId: tab4, scrapId: out.scrapId });
db = await dump();
check('記憶: 画面に見える範囲を撮れて、ドメイン用の自動設定ができる', out?.ok === true && db.siteProfiles.some((p) => p.urlPatterns.includes('127.0.0.1/**') && p.snapshot?.mode === 'auto' && p.snapshot.selector === '@viewport'), JSON.stringify(out));
out = await save(tab4, 'reextract');
check('記憶したサイトでは次から自動で撮る', out?.snapshot === 'taken', JSON.stringify(out));
check('JSエラーなし', errs.length === 0, errs.join(' | '));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
