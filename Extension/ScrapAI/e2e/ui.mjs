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
  if (url.pathname === '/favicon.ico') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    return;
  }
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
check('初回サンプル: 3件・「サンプル」カテゴリ・AI要約つき1件', seeded?.n === 3 && (seeded.cats.includes('サンプル') || seeded.cats.includes('Sample')) && seeded.ai === 1, JSON.stringify(seeded));

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
          const names = ['scraps', 'fragments', 'meta', 'favicons'];
          const tx = db.transaction(names, 'readonly');
          let left = names.length;
          for (const n of names) {
            const req = tx.objectStore(n).getAll();
            req.onsuccess = () => { out[n] = req.result; if (--left === 0) resolve(out); };
          }
        };
      }),
  );

// 1) 記事ページを保存
const article = await ctx.newPage();
await article.goto(`${base}/article?utm_source=tw#frag`);
const aTab = await tabIdOf(`${base}/article*`);
check('記事タブのIDを取得できる', aTab != null);

let out = await save(aTab, 'auto');
check('記事: 新規保存 (created)', out?.kind === 'created', JSON.stringify(out));
check('記事: 抽出成功 (ok)', out?.extractStatus === 'ok');
let db = await dump();
let scrap = db.scraps[0];
check('記事: URLは元のまま保存', scrap?.url === `${base}/article?utm_source=tw#frag`, scrap?.url);
check('記事: 正規化URLは追跡パラメータ・#を除去', scrap?.normalizedUrl === `https://localhost:${port}/article`, scrap?.normalizedUrl);
check('記事: タイトル保存', scrap?.title === 'テスト記事');
check('記事: サイト名はOGP', scrap?.siteName === 'TestSite', scrap?.siteName);
const sources = db.fragments.map((f) => f.source).sort().join(',');
check('記事: 断片=本文+概要', sources === 'meta,readability', sources);
check('記事: 本文は上限3000字以内', db.fragments.find((f) => f.source === 'readability')?.text.length <= 3000);
check('記事: 概要(excerpt)がOG概要', scrap?.excerpt === 'OGの概要文です', scrap?.excerpt);
check('メタ: schemaVersion が記録される', db.meta.some((m) => m.key === 'schemaVersion' && m.value === 7));

// 2) 同じURLを再度（選択なし）
out = await save(aTab, 'auto');
check('同一URL(選択なし): already-saved', out?.kind === 'already-saved', out?.kind);
db = await dump();
check('同一URL(選択なし): 項目数は1のまま', db.scraps.length === 1);

// 3) スレッドページで範囲選択 → 複数の断片
const thread = await ctx.newPage();
await thread.goto(`${base}/thread`);
const tTab = await tabIdOf(`${base}/thread*`);
await thread.evaluate(() => { const s = getSelection(); s.selectAllChildren(document.getElementById('res1')); });
out = await save(tTab, 'auto');
check('スレッド: レス1を選択して新規保存', out?.kind === 'created', JSON.stringify(out));
await thread.evaluate(() => { const s = getSelection(); s.selectAllChildren(document.getElementById('res2')); });
out = await save(tTab, 'auto');
check('スレッド: レス2を選択すると既存項目に断片追加', out?.kind === 'fragment-added' && out.fragmentCount === 3, JSON.stringify(out));
out = await save(tTab, 'auto');
check('スレッド: 同じレス2は重複しない', out?.kind === 'duplicate-fragment', out?.kind);
db = await dump();
const threadScrap = db.scraps.find((s) => s.title === 'AIスレ');
const threadFrags = db.fragments.filter((f) => f.scrapId === threadScrap?.id);
check('スレッド: 項目は1つ・断片は3つ(選択2+本文1)', db.scraps.length === 2 && threadFrags.length === 3, `scraps=${db.scraps.length} frags=${threadFrags.length}`);
check('スレッド: レス1・レス2が選択断片として保存', threadFrags.filter((f) => f.source === 'selection').map((f) => f.text).sort().join('|') === 'レス1: プロンプトのコツ|レス2: ローカルLLMの設定', threadFrags.map((f) => f.source + ':' + f.text.slice(0, 8)).join(' '));

