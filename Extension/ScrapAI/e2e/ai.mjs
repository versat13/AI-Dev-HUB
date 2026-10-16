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

// ===== P4: AI連携 =====
await ext.evaluate(() => chrome.storage.local.set({ settings: { locale: 'ja', articleMaxChars: 3000 } }));
// ヘッドレスでは拡張機能のページにクリップボード権限を付与できないため、記録用の代役に差し替える
const fakeClipboard = () => {
  let v = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (t) => { v = t; }, readText: async () => v },
  });
};

const art = await ctx.newPage();
await art.goto(`${base}/article`);
let out = await save(await tabIdOf(`${base}/article*`), 'auto');
check('準備: 記事を保存', out?.kind === 'created', JSON.stringify(out));
const scrapId = out.scrapId;
const oth = await ctx.newPage();
await oth.goto(`${base}/other`);
await save(await tabIdOf(`${base}/other*`), 'auto');

const errs = [];
const mg = await ctx.newPage();
mg.on('pageerror', (e) => errs.push(e.message));
mg.on('dialog', (d) => d.accept());
await mg.addInitScript(fakeClipboard);
await mg.setViewportSize({ width: 1280, height: 1000 });
await mg.goto(`chrome-extension://${extId}/manager.html#scrap=${scrapId}`);
await mg.waitForTimeout(800);
const det = mg.locator('.m-detail');
await det.getByRole('tab', { name: /AI/ }).click();
check('詳細にAI欄がある', await det.locator('.ai-panel').isVisible());

// プロンプトのコピー
await det.getByRole('button', { name: 'プロンプトをコピー' }).click();
await mg.waitForTimeout(300);
let clip = await mg.evaluate(() => navigator.clipboard.readText());
check('プロンプト: 形式と資料が入る', clip.includes('## 要点') && clip.includes('## 次回AIに渡す指示') && clip.includes('タイトル: テスト記事') && clip.includes('これは本文の段落です'), clip.slice(0, 80));
check('プロンプト: コピーしました表示', /コピーしました/.test(await det.locator('.ai-ask').innerText()));

// テンプレート切り替え（短く要点だけ）→ 形式が変わる、設定に記憶される
await det.getByLabel('テンプレート').selectOption({ label: '短く要点だけ' });
await det.getByRole('button', { name: 'プロンプトをコピー' }).click();
await mg.waitForTimeout(300);
clip = await mg.evaluate(() => navigator.clipboard.readText());
check('テンプレート切替: 要点・有用性だけ', clip.includes('## 有用性') && !clip.includes('## 最初の一歩'), clip.slice(0, 60));
const st = await ext.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
check('テンプレート切替: 記憶される', st?.aiTemplateId === 'builtin-brief', st?.aiTemplateId);
await det.getByLabel('テンプレート').selectOption({ label: '要約と検証' });

// 断片の除外
await det.locator('.ai-frags summary').click();
await det.locator('.ai-frags input[type=checkbox]').nth(1).uncheck();
await det.getByRole('button', { name: 'プロンプトをコピー' }).click();
await mg.waitForTimeout(300);
clip = await mg.evaluate(() => navigator.clipboard.readText());
check('断片の除外: 2つ目（概要）が入らない', !clip.includes('OGの概要文です') && clip.includes('これは本文の段落です'));
check('断片の除外: 件数表示', /AIに渡す断片（1\/2）/.test(await det.locator('.ai-frags summary').innerText()));
await det.locator('.ai-frags input[type=checkbox]').nth(1).check();

// コピーしてAIサイトを開く
const before = ctx.pages().length;
await det.getByRole('button', { name: 'ChatGPT' }).click();
let opened;
for (let i = 0; i < 20 && ctx.pages().length === before; i++) await mg.waitForTimeout(150);
opened = ctx.pages().find((p) => !p.url().startsWith('chrome-extension://') && p.url() !== 'about:blank') ?? ctx.pages().at(-1);
// サンドボックスは外部へ出られないため、URLはchatgpt.comまたはエラーページのどちらでもよい
check('ChatGPTを開く: 新しいタブ', ctx.pages().length === before + 1, opened?.url());
await opened?.close().catch(() => {});
check('ChatGPTを開く: 案内とクリップボード', /ChatGPT の入力欄に貼り付け/.test(await det.locator('.ai-ask').innerText()) && (await mg.evaluate(() => navigator.clipboard.readText())).includes('## 要点'));

