import { describe, expect, it } from 'vitest'
import { imageUrl, registryUrl, routeUrl, tourUrl } from './tourPaths'

/**
 * These tests exist because typecheck, lint, the unit suite, `build` and
 * `check:dist` all pass on a URL that 404s — nothing else in CI compares the
 * paths the app requests against the files actually shipped. Here every file
 * under `public/tours/` is pulled in at its real path and looked up by the URL
 * the app builds, so a layout or registry change that breaks the loader fails.
 */

const rawFiles = import.meta.glob('../../public/tours/**/*', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/** Files shipped from `public/`, keyed by the URL path the app requests at base `/`. */
const shipped = new Map(
  Object.entries(rawFiles).map(([key, contents]) => {
    const marker = '/public/'
    return [key.slice(key.indexOf(marker) + marker.length - 1), contents]
  }),
)

interface RegistryCity {
  id: string
  defaultTour: string
}

function readShipped(url: string): string {
  const contents = shipped.get(url)
  if (contents === undefined) {
    throw new Error(`${url} is not shipped. Present: ${[...shipped.keys()].join(', ')}`)
  }
  return contents
}

const registry: { cities: RegistryCity[] } = JSON.parse(readShipped(registryUrl('/')))

describe('tour data paths', () => {
  it('builds URLs against the documented layout', () => {
    expect(registryUrl('/')).toBe('/tours/index.json')
    expect(tourUrl('new-orleans-fq', '/')).toBe('/tours/new-orleans-fq/tour.json')
    expect(routeUrl('new-orleans-fq', '/')).toBe('/tours/new-orleans-fq/route.geojson')
  })

  it('resolves URLs under the deployed base path', () => {
    expect(tourUrl('new-orleans-fq', '/haunted-walk/')).toBe(
      '/haunted-walk/tours/new-orleans-fq/tour.json',
    )
  })

  it('builds a stop image URL against the documented layout', () => {
    expect(imageUrl('new-orleans-fq', 'images/st-louis-cemetery-no-1-1.jpg', '/')).toBe(
      '/tours/new-orleans-fq/images/st-louis-cemetery-no-1-1.jpg',
    )
  })

  it('resolves a stop image URL under the deployed base path', () => {
    expect(imageUrl('new-orleans-fq', 'images/x.jpg', '/haunted-walk/')).toBe(
      '/haunted-walk/tours/new-orleans-fq/images/x.jpg',
    )
  })

  it('lists at least one city in the registry', () => {
    expect(registry.cities.length).toBeGreaterThan(0)
  })

  it.each(registry.cities)('ships the files the app requests for $id', (city) => {
    expect(shipped.has(tourUrl(city.id, '/'))).toBe(true)
    expect(shipped.has(routeUrl(city.id, '/'))).toBe(true)
  })

  it.each(registry.cities)('names a tour id matching $id/tour.json', (city) => {
    const tour = JSON.parse(readShipped(tourUrl(city.id, '/'))) as { id: string }
    expect(tour.id).toBe(city.defaultTour)
  })

  it.each(registry.cities)('ships every image referenced by $id/tour.json', (city) => {
    const tour = JSON.parse(readShipped(tourUrl(city.id, '/'))) as {
      stops: Array<{ images?: Array<{ src: string }> }>
    }
    for (const stop of tour.stops) {
      for (const image of stop.images ?? []) {
        expect(shipped.has(imageUrl(city.id, image.src, '/'))).toBe(true)
      }
    }
  })
})