// 4) URLが見えないタブ（activeTab未付与の拡張ページ）: 例外にせず、何も書かずに failed を返す
const before = (await dump()).scraps.length;
const ownTab = await ext.evaluate(async () => (await chrome.tabs.getCurrent())?.id);
out = await save(ownTab, 'auto');
check('URL不可タブ: failed を返し、DBは変更されない', out?.kind === 'failed' && (await dump()).scraps.length === before, JSON.stringify(out));

// ===== P2 UI =====
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
const other = await ctx.newPage();
await other.goto(`${base}/other`);
const oTab = await tabIdOf(`${base}/other*`);
const errs = [];
async function openUi(file, w = 380, h = 600, tabId) {
  const ui = await ctx.newPage();
  ui.on('pageerror', (e) => errs.push(file + ': ' + e.message));
  ui.on('dialog', (d) => d.accept());
  if (tabId) await ui.addInitScript((id) => { chrome.tabs.query = async () => [{ id }]; }, tabId);
  await ui.setViewportSize({ width: w, height: h });
  await ui.goto(`chrome-extension://${extId}/${file}`);
  await ui.waitForTimeout(800);
  return ui;
}

// ポップアップ: 開くだけでは保存されず、一覧が見える
const n0 = (await dump()).scraps.length;
let pop = await openUi('popup.html', 460, 600, oTab);
check('ポップアップ: 開いただけでは保存されない', (await dump()).scraps.length === n0);
check('ポップアップ: 一覧に既存項目が出る', (await pop.locator('main').innerText()).includes('テスト記事'));
check('ポップアップ: カードの右側にAIボタンがある', (await pop.locator('.browser-list .ai-run').count()) > 0);
check('ポップアップ: 保存ボタンがある', await pop.getByRole('button', { name: 'このページをスクラップ' }).isVisible());
await pop.screenshot({ path: path.join(OUT, 'p2-popup-list.png') });
await pop.getByRole('button', { name: 'このページをスクラップ' }).click();
await pop.waitForTimeout(1500);
let txt = await pop.locator('main').innerText();
check('ポップアップ: ボタンで保存→成功表示', /保存しました/.test(txt), txt.replace(/\n+/g, ' / ').slice(0, 120));
check('ポップアップ: 保存後DB+1', (await dump()).scraps.length === n0 + 1);
await pop.screenshot({ path: path.join(OUT, 'p2-popup-saved.png') });
await pop.getByRole('button', { name: /取り消し/ }).click();
await pop.waitForTimeout(500);
check('ポップアップ: 取り消しで削除', (await dump()).scraps.length === n0);
await pop.getByRole('button', { name: 'このページをスクラップ' }).click();
await pop.waitForTimeout(1200);
check('ポップアップ: 再保存OK', (await dump()).scraps.length === n0 + 1);
check('ポップアップ: 本文取得の行は出さない', !/本文を取得/.test(txt));
check('ポップアップ: 設定のないサイトでもスナップショットの選択が出る', /スナップショットを撮る/.test(txt), txt.replace(/\n+/g, ' / ').slice(0, 160));
check('アイコン: 保存時にドメインのアイコンを取り込む', (await dump()).favicons.some((f) => f.domain === 'localhost' && f.data.startsWith('data:image/')));
// 保存済みのページをもう一度: 「上書き保存」「新規保存」の順
await pop.getByRole('button', { name: 'このページをスクラップ' }).click();
await pop.waitForTimeout(1200);
const btns = await pop.locator('.banner .actions button').allInnerTexts();
check('ポップアップ: 保存済みのボタンは「上書き保存」「新規保存」の順', btns[0] === '上書き保存' && btns[1] === '新規保存', btns.join('|'));
// カードを押すと、サイドパネルではなくポップアップの中に詳細が出る
await pop.locator('.browser-list .row-main').first().click();
await pop.waitForSelector('main.popup.detail');
await pop.waitForFunction(() => (document.querySelector('main.popup.detail')?.innerText ?? '').length > 20).catch(() => {});
check('ポップアップ: カードを押すとポップアップ内に詳細が出る', (await pop.locator('main.popup.detail').innerText()).length > 20);
await pop.screenshot({ path: path.join(OUT, 'p15-popup-detail.png') });
await pop.locator('main.popup.detail').getByRole('button', { name: '戻る' }).first().click();
await pop.waitForSelector('.browser-list .row');
check('ポップアップ: 戻ると一覧に戻る', (await pop.locator('.browser-list .row').count()) > 0);
await pop.close();

