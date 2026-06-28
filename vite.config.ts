import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages はサブパス配信（https://<user>.github.io/kumikan/）。
// base を合わせないと本番でアセットが 404 になる。PWA の scope/start_url も
// この base を継承する。
const BASE = '/kumikan/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'クミカン - 組み漢字パズル',
        short_name: 'クミカン',
        description: '漢字パーツを合体させて遊ぶ、家族向けローカル P2P パズル。',
        lang: 'ja',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f2ed',
        theme_color: '#1f6f5b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 完全ローカル動作: ビルド済みアセットを全てプリキャッシュしてオフライン起動可能に。
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
});
