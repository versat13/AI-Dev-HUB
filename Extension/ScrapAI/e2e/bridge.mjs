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
  '/mockai': `<!doctype html><html><head><meta charset="utf-8"><title>Mock AI</title>
    <style>body{margin:0;font:14px sans-serif} #log{padding:20px;padding-bottom:200px} .composer{position:fixed;left:20px;right:20px;bottom:20px;display:flex;gap:8px}
    .composer div{flex:1;min-height:60px;border:1px solid #999;padding:8px}</style></head><body>
    <div id="log"></div>
    <div class="composer"><div class="ed" contenteditable="true"></div><button aria-label="Send" id="go">↑</button></div>
    <script>
      document.getElementById('go').onclick = () => {
        const ed = document.querySelector('.ed');
        const text = ed.innerText;
        const user = document.createElement('div'); user.className = 'msg user';
        const pre = document.createElement('pre'); pre.textContent = text; user.appendChild(pre);
        document.getElementById('log').appendChild(user);
        ed.innerText = '';
        window.__sent = text;
        setTimeout(() => {
          const bot = document.createElement('div'); bot.className = 'msg bot';
          bot.innerHTML = '<pre><code></code></pre>';
          bot.querySelector('code').textContent = '## Headline\\nモックAIの見出し\\n## Key points\\n- 取り込みの確認\\n## Usefulness\\nテスト\\n## Prompt for the next AI\\n続けて\\n## Source URLs\\nhttp://localhost/';
          document.getElementById('log').appendChild(bot);
        }, 600);
      };
    </script></body></html>`,
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

// ===== AIへの受け渡し（ボタン一つ）=====
// 本物のAIサイトには出られないので、作りの違う見本ページ（既知の場所が1つもない）で、推定で動くことを確かめる
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000, aiApplyHeadline: true } }));
const art = await ctx.newPage();
await art.goto(`${base}/article`);
const out = await save(await tabIdOf(`${base}/article*`), 'auto');
check('準備: 記事を保存', out?.kind === 'created');
const prompt = 'Please summarize.\n\n```markdown\n## Headline\n(a short title)\n\n## Key points\n(3–5 bullet points)\n```\n\n<material>テスト記事</material>';
const before = ctx.pages().length;
await ext.evaluate(([url, scrapId, prompt]) => chrome.runtime.sendMessage({
  type: 'ai-open',
  url,
  bridge: {
    prompt, autoSend: true, scrapId, service: 'claude', templateId: 'builtin-summary',
    expected: ['headline', 'summary', 'usefulness', 'nextPrompt', 'sources'],
    labels: { capture: 'ScrapAIに取り込む', saved: 'ScrapAIに保存しました', notFound: '回答が見つかりません', failed: '保存できませんでした', filled: '入れました' },
  },
}), [`${base}/mockai`, out.scrapId, prompt]);
let ai;
for (let i = 0; i < 40 && !ai; i++) {
  await art.waitForTimeout(150);
  ai = ctx.pages().find((p) => p.url().endsWith('/mockai'));
}
check('ボタン一つ: AIのページを開く', !!ai && ctx.pages().length === before + 1);
await ai.waitForTimeout(1500);
const sent = await ai.evaluate(() => window.__sent ?? '');
check('ボタン一つ: 入力欄を推定してプロンプトを入れ、送信する', sent.includes('Please summarize.') && sent.includes('<material>'), sent.slice(0, 60));
const btn = ai.locator('#scrapai-bridge').getByRole('button', { name: /ScrapAIに取り込む/ });
check('ボタン一つ: 取り込みボタンが出る', (await btn.count()) === 1);
await ai.waitForTimeout(800);
check('ボタン一つ: 回答が出たらボタンを目立たせる', await ai.locator('#scrapai-bridge .go.ready').count() === 1);
await ai.screenshot({ path: path.join(OUT, 'p15-bridge.png') });
await btn.click();
await ai.waitForTimeout(800);
check('ボタン一つ: 保存しましたと表示', (await ai.locator('#scrapai-bridge .note').innerText()).includes('保存しました'));
const db = await ext.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    const tx = open.result.transaction(['aiAnswers', 'scraps'], 'readonly');
    const o = {};
    tx.objectStore('aiAnswers').getAll().onsuccess = (e) => (o.answers = e.target.result);
    tx.objectStore('scraps').getAll().onsuccess = (e) => (o.scraps = e.target.result);
    tx.oncomplete = () => resolve(o);
  };
}));
const ans = db.answers[0];
check('ボタン一つ: 回答を見出しごとに保存（送ったプロンプトの見本ではなく回答）', db.answers.length === 1 && ans.parseStatus === 'ok' && ans.raw.includes('モックAIの見出し') && ans.service === 'claude', JSON.stringify(db.answers.map((a) => a.parseStatus)));
check('ボタン一つ: タイトルを見出しに置き換える', db.scraps.find((s) => s.id === out.scrapId)?.title === 'モックAIの見出し');

