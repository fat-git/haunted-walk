#!/usr/bin/env node
/**
 * Post-build guard for the static bundle. Run in CI after `npm run build`.
 *
 * Two jobs:
 *  1. Fail on key-shaped strings. The app has no keys by design, so anything
 *     key-shaped in `dist/` is either a leak or a bug.
 *  2. Fail if the deployment contract broke: the CSP must ship exactly as
 *     declared in vite.config.ts, and the manifest must keep the
 *     `/haunted-walk/` id, start_url and scope.
 *
 * The checks are exported as pure functions so they can be unit-tested without
 * spawning a process. The CLI entry point runs only when this file is invoked
 * directly.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST = 'dist'
const BASE_PATH = '/haunted-walk/'

// The production CSP contract, mirrored from vite.config.ts. check:dist fails
// if dist/index.html ships any directive whose value differs from this.
const CSP_CONTRACT = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src':
    "'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  'connect-src': "'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  'font-src': "'self' data:",
  'media-src': "'self'",
  'worker-src': "'self'",
  'manifest-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'none'",
  'upgrade-insecure-requests': '',
}

// AWS secret access keys are 40 base64-ish chars. The keyword anchor (`aws`)
// keeps bare base64 hashes in the bundle from matching; the separator segment
// lets the pattern cross `=`, `:`, space and wrapping quotes that real leak
// shapes use (env files, JSON, YAML, minified JS).
const AWS_SECRET_PATTERN =
  /\baws[\w.-]{0,20}['":=\s]{0,3}["']?[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/gi

const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['AWS secret access key', AWS_SECRET_PATTERN],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g],
  ['Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/g],
  ['OpenAI/OpenRouter key', /\bsk-(?:or-)?[A-Za-z0-9_-]{20,}/g],
  ['Stripe secret key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['token in URL', /\b[a-z0-9_-]{0,20}token=[A-Za-z0-9._%~+-]{16,}/gi],
]

// Markdown docs and extensionless files (e.g. LICENSE, README without a
// suffix) ship in the repo and are easy to overlook; scan them too.
const TEXT_EXTENSIONS = /\.(?:html|js|mjs|css|json|webmanifest|svg|txt|map|md)$/i

/**
 * Scan a single block of text for secret patterns. Returns failure messages
 * (never the matched value itself).
 */
export function scanSecrets(text) {
  const failures = []
  for (const [label, pattern] of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      failures.push(`${label} found (${match[0].length} chars)`)
    }
  }
  return failures
}

/**
 * Parse a CSP header string into a map of directive name -> array of values.
 * Duplicate directives are flagged with a __duplicate marker.
 */
export function parseCspDirectives(cspString) {
  const directives = new Map()
  for (const raw of cspString.split(';')) {
    const directive = raw.trim()
    if (!directive) continue
    const parts = directive.split(/\s+/)
    const name = parts[0]
    if (!name) continue
    const values = parts.slice(1)
    if (directives.has(name)) {
      directives.set(name, { __duplicate: true, values })
    } else {
      directives.set(name, values)
    }
  }
  return directives
}

/**
 * Check the CSP in an HTML string against CSP_CONTRACT. Returns failure
 * messages.
 */
export function checkCSP(html) {
  const failures = []
  // Vite escapes quotes in the injected attribute, e.g. &#39;self&#39;.
  const unescaped = html.replaceAll('&#39;', "'")
  const match = unescaped.match(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content="([^"]+)"/i,
  )
  if (!match) {
    failures.push('dist/index.html has no Content-Security-Policy meta tag')
    return failures
  }
  const csp = match[1]
  const actual = parseCspDirectives(csp)

  // Unknown / extra directives.
  for (const [name] of actual) {
    if (!(name in CSP_CONTRACT)) {
      failures.push(`CSP has unknown directive ${name}`)
    }
  }

  // Duplicate directives.
  for (const [name, value] of actual) {
    if (value && value.__duplicate) {
      failures.push(`CSP directive ${name} is duplicated`)
    }
  }

  // Every contract directive must be present with an exact value.
  for (const [name, expectedValue] of Object.entries(CSP_CONTRACT)) {
    if (!actual.has(name)) {
      failures.push(`CSP is missing directive ${name}`)
      continue
    }
    const actualValue = actual.get(name)
    if (actualValue && actualValue.__duplicate) continue // already reported
    const actualStr = actualValue.join(' ')
    if (actualStr !== expectedValue) {
      failures.push(`CSP ${name} is "${actualStr}", expected "${expectedValue}"`)
    }
  }

  return failures
}