// 管理画面
const mg = await openUi('manager.html', 1280, 800);
await mg.screenshot({ path: path.join(OUT, 'p2-manager-list.png') });
const rows = () => mg.locator('.scrap-row, li.row, [data-scrap-id]');
let body = await mg.locator('body').innerText();
check('管理: 一覧に3件以上', ['テスト記事', 'AIスレ', '別の記事'].every((x) => body.includes(x)));

// 検索
await mg.getByPlaceholder('タイトル・URL・メモ・本文を検索').fill('ローカルLLM');
await mg.waitForTimeout(500);
body = await mg.locator('.m-main').innerText();
check('管理: 本文検索でAIスレのみ', body.includes('AIスレ') && !body.includes('テスト記事'));
await mg.getByPlaceholder('タイトル・URL・メモ・本文を検索').fill('');
await mg.waitForTimeout(400);

// 詳細を開く→星・ピン・メモ・カテゴリ
await mg.locator('.m-main').getByText('テスト記事').first().click();
await mg.waitForTimeout(600);
const det = mg.locator('.m-detail');
check('管理: 詳細ペインが開く', await det.isVisible());
await det.getByRole('button', { name: '星5' }).click();
await det.getByRole('button', { name: /ピン留め/ }).click();
await det.getByLabel('メモ').fill('管理画面メモ');
await det.getByLabel('メモ').blur();
await det.getByRole('button', { name: '＋ カテゴリ' }).click();
await det.getByLabel('新しいカテゴリ').fill('AI活用');
await det.getByLabel('新しいカテゴリ').press('Enter');
await mg.waitForTimeout(700);
db = await dump();
let s1 = db.scraps.find((x) => x.title === 'テスト記事');
check('管理: 星5・ピン・メモ保存', s1?.stars === 5 && s1?.pinned === true && s1?.memo === '管理画面メモ', JSON.stringify({ s: s1?.stars, p: s1?.pinned, m: s1?.memo }));
check('管理: カテゴリ作成・付与', s1?.categoryIds?.length === 1, JSON.stringify(s1?.categoryIds));
// カテゴリはワンタップで外す・付ける
await det.locator('.detail-tags').getByRole('button', { name: /AI活用/ }).click();
await mg.waitForTimeout(400);
check('管理: カテゴリをワンタップで外す', (await dump()).scraps.find((x) => x.title === 'テスト記事')?.categoryIds.length === 0);
await det.locator('.detail-tags').getByRole('button', { name: /AI活用/ }).click();
await mg.waitForTimeout(400);
db = await dump();
s1 = db.scraps.find((x) => x.title === 'テスト記事');
check('管理: カテゴリをワンタップで付ける', s1?.categoryIds.length === 1);
await mg.screenshot({ path: path.join(OUT, 'p2-manager-detail.png') });

