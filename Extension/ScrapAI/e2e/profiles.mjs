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
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
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
          const names = ['scraps', 'fragments', 'meta', 'siteProfiles'];
          const tx = db.transaction(names, 'readonly');
          let left = names.length;
          for (const n of names) {
            const req = tx.objectStore(n).getAll();
            req.onsuccess = () => { out[n] = req.result; if (--left === 0) resolve(out); };
          }
        };
      }),
  );

const FX = path.join(HERE, '../src/lib/__fixtures__/');
pages['/b/res/1478296132.htm'] = fs.readFileSync(FX + 'futaba-thread.html', 'utf8');
pages['/thedelost/status/2110472847084650726'] = fs.readFileSync(FX + 'x-status.html', 'utf8');

// テスト用: 組み込みと同じ内容で、対象URLだけ localhost にしたプロファイルを登録する
await ext.evaluate(() => new Promise((resolve, reject) => {
  const f = (id, label, role, selector, extra = {}) => ({ id, label, role, selector, match: 'first', maxChars: null, ...extra });
  const now = Date.now();
  const profs = [
    { id: 'e2e-futaba', name: 'e2e futaba', builtIn: false, enabled: true, urlPatterns: ['localhost/*/res/*'], priority: 300, fields: [],
      unit: { selector: '#master, td.rtd', anchorSelector: '.cno', fields: [f('b', 'res', 'body', 'blockquote', { maxChars: 3000 }), f('d', 'date', 'date', '.cnw')] }, createdAt: now, updatedAt: now },
    { id: 'e2e-x', name: 'e2e x', builtIn: false, enabled: true, urlPatterns: ['localhost/*/status/**'], priority: 300, fields: [],
      unit: { selector: 'article[data-testid="tweet"]', permalinkSelector: 'a[href*="/status/"] time', fields: [
        f('b', 'post', 'body', '[data-testid="tweetText"]', { maxChars: 3000 }), f('a', 'author', 'author', '[data-testid="User-Name"]'), f('d', 'date', 'date', 'a[href*="/status/"] time', { attr: 'datetime' })] }, createdAt: now, updatedAt: now },
  ];
  const open = indexedDB.open('scrapai');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const tx = open.result.transaction('siteProfiles', 'readwrite');
    profs.forEach((p) => tx.objectStore('siteProfiles').put(p));
    tx.oncomplete = () => resolve();
  };
}));

// 組み込みの登録確認（背景ページ起動時に登録される）
let db = await dump();
check('組み込みプロファイルが登録されている', ['builtin-x', 'builtin-github-repo', 'builtin-github-issue', 'builtin-futaba'].every((id) => db.siteProfiles.some((p) => p.id === id)), db.siteProfiles.map((p) => p.id).join(','));

// ふたば: 選択なし → スレ主の投稿が rule 断片で保存される
const fut = await ctx.newPage();
await fut.goto(`${base}/b/res/1478296132.htm`);
const fTab = await tabIdOf(`${base}/b/res/*`);
let out = await save(fTab, 'auto');
check('ふたば: 新規保存', out?.kind === 'created', JSON.stringify(out));
db = await dump();
let scrap = db.scraps.find((s) => s.url.includes('/b/res/'));
let frags = db.fragments.filter((f) => f.scrapId === scrap?.id);
check('ふたば: profileId が記録される', scrap?.profileId === 'e2e-futaba', scrap?.profileId);
check('ふたば: 選択なしならスレ主の投稿(rule)1断片', frags.length === 1 && frags[0].source === 'rule' && frags[0].anchor === 'No.1478296132' && frags[0].text.includes('今日の初遭遇ガルド'), JSON.stringify(frags.map((f) => [f.source, f.anchor, f.text.slice(0, 12)])));
check('ふたば: 日時が extras に入る', frags[0]?.extras?.[0]?.text?.includes('11:36:04'), JSON.stringify(frags[0]?.extras));

