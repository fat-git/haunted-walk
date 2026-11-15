import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  calculateNarrationSeconds,
  validateCityRegistry,
  validateRoute,
  validateTour,
} from './tour-schema.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
}

const registry = readJson('public/tours/index.json')
const tour = readJson('public/tours/new-orleans-fq/tour.json')
const route = readJson('public/tours/new-orleans-fq/route.geojson')
const city = registry.cities[0]
const tourOptions = {
  expectedCityId: city.id,
  expectedTourId: city.defaultTour,
}

function clone(value) {
  return structuredClone(value)
}

describe('shipped tour data', () => {
  it('has a valid city registry', () => {
    expect(validateCityRegistry(registry)).toEqual([])
  })

  it('has a valid tour with 8-12 stops', () => {
    expect(validateTour(tour, tourOptions)).toEqual([])
    expect(tour.stops.length).toBeGreaterThanOrEqual(8)
    expect(tour.stops.length).toBeLessThanOrEqual(12)
  })

  it('has a valid route shape whose stops match the tour order', () => {
    expect(validateRoute(route, { cityId: city.id, tour })).toEqual([])
  })
})

describe('narration length', () => {
  it('maps 150 words to 60 seconds and 300 words to 120 seconds', () => {
    const words = (count) => Array.from({ length: count }, () => 'word').join(' ')
    expect(calculateNarrationSeconds(words(150))).toBe(60)
    expect(calculateNarrationSeconds(words(300))).toBe(120)
  })
})

describe('required stop data', () => {
  it('rejects a stop with no sources', () => {
    const broken = clone(tour)
    delete broken.stops[0].sources

    const errors = validateTour(broken, tourOptions)

    expect(errors.some((error) => error.includes('sources'))).toBe(true)
  })

  it('rejects a stop with missing coordinates', () => {
    const broken = clone(tour)
    delete broken.stops[0].lat
    delete broken.stops[0].lon

    const errors = validateTour(broken, tourOptions)

    expect(errors).toContain('tour.stops[0].lat: must be a number between -90 and 90')
    expect(errors).toContain('tour.stops[0].lon: must be a number between -180 and 180')
  })

  it('rejects a stop whose legend is labelled as fact', () => {
    const broken = clone(tour)
    broken.stops[0].legendLabel = 'Fact'

    const errors = validateTour(broken, tourOptions)

    expect(errors.some((error) => error.includes('legendLabel'))).toBe(true)
  })

  it('rejects a viewpoint that is not a public sidewalk', () => {
    const broken = clone(tour)
    broken.stops[0].viewpoint.access = 'private-property'

    const errors = validateTour(broken, tourOptions)

    expect(errors.some((error) => error.includes('public sidewalks'))).toBe(true)
  })

  it('rejects a narration outside 60-120 seconds', () => {
    const broken = clone(tour)
    broken.stops[0].narration = 'Too short to be a stop.'

    const errors = validateTour(broken, tourOptions)

    expect(errors.some((error) => error.includes('narration'))).toBe(true)
  })
})

describe('route contract', () => {
  it('rejects a route whose stop order does not match the tour', () => {
    const broken = clone(route)
    broken.metadata.stops.reverse()

    const errors = validateRoute(broken, { cityId: city.id, tour })

    expect(errors.some((error) => error.includes('tour stop ids in tour order'))).toBe(
      true,
    )
  })

  it('rejects a placeholder route without an explanatory note', () => {
    const broken = clone(route)
    broken.metadata.status = 'placeholder'
    delete broken.metadata.note

    const errors = validateRoute(broken, { cityId: city.id, tour })

    expect(errors.some((error) => error.includes('placeholder route must explain'))).toBe(
      true,
    )
  })
})