// フィルタ
const side = mg.locator('.m-side');
const fsel = () => mg.locator('.filter-pop .filters select'); // 0=ドメイン 1=AI要約 2=評価
const openFilters = async () => { if ((await mg.locator('.filter-pop').count()) === 0) await mg.getByRole('button', { name: '絞り込み' }).click(); };
const clearFilters = async () => {
  while ((await mg.locator('.active-filters .fchip button').count()) > 0) {
    await mg.locator('.active-filters .fchip button').first().click();
    await mg.waitForTimeout(150);
  }
};
const showView = async (v) => { await side.getByRole('button', { name: v === 'archived' ? 'アーカイブ' : '一覧' }).click(); await mg.waitForTimeout(300); };
await openFilters();
await fsel().nth(2).selectOption('5');
await mg.waitForTimeout(500);
body = await mg.locator('.m-main').innerText();
check('管理: 星5以上フィルタ', body.includes('テスト記事') && !body.includes('AIスレ'));
await fsel().nth(2).selectOption('unrated');
await mg.waitForTimeout(500);
body = await mg.locator('.m-main').innerText();
check('管理: 未評価フィルタ', !body.includes('テスト記事') && body.includes('AIスレ'));
await clearFilters();
await side.locator('.m-cats').getByRole('button', { name: 'AI活用' }).click();
await mg.waitForTimeout(500);
body = await mg.locator('.m-main').innerText();
check('管理: カテゴリフィルタ', body.includes('テスト記事') && !body.includes('AIスレ'));
await side.locator('.m-cats').getByRole('button', { name: 'AI活用' }).click(); // もう一度押すと解除
await fsel().nth(1).selectOption('none');
await mg.waitForTimeout(500);
check('管理: AI要約なしフィルタ(全件該当)', (await mg.locator('.m-main').innerText()).includes('AIスレ'));
await clearFilters();
await fsel().nth(0).selectOption({ index: 1 });
await mg.waitForTimeout(300);
check('管理: 有効な条件だけチップ表示', (await mg.locator('.active-filters .fchip').count()) === 1);
await clearFilters();

// 断片: 切り出し・削除
await mg.locator('.m-main').getByText('AIスレ').first().click();
await mg.waitForTimeout(600);
await mg.locator('.m-detail').getByRole('button', { name: '別の項目に切り出す' }).first().click();
await mg.waitForTimeout(700);
db = await dump();
const threads = db.scraps.filter((x) => x.title === 'AIスレ');
check('管理: 断片の切り出しで項目が増える', threads.length === 2, 'n=' + threads.length);
const tf = db.fragments.filter((f) => f.scrapId === threadScrap.id);
check('管理: 元項目の断片が1減る', tf.length === 2, 'n=' + tf.length);
await mg.locator('.m-detail').getByRole('button', { name: '削除' }).first().click().catch(() => {});
await mg.waitForTimeout(600);
db = await dump();
check('管理: 断片削除(切り出し先の断片が消える)', db.fragments.filter((f) => db.scraps.some((x) => x.id === f.scrapId && x.title === 'AIスレ')).length === 2);

// 一括操作: 全選択→アーカイブ→アーカイブ表示→復元
await mg.getByRole('button', { name: '表示中をすべて選択' }).click();
await mg.waitForTimeout(300);
check('管理: 一括選択バー', /件選択中/.test(await mg.locator('.bulkbar').innerText()));
await mg.locator('.bulkbar').getByRole('button', { name: 'アーカイブ' }).click();
await mg.waitForTimeout(700);
db = await dump();
check('管理: 一括アーカイブ', db.scraps.every((x) => x.archivedAt != null), JSON.stringify(db.scraps.map((x) => x.archivedAt)));
check('管理: 通常表示は空', /まだ何も|条件に合う/.test(await mg.locator('.m-main').innerText()));
await showView('archived');
check('管理: アーカイブ表示に出る', (await mg.locator('.m-main').innerText()).includes('テスト記事'));
await mg.screenshot({ path: path.join(OUT, 'p2-manager-archive.png') });
await mg.getByRole('button', { name: '表示中をすべて選択' }).click();
await mg.locator('.bulkbar').getByRole('button', { name: '復元' }).click();
await mg.waitForTimeout(700);
db = await dump();
check('管理: 一括復元', db.scraps.every((x) => x.archivedAt == null));
await showView('active');

