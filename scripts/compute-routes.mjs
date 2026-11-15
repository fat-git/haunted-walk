#!/usr/bin/env node
/**
 * Build-time walking-route computation.
 *
 * Routes each tour leg over public walkable ways from a committed OSM way
 * snapshot (`data/osm/<city>.json`), then writes `public/tours/<city>/route.geojson`.
 * The committed output is the runtime truth: the app never routes live, and a
 * clean offline rebuild reproduces the same bytes (`--check` proves it).
 *
 * Usage:
 *   node scripts/compute-routes.mjs [--check] [city-id]
 *
 * No network access, no API key — the snapshot is committed to the repo.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'
import { buildRouteDocument, buildWalkGraph, computeTourRoute } from './route-graph.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function parseArguments(argv) {
  const options = { check: false, cityId: null }
  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true
    } else if (argument.startsWith('--')) {
      console.error(`Unknown option: ${argument}`)
      process.exitCode = 1
      return null
    } else if (options.cityId === null) {
      options.cityId = argument
    } else {
      console.error(`Unexpected argument: ${argument}`)
      process.exitCode = 1
      return null
    }
  }
  return options
}

function readJson(path, label) {
  if (!existsSync(path)) {
    console.error(`${label}: file not found`)
    process.exitCode = 1
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`${label}: cannot read valid JSON (${error.message})`)
    process.exitCode = 1
    return null
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (!options) return

  const cityId = options.cityId ?? 'new-orleans-fq'
  const cityDir = join(ROOT, 'public', 'tours', cityId)
  const tourPath = join(cityDir, 'tour.json')
  const routePath = join(cityDir, 'route.geojson')
  const snapshotPath = join(ROOT, 'data', 'osm', `${cityId}.json`)

  const tour = readJson(tourPath, `public/tours/${cityId}/tour.json`)
  const snapshot = readJson(snapshotPath, `data/osm/${cityId}.json`)
  if (!tour || !snapshot) return

  if (!Array.isArray(tour.stops) || tour.stops.length < 2) {
    console.error(`public/tours/${cityId}/tour.json: needs at least 2 stops to route`)
    process.exitCode = 1
    return
  }
  const baseTimestamp = snapshot.osm3s?.timestamp_osm_base
  if (typeof baseTimestamp !== 'string') {
    console.error(`data/osm/${cityId}.json: missing osm3s.timestamp_osm_base`)
    process.exitCode = 1
    return
  }

  const graph = buildWalkGraph(snapshot.elements ?? [])
  const { legs, unroutableLegs, snapFailures } = computeTourRoute(graph, tour.stops)

  for (const failure of snapFailures) {
    console.error(`  ! ${failure}`)
  }
  for (const failure of unroutableLegs) {
    console.error(`  ! ${failure}`)
  }
  if (
    snapFailures.length > 0 ||
    unroutableLegs.length > 0 ||
    legs.length !== tour.stops.length - 1
  ) {
    console.error(
      `Routing failed for public/tours/${cityId}/tour.json: ${unroutableLegs.length + snapFailures.length} of ${tour.stops.length - 1} legs cannot be routed on public walkable ways. Fix the stop order or viewpoint — never route through private property.`,
    )
    process.exitCode = 1
    return
  }

  const route = buildRouteDocument({ city: cityId, tour, legs, baseTimestamp })
  // Format with the repo's own prettier so the committed bytes are stable
  // across environments and pass `npm run format:check` untouched.
  const output = await format(JSON.stringify(route), {
    filepath: 'route.geojson',
    parser: 'json',
  })

  if (options.check) {
    if (!existsSync(routePath)) {
      console.error(
        `public/tours/${cityId}/route.geojson: missing — run \`npm run routes:compute\` to generate it`,
      )
      process.exitCode = 1
      return
    }
    const committed = readFileSync(routePath, 'utf8')
    if (committed !== output) {
      console.error(
        `public/tours/${cityId}/route.geojson: does not match a fresh computation over the committed snapshot. Run \`npm run routes:compute\` and commit the result.`,
      )
      process.exitCode = 1
      return
    }
    console.log(
      `Route check OK: ${legs.length} legs over public walkable ways (${cityId})`,
    )
    return
  }

  writeFileSync(routePath, output)
  const totalM = legs.reduce((sum, leg) => sum + leg.distanceM, 0)
  console.log(
    `Route written: public/tours/${cityId}/route.geojson (${legs.length} legs, ${totalM} m total, status "computed")`,
  )
}

await main()
