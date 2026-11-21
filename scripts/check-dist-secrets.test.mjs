import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  scanSecrets,
  checkCSP,
  checkManifest,
  checkServiceWorker,
  parseCspDirectives,
} from './check-dist-secrets.mjs'

const BASE_PATH = '/haunted-walk/'

// Assemble the 40-char leak value at runtime so the test source never
// contains a gitleaks-matchable 40-char base64 shape.
const SECRET_VALUE = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmn'].join('')
const OSM = 'https://tile.openstreetmap.org https://*.tile.openstreetmap.org'

const VALID_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: ${OSM}`,
  `connect-src 'self' ${OSM}`,
  "font-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ')

function htmlWithCsp(csp) {
  return `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body></body></html>`
}

describe('scanSecrets — AWS secret access key (Security F1 / QA 3)', () => {
  it.each([
    [`AWS_SECRET_ACCESS_KEY="${SECRET_VALUE}"`, 'quoted env'],
    [`AWS_SECRET_ACCESS_KEY=${SECRET_VALUE}`, 'unquoted env'],
    [`aws_secret_access_key="${SECRET_VALUE}"`, 'lowercase quoted env'],
    [`aws_secret_access_key: "${SECRET_VALUE}"`, 'YAML quoted'],
    [`aws_secret_access_key: ${SECRET_VALUE}`, 'YAML unquoted'],
    [`{awsSecretAccessKey:"${SECRET_VALUE}"}`, 'minified JS camelCase'],
    [`"aws_secret_access_key": "${SECRET_VALUE}"`, 'pretty JSON'],
    [`"aws_secret_access_key":"${SECRET_VALUE}"`, 'minified JSON'],
    [`AWS_SECRET_ACCESS_KEY='${SECRET_VALUE}'`, 'single-quoted env'],
    [`aws_secret_access_key ${SECRET_VALUE}`, 'space separator'],
    [`aws_secret_access_key${SECRET_VALUE}`, 'no separator'],
  ])('detects %s', (text) => {
    const failures = scanSecrets(text)
    expect(failures.length).toBeGreaterThan(0)
    // Never print the candidate value itself.
    expect(failures.some((f) => f.includes(SECRET_VALUE))).toBe(false)
  })

  it.each([
    [`AWS_SECRET_ACCESS_KEY=`, 'empty value'],
    [`AWS_SECRET_ACCESS_KEY=${SECRET_VALUE.slice(0, 39)}`, '39 chars'],
    [`AWS_SECRET_ACCESS_KEY=${SECRET_VALUE}x`, '41 chars (bounded by lookahead)'],
    [`sha256=${SECRET_VALUE}`, 'sha256 hash has no aws anchor'],
    [`bare ${SECRET_VALUE} hash`, 'bare base64 without aws anchor'],
    ['just some ordinary text', 'clean text'],
  ])('stays silent on %s', (text) => {
    expect(scanSecrets(text)).toEqual([])
  })

  it('is case-insensitive', () => {
    const failures = scanSecrets(`Aws_Secret_Access_Key="${SECRET_VALUE}"`)
    expect(failures.length).toBeGreaterThan(0)
  })

  it('returns multiple failures for multiple leaks', () => {
    const text = `AWS_SECRET_ACCESS_KEY="${SECRET_VALUE}"\naws_secret_access_key="${SECRET_VALUE}"`
    expect(scanSecrets(text).length).toBeGreaterThan(1)
  })
})

describe('parseCspDirectives', () => {
  it('splits a valid CSP into directives and values', () => {
    const directives = parseCspDirectives(VALID_CSP)
    expect(directives.get('img-src')).toEqual([
      "'self'",
      'data:',
      'https://tile.openstreetmap.org',
      'https://*.tile.openstreetmap.org',
    ])
    expect(directives.get('upgrade-insecure-requests')).toEqual([])
  })

  it('flags duplicate directives', () => {
    const directives = parseCspDirectives("script-src 'self'; script-src 'self'")
    const value = directives.get('script-src')
    expect(value && value.__duplicate).toBe(true)
  })
})

describe('checkCSP — exact directive equality (QA 1)', () => {
  it('passes a valid CSP with all 13 directives', () => {
    expect(checkCSP(htmlWithCsp(VALID_CSP))).toEqual([])
  })

  it('fails on img-src superset with an evil origin', () => {
    const csp = VALID_CSP.replace(
      `img-src 'self' data: ${OSM}`,
      `img-src 'self' data: ${OSM} https://evil.example.com`,
    )
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]).toMatch(/CSP img-src is /)
    expect(failures[0]).toMatch(/expected /)
    expect(failures.some((f) => f.includes('https://evil.example.com'))).toBe(true)
  })

  it('fails on connect-src superset with an evil origin', () => {
    const csp = VALID_CSP.replace(
      `connect-src 'self' ${OSM}`,
      `connect-src 'self' ${OSM} https://evil.example.com`,
    )
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]).toMatch(/CSP connect-src is /)
  })

  it('fails when a directive is dropped', () => {
    const csp = VALID_CSP.replace("; script-src 'self'", '')
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.some((f) => f.includes('missing directive script-src'))).toBe(true)
  })

  it('fails on an unknown directive', () => {
    const csp = `${VALID_CSP}; foo-src 'self'`
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.some((f) => f.includes('unknown directive foo-src'))).toBe(true)
  })

  it('fails on a duplicate directive', () => {
    const csp = `${VALID_CSP}; script-src 'self'`
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.some((f) => f.includes('duplicated'))).toBe(true)
  })

  it('fails when a directive value is changed', () => {
    const csp = VALID_CSP.replace("object-src 'none'", "object-src 'self'")
    const failures = checkCSP(htmlWithCsp(csp))
    expect(failures.some((f) => f.includes('CSP object-src is'))).toBe(true)
  })

  it('fails when there is no CSP meta tag', () => {
    const failures = checkCSP('<html><head></head><body></body></html>')
    expect(failures.some((f) => f.includes('no Content-Security-Policy meta tag'))).toBe(
      true,
    )
  })

  it('unescapes HTML entities (&#39;) before matching', () => {
    const escaped = VALID_CSP.replaceAll("'", '&#39;')
    expect(checkCSP(htmlWithCsp(escaped))).toEqual([])
  })
})

