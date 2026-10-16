import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  outDir: 'dist',
  // ビルド成果物は dist/chrome-mv3 に出力される
  vite: () => ({ plugins: [preact()] }),
  hooks: {
    // 実行時注入のコンテンツスクリプトの matches から host_permissions が自動追加されるため除去する。
    // 注入は activeTab（ユーザー操作時の現在タブのみ）で行う。
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '1.0.5',
    // 仕様書2章の権限表に従う。host_permissions は宣言しない。
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'sidePanel'],
  },
});
