import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkMatchers } from './sw-matchers.mjs'

const wrap = (body) => `define(["./workbox-x"],function(e){"use strict";${body}})`

const GOOD = wrap(
  `e.registerRoute(({url:a,sameOrigin:s})=>s&&a.pathname.startsWith("/haunted-walk/tours/")&&(a.pathname.endsWith(".json")||a.pathname.endsWith(".geojson")),new e.NetworkFirst({cacheName:"tour-data"}),"GET"),` +
    `e.registerRoute(({url:a,sameOrigin:s})=>s&&a.pathname.startsWith("/haunted-walk/tours/")&&/\\.(jpg|jpeg|png|webp)$/i.test(a.pathname),new e.CacheFirst({cacheName:"tour-images"}),"GET"),` +
    `e.registerRoute(({url:a})=>"tile.openstreetmap.org"===a.hostname||a.hostname.endsWith(".tile.openstreetmap.org"),new e.CacheFirst({cacheName:"osm-tiles"}),"GET")`,
)

describe('checkMatchers', () => {
  it('accepts self-contained matchers', () => {
    expect(checkMatchers(GOOD)).toEqual([])
  })

  it('catches an outer-scope reference (the BASE_PATH regression)', () => {
    const bad = GOOD.replaceAll('"/haunted-walk/tours/"', 'BASE_PATH+"tours/"')
    const problems = checkMatchers(bad)
    expect(problems.some((p) => p.includes('BASE_PATH is not defined'))).toBe(true)
  })

  it('catches a matcher that is too broad', () => {
    const bad = GOOD.replaceAll('s&&a.pathname.startsWith', 'a.pathname.startsWith')
    expect(checkMatchers(bad).some((p) => p.includes('cross-origin'))).toBe(true)
  })

  it('catches a missing cache rule', () => {
    const bad = wrap('')
    expect(checkMatchers(bad).length).toBeGreaterThan(0)
  })

  it.skipIf(!existsSync('dist/sw.js'))('passes on the built dist/sw.js', () => {
    expect(checkMatchers(readFileSync('dist/sw.js', 'utf8'))).toEqual([])
  })
})
