import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  calculateNarrationSeconds,
  validateCityRegistry,
  validateImages,
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

describe('stop images', () => {
  const validImage = {
    src: 'images/st-louis-cemetery-no-1-1.jpg',
    alt: 'Whitewashed above-ground tombs behind the cemetery wall.',
    credit: 'Jean Example',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  }

  function stopWith(images) {
    const broken = clone(tour)
    broken.stops[0] = { ...tour.stops[0], images }
    return broken
  }

  it('accepts a stop with no images (images are optional)', () => {
    expect(validateImages(undefined)).toEqual([])
    expect(validateTour(stopWith(undefined), tourOptions)).toEqual([])
  })

  it('accepts a fully valid image', () => {
    expect(validateImages([validImage])).toEqual([])
    expect(validateTour(stopWith([validImage]), tourOptions)).toEqual([])
  })

  it('rejects images that is not an array', () => {
    const errors = validateImages('not-an-array')
    expect(errors.some((error) => error.includes('must be an array'))).toBe(true)
  })

  it('rejects an image with a missing src', () => {
    const errors = validateTour(stopWith([{ ...validImage, src: '' }]), tourOptions)
    expect(errors.some((error) => error.includes('src'))).toBe(true)
  })

  it('rejects an image with missing alt', () => {
    const errors = validateTour(stopWith([{ ...validImage, alt: '' }]), tourOptions)
    expect(errors.some((error) => error.includes('alt'))).toBe(true)
  })

  it('rejects an image with alt over 160 characters', () => {
    const errors = validateTour(
      stopWith([{ ...validImage, alt: 'x'.repeat(161) }]),
      tourOptions,
    )
    expect(errors.some((error) => error.includes('160 characters'))).toBe(true)
  })

  it('accepts alt at exactly 160 characters', () => {
    expect(validateImages([{ ...validImage, alt: 'x'.repeat(160) }])).toEqual([])
  })

  it('rejects an image with missing credit', () => {
    const errors = validateTour(stopWith([{ ...validImage, credit: '' }]), tourOptions)
    expect(errors.some((error) => error.includes('credit'))).toBe(true)
  })

  it('rejects an image with a license outside the enum', () => {
    const errors = validateTour(
      stopWith([{ ...validImage, license: 'All Rights Reserved' }]),
      tourOptions,
    )
    expect(errors.some((error) => error.includes('license'))).toBe(true)
  })

  it.each(['CC0', 'PD', 'CC-BY-2.0', 'CC-BY-SA-4.0'])('accepts license %s', (license) => {
    expect(validateImages([{ ...validImage, license }])).toEqual([])
  })

  it('rejects a sourceUrl that is not https', () => {
    const errors = validateTour(
      stopWith([
        {
          ...validImage,
          sourceUrl: 'http://commons.wikimedia.org/wiki/File:Example.jpg',
        },
      ]),
      tourOptions,
    )
    expect(errors.some((error) => error.includes('sourceUrl'))).toBe(true)
  })

  it('rejects a sourceUrl that is not on commons.wikimedia.org', () => {
    const errors = validateTour(
      stopWith([
        { ...validImage, sourceUrl: 'https://en.wikipedia.org/wiki/File:Example.jpg' },
      ]),
      tourOptions,
    )
    expect(errors.some((error) => error.includes('sourceUrl'))).toBe(true)
  })

  it('rejects an image with an unknown field', () => {
    const errors = validateTour(stopWith([{ ...validImage, foo: 'bar' }]), tourOptions)
    expect(errors.some((error) => error.includes('unknown field'))).toBe(true)
  })
})