// 完全削除（アーカイブしてから）
const cnt = db.scraps.length;
await mg.locator('.m-main').getByText('別の記事').first().click();
await mg.waitForTimeout(500);
await mg.locator('.m-detail .menu summary').click();
await mg.locator('.m-detail').getByRole('button', { name: 'アーカイブ' }).click();
await mg.waitForTimeout(500);
await showView('archived');
await mg.locator('.m-main').getByText('別の記事').first().click();
await mg.waitForTimeout(500);
await mg.locator('.m-detail .menu summary').click();
await mg.locator('.m-detail .menu-list').getByRole('button', { name: '削除', exact: true }).click();
check('管理: 1回目はボタンが変わるだけ', (await mg.locator('.m-detail .menu-list').getByRole('button', { name: 'もう一度押すと削除' }).count()) === 1 && (await dump()).scraps.length === cnt);
await mg.screenshot({ path: path.join(OUT, 'p9-delete-confirm.png') });
await mg.locator('.m-detail .menu-list').getByRole('button', { name: 'もう一度押すと削除' }).click();
await mg.waitForTimeout(700);
db = await dump();
check('管理: 完全削除', db.scraps.length === cnt - 1 && !db.scraps.some((x) => x.title === '別の記事'));
await showView('active');

// カテゴリ管理
await mg.locator('.m-nav').getByRole('button', { name: 'カテゴリ' }).click();
await mg.getByLabel('新しいカテゴリ').fill('二つ目');
await mg.getByRole('button', { name: '追加' }).click();
await mg.waitForTimeout(500);
body = await mg.locator('.m-main').innerText();
check('カテゴリ管理: 追加・使用数表示', body.includes('二つ目') && body.includes('AI活用') && body.includes('1件'));
await mg.getByRole('button', { name: '二つ目: 上へ' }).click();
await mg.waitForTimeout(400);
const first = await mg.locator('.cat-table tr').first().innerText();
check('カテゴリ管理: 並べ替え', first.includes('二つ目'), first);
await mg.getByRole('button', { name: '名前変更' }).first().click();
await mg.getByLabel('名前変更').fill('改名済み');
await mg.getByRole('button', { name: '保存' }).click();
await mg.waitForTimeout(400);
check('カテゴリ管理: 名前変更', (await mg.locator('.m-main').innerText()).includes('改名済み'));
await mg.screenshot({ path: path.join(OUT, 'p2-manager-cats.png') });
await mg.getByRole('button', { name: '削除' }).first().click();
await mg.waitForTimeout(500);
check('カテゴリ管理: 削除', !(await mg.locator('.m-main').innerText()).includes('改名済み'));

// 設定
await mg.locator('.m-nav').getByRole('button', { name: '設定', exact: true }).click();
await mg.locator('input[type=number]').fill('500');
await mg.locator('input[type=number]').blur();
await mg.waitForTimeout(400);
let st = await ext.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
check('設定: 文字数上限が保存', st?.articleMaxChars === 500, JSON.stringify(st));
await mg.locator('select').first().selectOption('en');
await mg.waitForTimeout(600);
check('設定: 言語を英語に切替', /Settings|Display language/.test(await mg.locator('.m-main').innerText()), (await mg.locator('.m-main').innerText()).slice(0, 60));
await mg.screenshot({ path: path.join(OUT, 'p2-manager-settings.png') });
await mg.locator('select').first().selectOption('ja');
await mg.waitForTimeout(400);

