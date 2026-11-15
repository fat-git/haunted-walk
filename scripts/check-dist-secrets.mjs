#!/usr/bin/env node
/**
 * Post-build guard for the static bundle. Run in CI after `npm run build`.
 *
 * Two jobs:
 *  1. Fail on key-shaped strings. The app has no keys by design, so anything
 *     key-shaped in `dist/` is either a leak or a bug.
 *  2. Fail if the deployment contract broke: the CSP must ship, and the
 *     manifest must keep the `/haunted-walk/` start_url and scope.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const BASE_PATH = '/haunted-walk/'

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/g],
  ['OpenAI/OpenRouter key', /\bsk-(?:or-)?[A-Za-z0-9_-]{20,}/g],
  ['Stripe secret key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
]

const TEXT_EXTENSIONS = /\.(?:html|js|mjs|css|json|webmanifest|svg|txt|map)$/i

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

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST}/ does not exist; run \`npm run build\` first.`)
  process.exit(1)
}

const files = walk(DIST)

for (const file of files) {
  if (!TEXT_EXTENSIONS.test(file)) continue
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
  if (html.includes("'unsafe-eval'")) {
    fail("CSP allows 'unsafe-eval'")
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
}

if (failures.length > 0) {
  console.error(`\ncheck-dist: ${failures.length} problem(s) found.`)
  process.exit(1)
}

console.log(`check-dist: OK (${files.length} files scanned)`)
