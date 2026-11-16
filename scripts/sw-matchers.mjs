/**
 * Executes the runtime-caching matchers of a BUILT service worker in Node.
 *
 * Workbox serializes function `urlPattern`s into sw.js via toString(), so a
 * matcher that references anything from vite.config.ts scope (e.g. BASE_PATH)
 * throws ReferenceError inside the service worker, where it is never seen by
 * typecheck, lint, tests or a string-match on sw.js.
 */

import vm from 'node:vm'

const ORIGIN = 'https://fat-git.github.io'
const BASE = '/haunted-walk/'

// [description, url, cache expected to claim it (or null for no runtime cache)]
export const MATCHER_CASES = [
  ['city tour.json', `${ORIGIN}${BASE}tours/second-city/tour.json`, 'tour-data'],
  ['city route.geojson', `${ORIGIN}${BASE}tours/second-city/route.geojson`, 'tour-data'],
  ['tour index.json', `${ORIGIN}${BASE}tours/index.json`, 'tour-data'],
  [
    'stop image (jpg)',
    `${ORIGIN}${BASE}tours/second-city/images/stop-1.jpg`,
    'tour-images',
  ],
  [
    'stop image (webp)',
    `${ORIGIN}${BASE}tours/second-city/images/stop-1.webp`,
    'tour-images',
  ],
  ['OSM tile', 'https://a.tile.openstreetmap.org/16/12/34.png', 'osm-tiles'],
  ['cross-origin tour.json', `https://example.com${BASE}tours/x/tour.json`, null],
  ['cross-origin image', `https://example.com${BASE}tours/x/a.jpg`, null],
  ['app asset', `${ORIGIN}${BASE}assets/index-abc.js`, null],
  ['path outside base', `${ORIGIN}/other/tours/x/tour.json`, null],
]

/** Run sw.js in a sandbox with a recording Workbox stub; return its runtime routes. */
export function loadRuntimeRoutes(swSource) {
  const routes = []
  const make = (name) =>
    function Stub(opts) {
      this.kind = name
      this.cacheName = opts && opts.cacheName
    }
  const workbox = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === 'registerRoute') {
          return (matcher, strategy) => {
            routes.push({ matcher, cacheName: strategy && strategy.cacheName })
          }
        }
        return make(String(name))
      },
    },
  )
  const sandbox = {
    define: (_deps, factory) => factory(workbox),
    importScripts: () => {},
    self: {
      location: { origin: ORIGIN },
      addEventListener: () => {},
      skipWaiting: () => {},
    },
  }
  vm.runInNewContext(swSource, sandbox, { filename: 'sw.js' })
  return routes.filter((r) => typeof r.matcher === 'function')
}

/** Returns a list of human-readable failures (empty when the matchers are sound). */
export function checkMatchers(swSource) {
  const problems = []
  let routes
  try {
    routes = loadRuntimeRoutes(swSource)
  } catch (error) {
    return [`sw.js could not be evaluated in Node: ${error.message}`]
  }
  for (const cacheName of ['tour-data', 'tour-images', 'osm-tiles']) {
    if (!routes.some((r) => r.cacheName === cacheName)) {
      problems.push(`sw.js registers no function matcher for the ${cacheName} cache`)
    }
  }
  for (const [label, href, expected] of MATCHER_CASES) {
    const url = new URL(href)
    const sameOrigin = url.origin === ORIGIN
    const claimed = []
    for (const route of routes) {
      let matched
      try {
        matched = route.matcher({
          url,
          sameOrigin,
          request: { url: href, method: 'GET' },
        })
      } catch (error) {
        problems.push(
          `${route.cacheName} matcher threw on ${label} (${href}): ${error.name}: ${error.message}`,
        )
        continue
      }
      if (matched) claimed.push(route.cacheName)
    }
    if (expected === null && claimed.length > 0) {
      problems.push(
        `${label} must not be runtime-cached but matched: ${claimed.join(', ')}`,
      )
    } else if (expected !== null && !claimed.includes(expected)) {
      problems.push(`${label} (${href}) was not matched by the ${expected} cache`)
    } else if (expected !== null && claimed.length > 1) {
      problems.push(`${label} matched multiple caches: ${claimed.join(', ')}`)
    }
  }
  return problems
}