// サイドパネル
const sp = await openUi('sidepanel.html', 400, 700);
body = await sp.locator('body').innerText();
check('サイドパネル: 一覧表示・保存ボタンなし', body.includes('テスト記事') && !body.includes('このページをスクラップ'));
await sp.screenshot({ path: path.join(OUT, 'p2-sidepanel.png') });
await sp.getByText('テスト記事').first().click();
await sp.waitForTimeout(500);
check('サイドパネル: 項目クリックで詳細', await sp.getByLabel('メモ').isVisible());
await sp.getByRole('button', { name: '戻る' }).click();
await sp.waitForTimeout(400);
check('サイドパネル: 戻っても見出しを出さない（Chromeが出す）・検索欄は1つ', (await sp.locator('.popup-head').count()) === 0 && (await sp.locator('input[type=search]').count()) === 1);
await sp.screenshot({ path: path.join(OUT, 'p9-sidepanel.png') });

// ポップアップ→詳細（sidePanel.open が使えない環境ではフォールバックで管理タブ）
const pop2 = await openUi('popup.html', 460, 600, oTab);
check('ポップアップ: 注意書きを出さない', !(await pop2.locator('body').innerText()).includes('ブラウザ内にのみ保存'));
check('ポップアップ: サイドパネル/管理画面ボタン', (await pop2.getByRole('button', { name: 'サイドパネル' }).count()) === 1 && (await pop2.getByRole('button', { name: '管理画面' }).count()) === 1);
await pop2.screenshot({ path: path.join(OUT, 'p2-popup-ja.png') });

// P6: ショートカット・右クリック（既定オフ）
{
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('manifest: コマンド登録・キーは未割り当て', !!man.commands?.['save-page'] && !!man.commands?.['open-manager'] && !man.commands['save-page'].suggested_key && !man.commands['open-manager'].suggested_key);
  check('manifest: contextMenusは任意権限で、通常権限に入っていない', man.optional_permissions?.includes('contextMenus') && !man.permissions.includes('contextMenus'));
  const sm = await ctx.newPage();
  await sm.setViewportSize({ width: 1200, height: 1000 });
  await sm.goto(`chrome-extension://${extId}/manager.html#section=settings`);
  await sm.waitForTimeout(600);
  const box = sm.getByLabel('右クリックメニューに「ScrapAIに保存」を出す');
  check('設定: 右クリックメニューは既定オフ', (await box.isChecked()) === false);
  check('設定: ショートカット案内がある', (await sm.locator('.shortcuts').innerText()).includes('既定は未割り当て'));
  await sm.screenshot({ path: path.join(OUT, 'p6-settings.png'), fullPage: true });
}