// ===== AIボタン（裏でタブを開く → 送信 → 回答が出そろったら取り込む → タブを閉じる）=====
await ai.close();
const art2 = await ctx.newPage();
await art2.goto(`${base}/other`);
const out2 = await save(await tabIdOf(`${base}/other*`), 'auto');
await ext.evaluate((u) => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000, aiApplyHeadline: true, aiButtonService: 'mock', aiButtonTemplateId: 'builtin-summary', aiTemporaryChat: false,
  aiServices: [{ id: 'mock', name: 'Mock', url: u, builtIn: false, autoSend: false, closeOnDone: true }] } }), `${base}/mockai`);
const jobs = () => ext.evaluate(async () => (await chrome.storage.session.get('aiJobs')).aiJobs ?? {});
await art2.bringToFront();
const t0 = Date.now();
await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'ai-run', scrapId: id }), out2.scrapId);
let mock;
for (let i = 0; i < 40 && !mock; i++) { await art2.waitForTimeout(150); mock = ctx.pages().find((p) => p.url().endsWith('/mockai')); }
check('AIボタン: AIのタブを開く', !!mock);
check('AIボタン: 手前に出さない（今のタブのまま）', (await ext.evaluate(async () => (await chrome.tabs.query({ url: '*://*/mockai' }))[0]?.active)) === false);
check('AIボタン: 処理中と記録される', (await jobs())[out2.scrapId]?.state === 'running');
for (let i = 0; i < 80 && !mock.isClosed(); i++) await art2.waitForTimeout(250); // 回答が出そろうまで（約7秒）
check('AIボタン: 取り込めたらタブを自動で閉じる', mock.isClosed(), String(Date.now() - t0) + 'ms');
const after = await ext.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('scrapai');
  open.onsuccess = () => {
    const tx = open.result.transaction(['aiAnswers', 'scraps'], 'readonly');
    const o = {};
    tx.objectStore('aiAnswers').getAll().onsuccess = (e) => (o.answers = e.target.result);
    tx.objectStore('scraps').getAll().onsuccess = (e) => (o.scraps = e.target.result);
    tx.oncomplete = () => resolve(o);
  };
}));
const a2 = after.answers.find((a) => a.scrapId === out2.scrapId);
check('AIボタン: 回答を保存（サービスは mock、見出しも置換）', !!a2 && a2.service === 'mock' && a2.parseStatus === 'ok' && after.scraps.find((x) => x.id === out2.scrapId)?.title === 'モックAIの見出し');
check('AIボタン: 完了と記録される', (await jobs())[out2.scrapId]?.state === 'done');

// 失敗: 入力欄のないページでは、失敗と記録してタブを残す（手前に出す）
await ext.evaluate((u) => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000, aiButtonService: 'bad', aiButtonTemplateId: 'builtin-summary', aiTemporaryChat: false,
  aiServices: [{ id: 'bad', name: 'Bad', url: u, builtIn: false, autoSend: false, closeOnDone: true }] } }), `${base}/thread`);
await ext.evaluate((id) => chrome.runtime.sendMessage({ type: 'ai-run', scrapId: id }), out2.scrapId);
for (let i = 0; i < 130 && (await jobs())[out2.scrapId]?.state !== 'failed'; i++) await art2.waitForTimeout(250);
check('AIボタン: 入力欄が見つからなければ失敗と記録する', (await jobs())[out2.scrapId]?.state === 'failed', JSON.stringify((await jobs())[out2.scrapId]));
check('AIボタン: 失敗したタブは閉じずに残す', ctx.pages().some((p) => p.url().endsWith('/thread')));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