// 回答の貼り付け（形式どおり）
const good = [
  'はい、整理します。',
  '## 見出し', 'テスト記事を整理した見出し',
  '## 要点', '- 段落が12回繰り返される', '## 有用性', '動作確認に使える',
  '## 確認済みの事実', 'タイトルはテスト記事', '## 未確認事項・確度の根拠', '作者は不明',
  '## 前提条件', 'Chrome', '## 最初の一歩', '保存ボタンを押す',
  '## 次回AIに渡す指示', 'この記事の続きを調べて', '## 出典URL', 'http://localhost/article',
].join('\n');
await det.getByLabel('AIの回答').fill(good);
await det.getByLabel('回答したAI').selectOption('claude');
await det.getByRole('button', { name: '回答を保存' }).click();
await mg.waitForTimeout(600);
let db = await dump();
let ans = db.aiAnswers.filter((a) => a.scrapId === scrapId);
check('回答保存: 構造化 ok、原文も保存', ans.length === 1 && ans[0].parseStatus === 'ok' && ans[0].raw === good && ans[0].service === 'claude', JSON.stringify(ans.map((a) => a.parseStatus)));
check('回答保存: 件数が「AI要約あり」に反映', db.scraps.find((s) => s.id === scrapId)?.aiAnswerCount === 1);
check('見出し: タイトルが自動で置き換わる', (await det.locator('.title-input').inputValue()) === 'テスト記事を整理した見出し' && db.scraps.find((s) => s.id === scrapId)?.originalTitle === 'テスト記事');
check('見出し: カードの先頭に見出し、残りは折りたたみ', (await det.locator('.answer-headline').first().innerText()).includes('テスト記事を整理した見出し') && !(await det.locator('.answer').first().innerText()).includes('保存ボタンを押す'));
await det.locator('.answer-more summary').first().click();
let card = await det.locator('.answer').first().innerText();
check('回答カード: 見出しごとに表示', /構造化済み/.test(card) && /最初の一歩/.test(card) && /保存ボタンを押す/.test(card) && /Claude/.test(card), card.replace(/\n+/g, ' / ').slice(0, 100));
await det.getByRole('button', { name: '次回の指示をコピー' }).click();
await mg.waitForTimeout(200);
check('次回の指示をコピー', (await mg.evaluate(() => navigator.clipboard.readText())) === 'この記事の続きを調べて');
await mg.screenshot({ path: path.join(OUT, 'p4-answer.png'), fullPage: true });
await det.locator('.original-title').getByRole('button', { name: 'タイトルを元に戻す' }).click();
await mg.waitForTimeout(400);
check('見出し: 元のタイトルに戻せる', (await det.locator('.title-input').inputValue()) === 'テスト記事');

// 形式が違う回答 → 原文のみ
await det.getByLabel('AIの回答').fill('見出しのない自由な回答です。\n<script>alert(1)</script>');
await det.getByRole('button', { name: '回答を保存' }).click();
await mg.waitForTimeout(600);
card = await det.locator('.answer').first().innerText();
check('形式違い: 原文のみで保存・表示（HTMLは文字列のまま）', /原文のみ/.test(card) && card.includes('<script>alert(1)</script>'), card.slice(0, 80));
db = await dump();
check('形式違い: 件数2', db.scraps.find((s) => s.id === scrapId)?.aiAnswerCount === 2);

// 一覧: AI要約あり表示、AI要約なしフィルタ、回答本文の検索
await mg.locator('.m-detail').getByRole('button', { name: /閉じる/ }).click();
await mg.waitForTimeout(400);
const row = await mg.locator('.m-main').innerText();
check('一覧: AI要約 2件 と表示', /AI要約 2件/.test(row), row.slice(0, 120));
await mg.getByRole('button', { name: '絞り込み' }).click();
await mg.locator('.filter-pop .filters select').nth(1).selectOption('none');
await mg.waitForTimeout(400);
let main = await mg.locator('.m-main').innerText();
check('絞り込み: AI要約なしに出ない', !main.includes('テスト記事') && main.includes('別の記事'));
await mg.locator('.filter-pop .filters select').nth(1).selectOption('any');
await mg.getByPlaceholder('タイトル・URL・メモ・本文を検索').fill('続きを調べて');
await mg.waitForTimeout(500);
main = await mg.locator('.m-main').innerText();
check('検索: AIの回答の本文で見つかる', main.includes('テスト記事') && !main.includes('別の記事'));
await mg.getByPlaceholder('タイトル・URL・メモ・本文を検索').fill('');

