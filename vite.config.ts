import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      // Disable PWA service worker completely in development
      devOptions: {
        enabled: false,
      },
      selfDestroying: true, // Force-unregister any stale service workers
      manifest: {
        name: '3D Builder • Lego-style',
        short_name: 'Lego Builder',
        description: 'Keyboard-primary 3D Lego builder with Blocky AI agent. Build with tools, snap pieces, infinite floor.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f0e9d9',
        theme_color: '#facc15',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Reasonable defaults for a 3D interactive app
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    })
  ]
})
