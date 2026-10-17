import { describe, expect, it } from 'vitest';
import { AI_SERVICES, getServices } from './ai';
import { callGemini, geminiKeyLooksWrong, listGeminiModels } from './ai-run';

const reply = (body: unknown, ok = true, status = 200) => (async () => ({ ok, status, json: async () => body }) as Response) as unknown as typeof fetch;

describe('Gemini API', () => {
  it('回答の文章を取り出す。キーはヘッダーで送り、URLには入れない', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '## Headline\n' }, { text: 'こんにちは' }] } }] }) } as Response;
    }) as unknown as typeof fetch;
    expect(await callGemini('p', 'gemini-2.5-flash', 'KEY123', f)).toBe('## Headline\nこんにちは');
    expect(seen!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(seen!.url).not.toContain('KEY123');
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY123');
    expect(JSON.parse(seen!.init.body as string).contents[0].parts[0].text).toBe('p');
  });

  it('失敗はステータスだけを伝え、キーは含めない。空の回答も失敗', async () => {
    await expect(callGemini('p', 'm', 'SECRET', reply({}, false, 429))).rejects.toThrow('HTTP 429');
    await expect(callGemini('p', 'm', 'SECRET', reply({ candidates: [] }))).rejects.toThrow('empty');
    await expect(callGemini('p', 'm', 'SECRET', reply({ error: { message: 'API key not valid' } }, false, 400))).rejects.toThrow('HTTP 400: API key not valid');
    await callGemini('p', 'm', 'SECRET', reply({}, false, 400)).catch((e: Error) => expect(e.message).not.toContain('SECRET'));
  });
});

describe('Gemini モデル一覧', () => {
  it('generateContent に対応したものだけ、models/ を除いて返す', async () => {
    const body = { models: [{ name: 'models/gemini-3.8', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed-1', supportedGenerationMethods: ['embedContent'] }] };
    expect(await listGeminiModels(' K ', reply(body))).toEqual(['gemini-3.8']);
    await expect(listGeminiModels('K', reply({}, false, 403))).rejects.toThrow('HTTP 403');
  });
});

describe('Gemini APIキーの形', () => {
  it('空白・改行を含む、または極端に短いものだけ疑う', () => {
    expect(geminiKeyLooksWrong('')).toBe(false);
    expect(geminiKeyLooksWrong('AIzaSyA_abcdefghijklmnopqrstuvwxyz0123')).toBe(false);
    expect(geminiKeyLooksWrong('AQ.Ab8RN6JbtpVGyspKjwTRDxC4m_7teLvUZ')).toBe(false);
    expect(geminiKeyLooksWrong('AIza abc def ghijklmnopqrstuvwxyz')).toBe(true);
    expect(geminiKeyLooksWrong('abc')).toBe(true);
  });
  it('ヘッダーで拒否されたらURL指定で1回やり直す', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return urls.length === 1
        ? ({ ok: false, status: 401, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) } as Response);
    }) as unknown as typeof fetch;
    expect(await callGemini('p', 'm', ' K1 ', f)).toBe('ok');
    expect(urls[1]).toContain('?key=K1');
  });
});

describe('AIサービスの設定', () => {
  it('未設定なら標準のもの。標準が消えていれば補い、自作は標準の後ろに残す', () => {
    expect(getServices(null).map((s) => s.id)).toEqual(['chatgpt', 'claude', 'gemini', 'grok', 'perplexity']);
    const custom = { id: 'custom-1', name: 'X', url: 'https://x.example/', builtIn: false, autoSend: false, closeOnDone: true };
    const list = getServices([custom, { ...AI_SERVICES[0]!, name: 'GPT' }]);
    expect(list.map((s) => s.id)).toEqual(['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'custom-1']);
    expect(list.find((s) => s.id === 'chatgpt')!.name).toBe('GPT');
  });
});
