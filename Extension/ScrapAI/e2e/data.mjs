// ScrapAI 通し確認（e2e）。ビルド済み拡張（dist/chrome-mv3）を実Chromiumに読み込んで操作する。
// 実行: npm run test:e2e（先に wxt build される）。初回のみ: npx playwright install chromium
// テスト用の複製 e2e/.ext には localhost 用の host_permissions を足す（本番のビルドには入れない）。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EXT = path.join(HERE, '.ext');
const OUT = path.join(HERE, '.out'); // スクリーンショット
const PROFILE = path.join(HERE, '.profile-' + path.basename(new URL(import.meta.url).pathname, '.mjs'));
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
          const names = ['scraps', 'fragments', 'categories', 'aiAnswers'];
          const tx = db.transaction(names, 'readonly');
          let left = names.length;
          for (const n of names) {
            const req = tx.objectStore(n).getAll();
            req.onsuccess = () => { out[n] = req.result; if (--left === 0) resolve(out); };
          }
        };
      }),
  );

// ===== P5: エクスポート/インポート =====
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
const clearAll = () =>
  ext.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('scrapai');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const names = ['scraps', 'fragments', 'categories', 'aiAnswers'];
          const tx = open.result.transaction(names, 'readwrite');
          for (const n of names) tx.objectStore(n).clear();
          tx.oncomplete = () => resolve(true);
        };
      }),
  );

const art = await ctx.newPage();
await art.goto(`${base}/article`);
let out = await save(await tabIdOf(`${base}/article*`), 'auto');
check('準備: 記事を保存', out?.kind === 'created');
const scrapId = out.scrapId;
const thr = await ctx.newPage();
await thr.goto(`${base}/thread`);
await save(await tabIdOf(`${base}/thread*`), 'auto');

const errs = [];
const mg = await ctx.newPage();
mg.on('pageerror', (e) => errs.push(e.message));
mg.on('dialog', (d) => d.accept());
await mg.setViewportSize({ width: 1280, height: 1000 });
await mg.goto(`chrome-extension://${extId}/manager.html`);
await mg.waitForTimeout(600);

// 整理情報（星・ピン・カテゴリ）とAI回答を付ける
await mg.locator('.m-nav').getByRole('button', { name: 'カテゴリ' }).click();
await mg.getByLabel('新しいカテゴリ').fill('調査');
await mg.getByRole('button', { name: '追加' }).click();
await mg.waitForTimeout(300);
await ext.evaluate(async (id) => {
  await new Promise((resolve) => {
    const open = indexedDB.open('scrapai');
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['scraps', 'categories', 'aiAnswers'], 'readwrite');
      tx.objectStore('categories').getAll().onsuccess = (e) => {
        const cat = e.target.result[0];
        const st = tx.objectStore('scraps');
        st.get(id).onsuccess = (g) => {
          const s = g.target.result;
          s.stars = 5; s.pinned = true; s.categoryIds = [cat.id]; s.aiAnswerCount = 1;
          st.put(s);
        };
        tx.objectStore('aiAnswers').put({ id: 'ans1', scrapId: id, raw: '## 要点\n- 元データ', sections: [{ key: 'summary', body: '- 元データ' }], parseStatus: 'ok', createdAt: 1, updatedAt: 1 });
      };
      tx.oncomplete = resolve;
    };
  });
}, scrapId);

await mg.locator('.m-nav').getByRole('button', { name: '設定', exact: true }).click();
await mg.waitForTimeout(300);
await mg.screenshot({ path: path.join(OUT, 'p5-settings.png'), fullPage: true });

// エクスポート
const [dl] = await Promise.all([mg.waitForEvent('download'), mg.getByRole('button', { name: 'エクスポート', exact: true }).click()]);
const file = path.join(OUT, 'export.json');
await dl.saveAs(file);
const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
check('エクスポート: ファイル名と形式', /^scrapai-export-\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()) && exported.format === 'scrapai-export');
check('エクスポート: 内容', exported.scraps.length === 2 && exported.fragments.length >= 2 && exported.categories.length === 1 && exported.aiAnswers?.length === 1);
check('エクスポート: 設定は既定で含めない', exported.settings === undefined);
check('エクスポート: 完了表示', /2件を書き出しました/.test(await mg.locator('.data-settings [role=status]').innerText()));

// 全削除 → インポートで復元
await clearAll();
await mg.reload();
await mg.waitForTimeout(500);
await mg.locator('.m-nav').getByRole('button', { name: '設定', exact: true }).click();
let db = await dump();
check('全削除できた', db.scraps.length === 0);
await mg.locator('.data-settings input[type=file]').setInputFiles(file);
await mg.waitForTimeout(800);
check('インポート: 完了表示', /2件を取り込みました/.test(await mg.locator('.data-settings [role=status]').innerText()));
db = await dump();
const a = db.scraps.find((s) => s.id === scrapId);
check('復元: スクラップ・断片・回答・カテゴリ', db.scraps.length === 2 && db.fragments.length >= 2 && db.aiAnswers.length === 1 && db.categories.length === 1);
check('復元: 星・ピン・カテゴリ・AI件数', a?.stars === 5 && a.pinned === true && a.categoryIds.length === 1 && a.aiAnswerCount === 1);

// 重複（既定=スキップ）
await mg.locator('.data-settings input[type=file]').setInputFiles(file);
await mg.waitForTimeout(800);
db = await dump();
check('重複: スキップで件数不変', db.scraps.length === 2 && /スキップ2件/.test(await mg.locator('.data-settings [role=status]').innerText()));
await mg.locator('.data-settings select').selectOption('add');
await mg.locator('.data-settings input[type=file]').setInputFiles(file);
await mg.waitForTimeout(800);
db = await dump();
check('重複: 別の項目として追加', db.scraps.length === 4 && db.categories.length === 1);

// 不正ファイル
const bad = path.join(OUT, 'bad.json');
fs.writeFileSync(bad, '{"format":"other"}');
await mg.locator('.data-settings input[type=file]').setInputFiles(bad);
await mg.waitForTimeout(500);
check('不正ファイル: エラー表示・件数不変', /ScrapAIのエクスポートファイルではありません/.test(await mg.locator('.data-settings [role=alert]').innerText()) && (await dump()).scraps.length === 4);

// 一覧に復元分が見える
await mg.locator('.m-nav').getByRole('button', { name: '一覧' }).click();
await mg.waitForTimeout(500);
check('一覧に表示される', (await mg.locator('.m-main').innerText()).includes('テスト記事'));
check('JSエラーなし', errs.length === 0, errs.join(' | '));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