// カード表示の列数
const cm = await ctx.newPage();
await cm.setViewportSize({ width: 1400, height: 900 });
await cm.goto(`chrome-extension://${extId}/manager.html`);
await cm.waitForTimeout(600);
await cm.getByRole('button', { name: 'カード', exact: true }).click();
await cm.waitForTimeout(300);
const colsOf = () => cm.locator('.rows.grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
await cm.getByRole('button', { name: '2列' }).click();
await cm.waitForTimeout(300);
check('カード: 2列に切り替え', (await colsOf()) === 2);
await cm.getByRole('button', { name: '3列' }).click();
await cm.waitForTimeout(300);
check('カード: 3列に切り替え', (await colsOf()) === 3);
await cm.screenshot({ path: path.join(OUT, 'p6-columns.png') });
await cm.reload();
await cm.waitForTimeout(500);
check('カード: 列数が記憶される', (await colsOf()) === 3);
await cm.getByRole('button', { name: 'コンパクト', exact: true }).click();
await cm.waitForTimeout(300);
check('コンパクト時は列ボタンが出ない', (await cm.getByRole('button', { name: '3列' }).count()) === 0);

// カード（大）と、下段の位置そろえ
await cm.getByRole('button', { name: 'カード（大）', exact: true }).click();
await cm.waitForTimeout(400);
check('カード（大）: 切り替えられる', (await cm.locator('.rows .row.large').count()) > 0);
const bigText = await cm.locator('.rows .row.large', { hasText: 'テスト記事' }).first().locator('.row-excerpt').innerText();
check('カード（大）: 本文が長く出る（200字以上）', bigText.length >= 200, String(bigText.length));
await cm.screenshot({ path: path.join(OUT, 'p11-large.png') });
await cm.getByRole('button', { name: 'コンパクト', exact: true }).click();
await cm.waitForTimeout(300);
const pos = await cm.locator('.rows .row').evaluateAll((rows) => rows.map((r) => ({
  flags: Math.round(r.querySelector('.meta-flags').getBoundingClientRect().left),
  stars: Math.round(r.querySelector('.stars').getBoundingClientRect().right),
  cats: Math.round(r.querySelector('.meta-cats').getBoundingClientRect().left),
  starsBeforeCats: r.querySelector('.stars').getBoundingClientRect().right <= r.querySelector('.meta-cats').getBoundingClientRect().left + 1,
  time: !!r.querySelector('.row-meta time'),
})));
check('下段: 状態・星・カテゴリの位置がどのカードでもそろい、星はカテゴリの左', new Set(pos.map((p) => p.flags)).size === 1 && new Set(pos.map((p) => p.stars)).size === 1 && new Set(pos.map((p) => p.cats)).size === 1 && pos.every((p) => p.starsBeforeCats), JSON.stringify(pos));
check('下段: 保存日時は一覧に出さない', pos.every((p) => !p.time));
await cm.screenshot({ path: path.join(OUT, 'p11-compact.png') });

// テーマ: 既定はライト、設定でダーク
check('テーマ: 既定はライト', (await cm.evaluate(() => document.documentElement.dataset.theme)) === 'light');
await ext.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, theme: 'dark' } });
});
await cm.waitForTimeout(400);
const bg = await cm.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('テーマ: ダークに切り替わる（開いている画面にも反映）', (await cm.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && bg !== 'rgb(255, 255, 255)', bg);
await cm.screenshot({ path: path.join(OUT, 'p13-dark.png') });
await ext.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, theme: 'light' } });
});
await cm.waitForTimeout(300);

// 並び順: ドメイン順
await cm.getByLabel('並び順').selectOption('domain-asc');
await cm.waitForTimeout(300);
check('並び順: ドメイン順を選べる', (await cm.locator('.rows .row').count()) > 0);

// ページ送り: 1ページの件数を1にすると番号つきのページ送りが出る
await ext.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, pageSize: 1 } });
});
await cm.reload();
await cm.waitForSelector('.rows .row');
check('ページ送り: 1件ずつ表示される', (await cm.locator('.rows .row').count()) === 1);
check('ページ送り: ページ番号が出る', (await cm.locator('.pager .pager-num').count()) >= 2);
await cm.locator('.pager .pager-num').nth(1).click();
check('ページ送り: 2ページ目に移れる', (await cm.locator('.pager .pager-num.on').innerText()) === '2');
await cm.screenshot({ path: path.join(OUT, 'p14-pager.png') });
await ext.evaluate(async () => {
  const cur = (await chrome.storage.local.get('settings')).settings ?? {};
  await chrome.storage.local.set({ settings: { ...cur, pageSize: 50 } });
});
await cm.reload();
await cm.waitForSelector('.rows .row');
check('ページ送り: 既定は50件で、1ページに収まるときは出さない', (await cm.locator('.pager').count()) === 0);
check('操作バー: 何も選んでいなくても常に出ている', (await cm.locator('.bulkbar.idle').count()) === 1 && (await cm.locator('.bulkbar').getByRole('button', { name: 'ピン留め', exact: true }).isDisabled()));

