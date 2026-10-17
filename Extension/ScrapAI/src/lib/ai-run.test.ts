import { describe, expect, it } from 'vitest';
import { AI_SERVICES, getServices } from './ai';
import { callGemini } from './ai-run';

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

describe('AIサービスの設定', () => {
  it('未設定なら標準の3つ。標準が消えていれば補い、自作は残す', () => {
    expect(getServices(null).map((s) => s.id)).toEqual(['chatgpt', 'claude', 'gemini']);
    const custom = { id: 'grok', name: 'Grok', url: 'https://grok.com/', builtIn: false, autoSend: false, closeOnDone: true };
    const list = getServices([custom, { ...AI_SERVICES[0]!, name: 'GPT' }]);
    expect(list.map((s) => s.id)).toEqual(['grok', 'chatgpt', 'claude', 'gemini']);
    expect(list.find((s) => s.id === 'chatgpt')!.name).toBe('GPT');
  });
});