// ふたば: レス1〜3をまたいで選択 → レスごとに断片追加
await fut.evaluate(() => {
  const t = document.querySelectorAll('td.rtd');
  const r = document.createRange(); r.setStartBefore(t[0]); r.setEndAfter(t[2]);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
out = await save(fTab, 'auto');
check('ふたば: 複数レス選択→既存項目へ3断片追加', out?.kind === 'fragment-added' && out.addedFragmentIds?.length === 3, JSON.stringify(out));
db = await dump();
frags = db.fragments.filter((f) => f.scrapId === scrap?.id).sort((a, b) => a.order - b.order);
check('ふたば: 断片の番号がレス番号', frags.map((f) => f.anchor).join(',') === 'No.1478296132,No.1478298230,No.1478298627,No.1478298836', frags.map((f) => f.anchor).join(','));
out = await save(fTab, 'auto');
check('ふたば: 同じ選択を再保存しても重複しない', out?.kind === 'duplicate-fragment', out?.kind);

// X: URL の投稿を保存
const xp = await ctx.newPage();
await xp.goto(`${base}/thedelost/status/2110472847084650726`);
const xTab = await tabIdOf(`${base}/thedelost/status/*`);
out = await save(xTab, 'auto');
check('X: 新規保存', out?.kind === 'created', JSON.stringify(out));
db = await dump();
const xs = db.scraps.find((s) => s.url.includes('/status/'));
const xf = db.fragments.filter((f) => f.scrapId === xs?.id);
check('X: 本人の投稿本文が rule 断片、リンクは完全なURLに', xf.length === 1 && xf[0].text.startsWith('これは純粋なクソ金脈だ') && xf[0].text.includes('https://code.claude.com/docs/en/workflows'), xf[0]?.text.slice(0, 20));
check('X: 投稿者・日時・permalink', xf[0]?.extras?.some((x) => x.text === 'delost @thedelost') && xf[0]?.permalink === 'https://x.com/thedelost/status/2110472847084650726', JSON.stringify([xf[0]?.extras, xf[0]?.permalink]));
check('X: 概要(excerpt)が投稿本文', xs?.excerpt?.startsWith('これは純粋なクソ金脈だ'), xs?.excerpt);

// 要素ピッカー: 起動 → クリック → 管理画面のサイト設定に結果が出る
const pickRes = await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'start-picker', tabId: id }), fTab);
check('ピッカー: 起動できる', pickRes?.ok === true, JSON.stringify(pickRes));
await fut.bringToFront();
const bq = fut.locator('td.rtd blockquote').first();
const box = await bq.boundingBox();
await fut.mouse.move(box.x + 5, box.y + 5);
await fut.mouse.click(box.x + 5, box.y + 5);
let mgr;
for (let i = 0; i < 30 && !mgr; i++) {
  await new Promise((r) => setTimeout(r, 200));
  mgr = ctx.pages().find((p) => p.url().includes('manager.html'));
}
check('ピッカー: 管理画面のサイト設定が開く', !!mgr && mgr.url().includes('section=sites'), mgr?.url());
if (mgr) {
  mgr.on('dialog', (d) => d.accept());
  await mgr.setViewportSize({ width: 1280, height: 900 });
  await mgr.waitForSelector('.pick-banner', { timeout: 5000 }).catch(() => {});
  const ptxt = (await mgr.locator('.pick-banner').innerText().catch(() => ''));
  check('ピッカー: セレクタと見本が表示される', /blockquote/.test(ptxt) && /こんな時間から立てるなんて/.test(ptxt), ptxt.replace(/\n+/g, ' / ').slice(0, 120));
  const clicked = await fut.evaluate(() => document.getElementById('1478298230') != null);
  check('ピッカー: クリックがページ側に漏れていない(ページは無変化)', clicked);
  await mgr.screenshot({ path: path.join(OUT, 'p3-pick.png') });
  await mgr.getByRole('button', { name: '新しいプロファイルにする' }).click();
  await mgr.waitForTimeout(700);
  db = await dump();
  const np = db.siteProfiles.find((p) => p.urlPatterns.includes('localhost/**'));
  check('ピッカー: 新しいプロファイルとして保存', !!np && np.fields[0]?.selector.includes('blockquote'), JSON.stringify(np?.urlPatterns) + ' ' + np?.fields[0]?.selector);
  check('ピッカー: 選択結果が消費される', (await mgr.locator('.pick-banner').count()) === 0);

  // サイト設定の編集: 組み込みXの文字数上限を変更→保存→modified
  await mgr.getByRole('button', { name: /X \(Twitter\)/ }).click();
  await mgr.waitForTimeout(300);
  await mgr.locator('.profile-detail').getByText('繰り返し単位', { exact: false }).first().waitFor();
  const maxInput = mgr.locator('.unit-editor input[type=number]').first();
  await maxInput.fill('500');
  await mgr.getByRole('button', { name: '保存', exact: true }).click();
  await mgr.waitForTimeout(600);
  db = await dump();
  const bx = db.siteProfiles.find((p) => p.id === 'builtin-x');
  check('サイト設定: 組み込みを編集すると上限が保存され modified になる', bx?.unit?.fields?.[0]?.maxChars === 500 && bx?.modified === true, JSON.stringify([bx?.unit?.fields?.[0]?.maxChars, bx?.modified]));
  await mgr.screenshot({ path: path.join(OUT, 'p3-sites.png') });
  await mgr.getByRole('button', { name: '既定に戻す' }).click();
  await mgr.waitForTimeout(600);
  db = await dump();
  check('サイト設定: 既定に戻す', db.siteProfiles.find((p) => p.id === 'builtin-x')?.unit?.fields?.[0]?.maxChars === 3000);

  // 管理画面の詳細に番号・日時が出る
  await mgr.locator('.m-nav').getByRole('button', { name: '一覧' }).click();
  await mgr.waitForTimeout(500);
  await mgr.locator('.m-main').getByText('デイリーガルド教えて').first().click();
  await mgr.waitForTimeout(600);
  const dtxt = await mgr.locator('.m-detail').innerText();
  check('詳細: 断片に番号(No.)と日時が表示される', /No\.1478298230/.test(dtxt) && /26\/10\/16/.test(dtxt), dtxt.slice(0, 80));
  await mgr.screenshot({ path: path.join(OUT, 'p3-detail.png') });
}