// テンプレート管理: 複製→編集→保存→詳細で選べる
await mg.locator('.m-nav').getByRole('button', { name: 'AIテンプレート' }).click();
await mg.waitForTimeout(300);
await mg.getByRole('button', { name: '複製して編集' }).first().click();
await mg.waitForTimeout(300);
await mg.locator('.tpl-editor input').fill('私の検証');
await mg.locator('.tpl-editor textarea').fill('【自作】{{title}} を検証\n{{format}}\n{{source}}');
await mg.locator('.tpl-editor').getByRole('button', { name: '保存', exact: true }).click();
await mg.waitForTimeout(400);
check('テンプレート: 自作が一覧に出る', (await mg.locator('.templates').innerText()).includes('私の検証'));
await mg.screenshot({ path: path.join(OUT, 'p4-templates.png'), fullPage: true });
await mg.goto(`chrome-extension://${extId}/manager.html#scrap=${scrapId}`);
await mg.reload();
await mg.waitForTimeout(800);
await mg.locator('.m-detail').getByRole('tab', { name: /AI/ }).click();
await mg.locator('.m-detail .ai-ask select').selectOption({ label: '私の検証' });
await mg.locator('.m-detail').getByRole('button', { name: 'プロンプトをコピー' }).click();
await mg.waitForTimeout(300);
clip = await mg.evaluate(() => navigator.clipboard.readText());
check('テンプレート: 自作で生成', clip.startsWith('【自作】テスト記事 を検証') && clip.includes('## 出典URL'), clip.slice(0, 40));

// 回答の削除
await mg.locator('.m-detail .answer').first().getByRole('button', { name: '削除' }).click();
await mg.waitForTimeout(500);
db = await dump();
check('回答の削除: 件数1に戻る', db.scraps.find((s) => s.id === scrapId)?.aiAnswerCount === 1 && db.aiAnswers.length === 1);

// 日本語訳の適用
await mg.locator('.m-detail .ai-ask select').selectOption({ label: '日本語に訳す' });
await mg.locator('.m-detail').getByRole('button', { name: 'プロンプトをコピー' }).click();
clip = await mg.evaluate(() => navigator.clipboard.readText());
check('日本語訳: プロンプトの見出し', clip.includes('## 見出し') && clip.includes('## 日本語訳') && !clip.includes('## 要点'));
await mg.locator('.m-detail .ai-paste textarea').fill('## 日本語タイトル\n**テスト記事の日本語題**\n\n## 日本語訳\nこれは訳文の本文です。');
await mg.locator('.m-detail').getByRole('button', { name: '回答を保存' }).click();
await mg.waitForTimeout(500);
// 保存時に見出し（旧「日本語タイトル」も可）と訳文が自動で反映される。ボタンは再反映用
check('日本語訳: 反映ボタンがある', (await mg.locator('.m-detail .answer').first().getByRole('button', { name: '見出しと訳文を反映' }).count()) === 1);
check('日本語訳: タイトルが日本語に', (await mg.locator('.m-detail .title-input').inputValue()) === 'テスト記事の日本語題');
check('日本語訳: 元のタイトルを表示', (await mg.locator('.m-detail .original-title').innerText()).includes('テスト記事'));
db = await dump();
check('日本語訳: 訳文が断片に追加', db.fragments.some((f) => f.scrapId === scrapId && f.source === 'translation' && f.text === 'これは訳文の本文です。'));
await mg.locator('.m-detail .original-title').getByRole('button', { name: 'タイトルを元に戻す' }).click();
await mg.waitForTimeout(600);
check('日本語訳: 元に戻せる', (await mg.locator('.m-detail .title-input').inputValue()) === 'テスト記事');

// サイドパネルにもAI欄
const sp = await ctx.newPage();
await sp.setViewportSize({ width: 400, height: 900 });
await sp.goto(`chrome-extension://${extId}/sidepanel.html`);
await sp.waitForTimeout(600);
await sp.getByText('テスト記事').first().click();
await sp.waitForTimeout(500);
await sp.getByRole('tab', { name: /AI/ }).click();
await sp.locator('.ai-panel .answer').first().waitFor({ timeout: 5000 }).catch(() => {});
check('サイドパネル: AI欄と回答が出る', (await sp.locator('.ai-panel').count()) === 1 && /構造化済み/.test(await sp.locator('.ai-panel').innerText()));
await sp.screenshot({ path: path.join(OUT, 'p4-sidepanel.png'), fullPage: true });

check('JSエラーなし', errs.length === 0, errs.join(' | '));

await ctx.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
