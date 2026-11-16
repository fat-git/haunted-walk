import { readFileSync } from 'node:fs'
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
const DEFAULT_CITY_ID: string = JSON.parse(
  readFileSync(new URL('./public/tours/index.json', import.meta.url), 'utf8'),
).cities[0].id

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
        // Precache the app shell, the tiny city registry (index.json) and the
        // default (first) city's tour.json + route.geojson so the pilot city
        // works offline right after install. Other cities' tour data is NOT
        // eagerly precached: that would download every registered city on the
        // first visit and bloat it as cities are added. They are cached on
        // demand below (see docs/ADD_A_CITY.md).
        // `clientsClaim` lets the first service worker take control of the
        // already-open page, so even the first session's fetches are cached.
        // `webmanifest` is deliberately absent: the plugin adds the generated
        // manifest.webmanifest to precache itself (above), and a glob match
        // here would duplicate it.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff2}',
          'tours/index.json',
          `tours/${DEFAULT_CITY_ID}/tour.json`,
          `tours/${DEFAULT_CITY_ID}/route.geojson`,
        ],
        clientsClaim: true,
        // Tour images under /tours/ are intentionally not precached (keeps the
        // app shell modest). They are runtime-cached below so the tour still
        // shows them offline. The manifest icons live in public/ and are
        // matched by the glob above.
        globIgnores: ['**/tours/**/*.{jpg,jpeg,png,webp}'],
        navigateFallback: `${BASE_PATH}index.html`,
        navigateFallbackAllowlist: [/^\/haunted-walk\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Per-city tour data for cities beyond the precached default:
            // NetworkFirst so a returning walker gets redeployed narration and
            // routes, falling back to the cached copy when offline or slow.
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin &&
              url.pathname.startsWith(`${BASE_PATH}tours/`) &&
              (url.pathname.endsWith('.json') || url.pathname.endsWith('.geojson')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tour-data',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Tour stop images are same-origin static files. Cache them on
            // demand so an in-progress tour keeps showing them offline.
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin &&
              url.pathname.startsWith(`${BASE_PATH}tours/`) &&
              /\.(jpg|jpeg|png|webp)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tour-images',
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