describe('checkManifest — deployment contract', () => {
  it('passes a valid manifest', () => {
    expect(
      checkManifest({ id: BASE_PATH, start_url: BASE_PATH, scope: BASE_PATH }),
    ).toEqual([])
  })

  it('fails on manifest id drift', () => {
    const failures = checkManifest({
      id: '/wrong/',
      start_url: BASE_PATH,
      scope: BASE_PATH,
    })
    expect(failures.some((f) => f.includes('manifest id is'))).toBe(true)
  })

  it('fails on manifest start_url drift', () => {
    const failures = checkManifest({
      id: BASE_PATH,
      start_url: '/wrong/',
      scope: BASE_PATH,
    })
    expect(failures.some((f) => f.includes('manifest start_url is'))).toBe(true)
  })

  it('fails on manifest scope drift', () => {
    const failures = checkManifest({
      id: BASE_PATH,
      start_url: BASE_PATH,
      scope: '/wrong/',
    })
    expect(failures.some((f) => f.includes('manifest scope is'))).toBe(true)
  })
})

// Mirrors the shape of a built Workbox sw.js: precache manifest, clientsClaim,
// and the three self-contained runtime-cache matchers.
const SW_WRAP = (body) => `define(["./workbox-x"],function(e){"use strict";${body}})`
const SW_MATCHERS =
  `e.registerRoute(({url:a,sameOrigin:s})=>s&&a.pathname.startsWith("/haunted-walk/tours/")&&(a.pathname.endsWith(".json")||a.pathname.endsWith(".geojson")),new e.NetworkFirst({cacheName:"tour-data"}),"GET"),` +
  `e.registerRoute(({url:a,sameOrigin:s})=>s&&a.pathname.startsWith("/haunted-walk/tours/")&&/\\.(jpg|jpeg|png|webp)$/i.test(a.pathname),new e.CacheFirst({cacheName:"tour-images"}),"GET"),` +
  `e.registerRoute(({url:a})=>"tile.openstreetmap.org"===a.hostname||a.hostname.endsWith(".tile.openstreetmap.org"),new e.CacheFirst({cacheName:"osm-tiles"}),"GET")`
const VALID_SW = SW_WRAP(
  `e.clientsClaim(),e.precacheAndRoute([{url:"index.html",revision:"1"},{url:"tours/nola/tour.json",revision:"1"},{url:"tours/nola/route.geojson",revision:"1"}]),${SW_MATCHERS}`,
)

