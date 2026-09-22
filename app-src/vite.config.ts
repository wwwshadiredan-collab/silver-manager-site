import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg','silver-logo.svg'],
      manifest: {
        name: 'Silver Manager',
        short_name: 'Silver Manager',
        description: 'نظام محاسبة وإدارة احترافي للفضة',
        theme_color: '#111827',
        background_color: '#f4f6f8',
        display: 'standalone',
        start_url: './',
        scope: './',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: { cacheName: 'silver-manager-images', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          }
        ]
      }
    })
  ]
})
