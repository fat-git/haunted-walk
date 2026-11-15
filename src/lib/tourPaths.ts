/**
 * Canonical URLs for the tour data files.
 *
 * The data contract (see `public/tours/README.md`) is one directory per city,
 * with `tour.json` and `route.geojson` inside it, listed by `tours/index.json`.
 * Every tour-data URL in the app is built here so that the layout lives in one
 * place and `tourPaths.test.ts` can pin it against the files actually on disk.
 */

import { withBase } from './url'

/** The city registry — the only list of cities. */
export function registryUrl(base?: string): string {
  return withBase('tours/index.json', ...maybeBase(base))
}

/** A city's tour definition. */
export function tourUrl(cityId: string, base?: string): string {
  return withBase(`tours/${cityId}/tour.json`, ...maybeBase(base))
}

/** A city's precomputed walking route, committed at build time. */
export function routeUrl(cityId: string, base?: string): string {
  return withBase(`tours/${cityId}/route.geojson`, ...maybeBase(base))
}

/** Forward an explicit base only when given, so `withBase` keeps its default. */
function maybeBase(base?: string): [string] | [] {
  return base === undefined ? [] : [base]
}
