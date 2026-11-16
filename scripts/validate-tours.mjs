#!/usr/bin/env node
/**
 * Build-time tour data validator. Runs before `tsc` and `vite build`, so a
 * malformed, uncited, or incomplete stop cannot ship.
 *
 * Rules live in `tour-schema.mjs`; this file only reads the city registry, the
 * tour files it points at, and each city's committed route.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCityRegistry, validateRoute, validateTour } from './tour-schema.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TOURS_DIR = join(ROOT, 'public', 'tours')
const REGISTRY_PATH = join(TOURS_DIR, 'index.json')

// 150 KB, matching the stop-image data contract.
const MAX_IMAGE_SIZE_BYTES = 150 * 1024
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function readJson(path, label, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    errors.push(`${label}: cannot read valid JSON (${reason})`)
    return undefined
  }
}

function prefix(errors, label) {
  return errors.map((error) => `${label}: ${error}`)
}

/**
 * Filesystem checks for a stop's optional images. The data rules (alt, credit,
 * license, sourceUrl) live in tour-schema.mjs; this checks what the build can
 * only know by reading the tour folder: the referenced file exists, is a real
 * file, has an allowed extension, and is under the size cap. The width check is
 * intentionally skipped: reading image dimensions needs a new dependency.
 */
export function validateStopImages(stop, cityDir, errors) {
  const images = stop.images
  if (!Array.isArray(images) || images.length === 0) return

  images.forEach((image, index) => {
    const imagePath = `images[${index}]`
    if (!image || typeof image.src !== 'string' || image.src.length === 0) return
    // Reject absolute or traversing paths so an image can never resolve outside
    // the tour folder.
    if (image.src.startsWith('/') || image.src.includes('..')) {
      errors.push(
        `${imagePath}: "${image.src}" must be a relative path inside the tour folder`,
      )
      return
    }
    const filePath = join(cityDir, image.src)
    if (!existsSync(filePath)) {
      errors.push(
        `${imagePath}: referenced image "${image.src}" does not exist in the tour folder`,
      )
      return
    }
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      errors.push(`${imagePath}: cannot stat image "${image.src}"`)
      return
    }
    if (!stat.isFile()) {
      errors.push(`${imagePath}: "${image.src}" is not a file`)
      return
    }
    const extension = extname(image.src).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      errors.push(
        `${imagePath}: "${image.src}" must use one of ${IMAGE_EXTENSIONS.join(', ')}`,
      )
    }
    if (stat.size > MAX_IMAGE_SIZE_BYTES) {
      errors.push(
        `${imagePath}: "${image.src}" is ${Math.round(stat.size / 1024)} KB, over the ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024)} KB limit`,
      )
    }
  })
}

function main() {
  const errors = []
  const summary = []

  const registry = readJson(REGISTRY_PATH, 'public/tours/index.json', errors)
  const cities = Array.isArray(registry?.cities) ? registry.cities : []

  if (registry !== undefined) {
    errors.push(...prefix(validateCityRegistry(registry), 'public/tours/index.json'))
  }

  const registeredCityIds = new Set(
    cities.filter((city) => typeof city?.id === 'string').map((city) => city.id),
  )

  if (existsSync(TOURS_DIR)) {
    const cityDirectories = readdirSync(TOURS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    for (const directory of cityDirectories) {
      if (!registeredCityIds.has(directory)) {
        errors.push(
          `public/tours/${directory}: directory exists but has no line in public/tours/index.json`,
        )
      }
    }
  }

  for (const city of cities) {
    if (typeof city?.id !== 'string') continue

    const cityDir = join(TOURS_DIR, city.id)
    const tourLabel = `public/tours/${city.id}/tour.json`
    const routeLabel = `public/tours/${city.id}/route.geojson`

    if (!existsSync(cityDir)) {
      errors.push(`${tourLabel}: city directory does not exist`)
      continue
    }

    const tour = readJson(join(cityDir, 'tour.json'), tourLabel, errors)
    if (tour !== undefined) {
      errors.push(
        ...prefix(
          validateTour(tour, {
            expectedCityId: city.id,
            expectedTourId: city.defaultTour,
          }),
          tourLabel,
        ),
      )
      if (Array.isArray(tour.stops)) {
        tour.stops.forEach((stop) => {
          validateStopImages(stop, cityDir, errors)
        })
      }
    }

    const route = readJson(join(cityDir, 'route.geojson'), routeLabel, errors)
    if (route !== undefined) {
      errors.push(...prefix(validateRoute(route, { cityId: city.id, tour }), routeLabel))
    }

    if (tour !== undefined && Array.isArray(tour.stops)) {
      summary.push(`${city.id}: ${tour.stops.length} stops`)
    }
  }

  if (errors.length > 0) {
    console.error(`Tour data validation failed with ${errors.length} problem(s):`)
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    console.error('\nFix the data or run `npm run validate:tours` for the same check.')
    process.exitCode = 1
    return
  }

  console.log(
    `Tour data OK: ${cities.length} ${cities.length === 1 ? 'city' : 'cities'} (${summary.join(', ')})`,
  )
}

main()
