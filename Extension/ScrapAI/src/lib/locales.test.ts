import { describe, expect, it } from 'vitest';
import en from '../public/_locales/en/messages.json';
import ja from '../public/_locales/ja/messages.json';

// Chromeはキーに A-Z a-z 0-9 _ @ 以外（例: ハイフン）があると拡張機能の読み込みに失敗する
describe('locales', () => {
  it('キーがChrome仕様に合い、ja/enが揃っている', () => {
    for (const d of [ja, en]) for (const k of Object.keys(d)) expect(k).toMatch(/^[A-Za-z0-9_@]+$/);
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });
});