/**
 * Check the manifest object against the deployment contract. Returns failure
 * messages.
 */
export function checkManifest(manifest) {
  const failures = []
  if (manifest.id !== BASE_PATH) {
    failures.push(`manifest id is ${JSON.stringify(manifest.id)}, expected ${BASE_PATH}`)
  }
  if (manifest.start_url !== BASE_PATH) {
    failures.push(
      `manifest start_url is ${JSON.stringify(
        manifest.start_url,
      )}, expected ${BASE_PATH}`,
    )
  }
  if (manifest.scope !== BASE_PATH) {
    failures.push(
      `manifest scope is ${JSON.stringify(manifest.scope)}, expected ${BASE_PATH}`,
    )
  }
  return failures
}

/**
 * Check the service worker source for required/forbidden content. Returns
 * failure messages.
 */
export function checkServiceWorker(sw) {
  const failures = []
  if (!sw.includes('index.html')) {
    failures.push('service worker precache does not include index.html')
  }
  if (!sw.includes('osm-tiles')) {
    failures.push('service worker has no runtime cache for OpenStreetMap tiles')
  }
  if (sw.includes('tours/README.md')) {
    failures.push('service worker precache must not include tours/README.md')
  }
  const precacheUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
  const duplicates = precacheUrls.filter((url, i) => precacheUrls.indexOf(url) !== i)
  if (duplicates.length > 0) {
    failures.push(
      `service worker precache has duplicate URLs: ${[...new Set(duplicates)].join(', ')}`,
    )
  }
  return failures
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

function main() {
  if (!existsSync(DIST)) {
    console.error(`check-dist: ${DIST}/ does not exist; run \`npm run build\` first.`)
    process.exit(1)
  }

  const files = walk(DIST)
  const failures = []

  for (const file of files) {
    if (!isTextFile(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const message of scanSecrets(text)) {
      failures.push(`check-dist: ${message} in ${relative(DIST, file)}`)
    }
  }

  const indexHtml = join(DIST, 'index.html')
  if (!existsSync(indexHtml)) {
    failures.push('check-dist: dist/index.html is missing')
  } else {
    const html = readFileSync(indexHtml, 'utf8')
    if (!html.includes(`${BASE_PATH}assets/`)) {
      failures.push(
        `check-dist: dist/index.html does not reference assets from ${BASE_PATH}`,
      )
    }
    for (const message of checkCSP(html)) {
      failures.push(`check-dist: ${message}`)
    }
  }

  const manifestPath = join(DIST, 'manifest.webmanifest')
  if (!existsSync(manifestPath)) {
    failures.push('check-dist: dist/manifest.webmanifest is missing')
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const message of checkManifest(manifest)) {
      failures.push(`check-dist: ${message}`)
    }
  }

  const serviceWorker = join(DIST, 'sw.js')
  if (!existsSync(serviceWorker)) {
    failures.push('check-dist: dist/sw.js is missing')
  } else {
    const sw = readFileSync(serviceWorker, 'utf8')
    for (const message of checkServiceWorker(sw)) {
      failures.push(`check-dist: ${message}`)
    }
  }

  if (failures.length > 0) {
    for (const message of failures) {
      console.error(`FAIL: ${message}`)
    }
    console.error(`\ncheck-dist: ${failures.length} problem(s) found.`)
    process.exit(1)
  }

  console.log(`check-dist: OK (${files.length} files scanned)`)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
