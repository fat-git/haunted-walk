import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages serves this project repo from a subpath. The Vite `base`, the
 * generated service-worker scope, the manifest `start_url` and every in-app URL
 * must all agree on this exact value, or the installed PWA 404s on reload.
 */
const BASE_PATH = '/haunted-walk/'

/**
 * The first city in the shipped registry is the pilot/default city. Its
 * tour.json and route.geojson are precached so the pilot works offline right
 * after the first install; other cities are cached lazily at runtime.
 */
const OSM_TILE_ORIGINS = 'https://tile.openstreetmap.org https://*.tile.openstreetmap.org'

/**
 * The production CSP. It is injected at build time rather than written in
 * index.html because Vite's dev server and React Fast Refresh use inline
 * scripts that a strict `script-src 'self'` would block. Production output,
 * which is what GitHub Pages serves, never contains those inline scripts.
 * Leaflet and React both set styles through the DOM API or a stylesheet
 * file, so no `style-src 'unsafe-inline'` is needed; scripts/check-dist-secrets.mjs
 * fails the build if 'unsafe-inline' sneaks back in.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: ${OSM_TILE_ORIGINS}`,
  `connect-src 'self' ${OSM_TILE_ORIGINS}`,
  "font-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ')

function cspMetaPlugin(): Plugin {
  return {
    name: 'haunted-walk:csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    cspMetaPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is explicit in src/main.tsx so the scope is obvious and
      // testable. The plugin still generates sw.js and manifest.webmanifest.
      injectRegister: false,
      includeManifestIcons: false,
      // The manifest icons are precached by the globPatterns below, so
      // `includeManifestIcons` must be false or the plugin would inject them
      // a second time. `includeAssets` stays unset for the same reason, and
      // the generated manifest.webmanifest is added to precache by the plugin.
      manifest: {
        id: BASE_PATH,
        name: 'Haunted Walk',
        short_name: 'Haunted Walk',
        description:
          'Mobile-first self-guided ghost tour: GPS route, walking directions, and narration that starts at each stop.',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell plus the tiny city registry (index.json).
        // Per-city tour.json/route.geojson are deliberately NOT eagerly
        // precached: that would download every registered city on the first
        // visit and bloat it as cities are added. Instead they are cached on
        // demand below, so a city the walker has opened still loads offline
        // without growing the first visit (see docs/ADD_A_CITY.md).
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff2,webmanifest}',
          'tours/index.json',
        ],
        navigateFallback: `${BASE_PATH}index.html`,
        navigateFallbackAllowlist: [/^\/haunted-walk\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Per-city tour data: fetched from the network the first time a
            // city is opened, then served from cache so that city loads
            // offline afterwards. Only opened cities are ever stored.
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.includes('/tours/') &&
              (url.pathname.endsWith('.json') || url.pathname.endsWith('.geojson')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tour-data',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OSM tiles are cached only after the user actually views them.
            // Never precache or bulk-prefetch tiles: the OSM tile usage policy
            // forbids bulk downloading, and it would also be expensive on a
            // walker's data plan.
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === 'tile.openstreetmap.org' ||
              url.hostname.endsWith('.tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
  },
})