describe('checkServiceWorker', () => {
  it('passes a valid service worker', () => {
    expect(checkServiceWorker(VALID_SW)).toEqual([])
  })

  it('fails when index.html is not precached', () => {
    const failures = checkServiceWorker(VALID_SW.replace('index.html', 'other.html'))
    expect(failures.some((f) => f.includes('index.html'))).toBe(true)
  })

  it('fails without an OSM tile runtime cache', () => {
    const failures = checkServiceWorker(VALID_SW.replaceAll('osm-tiles', 'tiles'))
    expect(failures.some((f) => f.includes('OpenStreetMap tiles'))).toBe(true)
  })

  it('fails when tours/README.md is precached', () => {
    const failures = checkServiceWorker(
      VALID_SW.replace('}])', '},{url:"tours/README.md",revision:"1"}])'),
    )
    expect(failures.some((f) => f.includes('tours/README.md'))).toBe(true)
  })

  it('fails on duplicate precache URLs', () => {
    const failures = checkServiceWorker(
      VALID_SW.replace('}])', '},{url:"index.html",revision:"2"}])'),
    )
    expect(failures.some((f) => f.includes('duplicate URLs'))).toBe(true)
  })

  it('fails when the service worker does not claim clients', () => {
    const failures = checkServiceWorker(VALID_SW.replace('e.clientsClaim(),', ''))
    expect(failures.some((f) => f.includes('claim clients'))).toBe(true)
  })

  it("fails when the default city's tour data is not precached", () => {
    const failures = checkServiceWorker(
      VALID_SW.replace(',{url:"tours/nola/route.geojson",revision:"1"}', ''),
    )
    expect(failures.some((f) => f.includes('route.geojson'))).toBe(true)
  })

  it('fails on a cross-origin precache URL', () => {
    const failures = checkServiceWorker(
      VALID_SW.replace('}])', '},{url:"https://evil.example.com/a.js",revision:"1"}])'),
    )
    expect(failures.some((f) => f.includes('cross-origin'))).toBe(true)
  })

  it('fails when a runtime-cache matcher references outer scope', () => {
    const failures = checkServiceWorker(
      VALID_SW.replaceAll('"/haunted-walk/tours/"', 'BASE_PATH+"tours/"'),
    )
    expect(failures.some((f) => f.includes('BASE_PATH is not defined'))).toBe(true)
  })
})

describe('check:dist CLI end-to-end', () => {
  const SCRIPT = resolve(__dirname, 'check-dist-secrets.mjs')

  function runWithDist(files) {
    const dir = mkdtempSync(join(tmpdir(), 'check-dist-'))
    mkdirSync(join(dir, 'dist'), { recursive: true })
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, 'dist', name), content)
    }
    let result
    try {
      result = execFileSync(process.execPath, [SCRIPT], {
        cwd: dir,
        encoding: 'utf8',
      })
    } catch (err) {
      result = err.stdout ? err.stdout : err.message
    }
    return { dir, output: result }
  }

  it('exits 0 on a clean dist', () => {
    const csp = `<meta http-equiv="Content-Security-Policy" content="${VALID_CSP}">`
    const { dir, output } = runWithDist({
      'index.html': `<html><head>${csp}<link rel="stylesheet" href="${BASE_PATH}assets/index.css"></head><body></body></html>`,
      'manifest.webmanifest': JSON.stringify({
        id: BASE_PATH,
        start_url: BASE_PATH,
        scope: BASE_PATH,
      }),
      'sw.js': VALID_SW,
    })
    rmSync(dir, { recursive: true, force: true })
    expect(output).toContain('check-dist: OK')
  })

  it('exits 1 and prints a named failure for a planted AWS leak', () => {
    const { dir, output } = runWithDist({
      'index.html': `<html><body>AWS_SECRET_ACCESS_KEY="${SECRET_VALUE}"</body></html>`,
    })
    rmSync(dir, { recursive: true, force: true })
    expect(output).toContain('FAIL:')
    expect(output).toContain('AWS secret access key')
    expect(output).not.toContain(SECRET_VALUE)
    expect(output).toContain('problem(s) found')
  })

  it('exits 1 and prints a named failure for a CSP img-src superset', () => {
    const badCsp = VALID_CSP.replace(
      `img-src 'self' data: ${OSM}`,
      `img-src 'self' data: ${OSM} https://evil.example.com`,
    )
    const { dir, output } = runWithDist({
      'index.html': `<html><head><meta http-equiv="Content-Security-Policy" content="${badCsp}"><link rel="stylesheet" href="${BASE_PATH}assets/index.css"></head><body></body></html>`,
      'manifest.webmanifest': JSON.stringify({
        id: BASE_PATH,
        start_url: BASE_PATH,
        scope: BASE_PATH,
      }),
      'sw.js': VALID_SW,
    })
    rmSync(dir, { recursive: true, force: true })
    expect(output).toContain('FAIL:')
    expect(output).toContain('CSP img-src is')
    expect(output).toContain('https://evil.example.com')
  })
})
