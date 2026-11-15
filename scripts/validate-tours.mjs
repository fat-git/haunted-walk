#!/usr/bin/env node
/**
 * Build-time tour data validator. Runs before `tsc` and `vite build`, so a
 * malformed, uncited, or incomplete stop cannot ship.
 *
 * Rules live in `tour-schema.mjs`; this file only reads the city registry, the
 * tour files it points at, and each city's committed route.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCityRegistry, validateRoute, validateTour } from './tour-schema.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TOURS_DIR = join(ROOT, 'public', 'tours')
const REGISTRY_PATH = join(TOURS_DIR, 'index.json')

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