// 文字数上限: 低い上限のプロファイルで truncated になる
await ext.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    const tx = open.result.transaction('siteProfiles', 'readwrite');
    const st = tx.objectStore('siteProfiles');
    const g = st.get('e2e-x');
    g.onsuccess = () => { const p = g.result; p.unit.fields[0].maxChars = 20; st.put(p); };
    tx.oncomplete = () => resolve();
  };
}));
const xp2 = await ctx.newPage();
await xp2.goto(`${base}/thedelost/status/2110472847084650726?x=2`);
const xTab2 = await tabIdOf(`${base}/thedelost/status/*x=2`);
out = await save(xTab2, 'separate');
db = await dump();
const xs2 = db.scraps.find((s) => s.id === out.scrapId);
const xf2 = db.fragments.filter((f) => f.scrapId === xs2?.id);
check('文字数上限: 20字で切り詰められ truncated', xf2[0]?.text.length === 20 && xf2[0]?.truncated === true, String(xf2[0]?.text.length));

// ポップアップに「ページの要素を選ぶ」がある
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 420, height: 600 });
await pop.goto(`chrome-extension://${extId}/popup.html`);
await pop.waitForTimeout(600);
check('ポップアップ: 要素を選ぶ/サイト設定のリンクがある', (await pop.getByRole('button', { name: /ページの要素を選ぶ|Pick an element/ }).count()) === 1);

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
