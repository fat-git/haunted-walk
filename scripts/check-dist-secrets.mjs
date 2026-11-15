#!/usr/bin/env node
/**
 * Post-build guard for the static bundle. Run in CI after `npm run build`.
 *
 * Two jobs:
 *  1. Fail on key-shaped strings. The app has no keys by design, so anything
 *     key-shaped in `dist/` is either a leak or a bug.
 *  2. Fail if the deployment contract broke: the CSP must ship, and the
 *     manifest must keep the `/haunted-walk/` id, start_url and scope.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const BASE_PATH = '/haunted-walk/'

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  // AWS secret access keys are 40 base64-ish chars; the context anchor keeps
  // base64 hashes in the bundle from matching.
  ['AWS secret access key', /\baws(?:[\w.-]{0,20})['"][A-Za-z0-9/+]{40}['"]/gi],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g],
  ['Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/g],
  ['OpenAI/OpenRouter key', /\bsk-(?:or-)?[A-Za-z0-9_-]{20,}/g],
  ['Stripe secret key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  // Token smuggled into a URL query string, e.g. ?access_token=... or
  // ?token=... . A bare `token=` match in plain text would be noisy, so
  // require a URL-shaped value.
  ['token in URL', /\b[a-z0-9_-]{0,20}token=[A-Za-z0-9._%~+-]{16,}/gi],
]

// Markdown docs and extensionless files (e.g. LICENSE, README without a
// suffix) ship in the repo and are easy to overlook; scan them too.
const TEXT_EXTENSIONS = /\.(?:html|js|mjs|css|json|webmanifest|svg|txt|map|md)$/i

const failures = []

function fail(message) {
  failures.push(message)
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

function isTextFile(file) {
  if (TEXT_EXTENSIONS.test(file)) return true
  // Extensionless file (e.g. `LICENSE`, `CNAME`).
  return !/\.[A-Za-z0-9]+$/.test(file)
}

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST}/ does not exist; run \`npm run build\` first.`)
  process.exit(1)
}

const files = walk(DIST)

for (const file of files) {
  if (!isTextFile(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const [label, pattern] of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      // Never print the candidate value itself.
      console.error(
        `check-dist: ${label} found in ${relative(DIST, file)} (${match[0].length} chars)`,
      )
      fail(`${label} in ${relative(DIST, file)}`)
    }
  }
}

const indexHtml = join(DIST, 'index.html')
if (!existsSync(indexHtml)) {
  fail('dist/index.html is missing')
} else {
  // Vite escapes quotes in the injected attribute, e.g. &#39;self&#39;.
  const html = readFileSync(indexHtml, 'utf8').replaceAll('&#39;', "'")
  if (!html.includes('http-equiv="Content-Security-Policy"')) {
    fail('dist/index.html has no Content-Security-Policy meta tag')
  }
  if (!html.includes("script-src 'self'")) {
    fail("CSP is missing script-src 'self'")
  }
  if (!html.includes("default-src 'self'")) {
    fail("CSP is missing default-src 'self'")
  }
  if (!html.includes("style-src 'self'")) {
    fail("CSP is missing style-src 'self'")
  }
  if (html.includes("'unsafe-eval'")) {
    fail("CSP allows 'unsafe-eval'")
  }
  if (html.includes("'unsafe-inline'")) {
    fail("CSP allows 'unsafe-inline'")
  }
  if (!html.includes("object-src 'none'")) {
    fail("CSP is missing object-src 'none'")
  }
  if (!html.includes("base-uri 'self'")) {
    fail("CSP is missing base-uri 'self'")
  }
  if (!html.includes("form-action 'none'")) {
    fail("CSP is missing form-action 'none'")
  }
  // The only network origins the app may talk to are itself and OSM tiles.
  const OSM_TILE_ORIGINS =
    'https://tile.openstreetmap.org https://*.tile.openstreetmap.org'
  if (!html.includes(`connect-src 'self' ${OSM_TILE_ORIGINS}`)) {
    fail("CSP connect-src must be 'self' plus OSM tile origins only")
  }
  if (!html.includes(`img-src 'self' data: ${OSM_TILE_ORIGINS}`)) {
    fail("CSP img-src must be 'self', data:, and OSM tile origins only")
  }
  if (!html.includes('tile.openstreetmap.org')) {
    fail('CSP does not allow OpenStreetMap tiles')
  }
  if (!html.includes(`${BASE_PATH}assets/`)) {
    fail(`dist/index.html does not reference assets from ${BASE_PATH}`)
  }
}

const manifestPath = join(DIST, 'manifest.webmanifest')
if (!existsSync(manifestPath)) {
  fail('dist/manifest.webmanifest is missing')
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.id !== BASE_PATH) {
    fail(`manifest id is ${JSON.stringify(manifest.id)}, expected ${BASE_PATH}`)
  }
  if (manifest.start_url !== BASE_PATH) {
    fail(
      `manifest start_url is ${JSON.stringify(manifest.start_url)}, expected ${BASE_PATH}`,
    )
  }
  if (manifest.scope !== BASE_PATH) {
    fail(`manifest scope is ${JSON.stringify(manifest.scope)}, expected ${BASE_PATH}`)
  }
}

const serviceWorker = join(DIST, 'sw.js')
if (!existsSync(serviceWorker)) {
  fail('dist/sw.js is missing')
} else {
  const sw = readFileSync(serviceWorker, 'utf8')
  if (!sw.includes('index.html')) {
    fail('service worker precache does not include index.html')
  }
  if (!sw.includes('osm-tiles')) {
    fail('service worker has no runtime cache for OpenStreetMap tiles')
  }
  if (sw.includes('tours/README.md')) {
    fail('service worker precache must not include tours/README.md')
  }
  // Duplicate precache entries waste the first-load cache and can break
  // `precacheAndRoute` bookkeeping. The glob patterns in vite.config.ts must
  // stay disjoint from the plugin's automatic manifest/icon entries.
  const precacheUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
  const duplicates = precacheUrls.filter((url, i) => precacheUrls.indexOf(url) !== i)
  if (duplicates.length > 0) {
    fail(
      `service worker precache has duplicate URLs: ${[...new Set(duplicates)].join(', ')}`,
    )
  }
}

if (failures.length > 0) {
  console.error(`\ncheck-dist: ${failures.length} problem(s) found.`)
  process.exit(1)
}

console.log(`check-dist: OK (${files.length} files scanned)`)