// 一括: ピン留め・星
await cm.getByRole('button', { name: '表示中をすべて選択' }).click();
await cm.locator('.bulkbar').getByRole('button', { name: 'ピン留め', exact: true }).click();
await cm.waitForTimeout(500);
let act = (await dump()).scraps.filter((x) => x.archivedAt == null);
check('一括: ピン留めをまとめて付ける', act.length > 0 && act.every((x) => x.pinned));
await cm.locator('.bulkbar').getByRole('button', { name: 'ピン留めを外す' }).click();
await cm.waitForTimeout(500);
act = (await dump()).scraps.filter((x) => x.archivedAt == null);
check('一括: ピン留めをまとめて外す', act.every((x) => !x.pinned));
await cm.locator('.bulkbar').getByRole('button', { name: '評価' }).click();
await cm.getByRole('menuitem', { name: '星4' }).click();
await cm.waitForTimeout(500);
act = (await dump()).scraps.filter((x) => x.archivedAt == null);
check('一括: 星をまとめて付ける', act.length > 0 && act.every((x) => x.stars === 4));
await cm.locator('.bulkbar').getByRole('button', { name: '評価' }).click();
await cm.getByRole('menuitem', { name: '評価を外す' }).click();
await cm.waitForTimeout(500);
act = (await dump()).scraps.filter((x) => x.archivedAt == null);
check('一括: 星をまとめて外す', act.every((x) => x.stars == null));
await cm.screenshot({ path: path.join(OUT, 'p14-bulk.png') });

// 一括削除: 選択 → その他 → 削除 → 確認
const nBefore = (await dump()).scraps.length;
await cm.locator('.bulkbar').getByRole('button', { name: 'その他' }).click();
await cm.getByRole('button', { name: /選択した\d+件を削除/ }).click();
check('一括削除: 1回目では消えない', (await dump()).scraps.length === nBefore);
await cm.getByRole('button', { name: 'もう一度押すと削除' }).click();
await cm.waitForTimeout(700);
check('一括削除: 表示中の項目が消える', (await dump()).scraps.filter((x) => x.archivedAt == null).length === 0, String((await dump()).scraps.length));

// 管理画面「AI連携」
await cm.locator('.m-nav').getByRole('button', { name: 'AI連携' }).click().catch(async () => { await cm.getByRole('button', { name: 'AI連携' }).click(); });
await cm.waitForSelector('.settings');
const aiTxt = await cm.locator('.m-main').innerText();
check('AI連携: AIボタン・Gemini API・AIサービスの設定がある', /AIボタン/.test(aiTxt) && /Gemini API/.test(aiTxt) && /AIサービス/.test(aiTxt));
check('AI連携: 「AIサイト」という言い方を使わない', !/AIサイト/.test(aiTxt));
await cm.getByRole('button', { name: 'AIサービスを追加' }).click();
await cm.waitForTimeout(400);
check('AI連携: AIサービスを追加できる', (await cm.locator('.svc').count()) === 4);
await cm.locator('.svc').last().locator('summary').click();
await cm.locator('.svc').last().getByLabel('名前').fill('Grok');
await cm.locator('.svc').last().getByLabel('開くURL').fill('https://grok.com/');
await cm.locator('.svc').last().getByLabel('開くURL').press('Tab');
await cm.waitForTimeout(1200);
const saved = await ext.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.aiServices ?? null);
check('AI連携: 追加したAIサービスが保存される', saved?.some((x) => x.name === 'Grok' && x.url === 'https://grok.com/' && x.builtIn === false), JSON.stringify(saved?.find((x) => x.name === 'Grok')));
await cm.locator('.m-main').getByLabel('APIキー').fill('AIza-test-key');
await cm.locator('.m-main').getByLabel('APIキー').blur();
await cm.waitForTimeout(400);
const keyStored = await ext.evaluate(async () => (await chrome.storage.local.get(['geminiApiKey', 'settings']))); 
check('AI連携: APIキーは設定とは別に保存し、設定には入れない', keyStored.geminiApiKey === 'AIza-test-key' && !JSON.stringify(keyStored.settings ?? {}).includes('AIza'));
await cm.screenshot({ path: path.join(OUT, 'p17-ai-settings.png') });
check('アイコン: 項目が全部なくなればアイコンも消える', (await dump()).favicons.length === 0, JSON.stringify((await dump()).favicons.map((f) => f.domain)));
check('JSエラーなし', errs.length === 0, errs.join(' | '));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
