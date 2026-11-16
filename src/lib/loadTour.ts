/**
 * Load a single city's tour data from the registry.
 *
 * The walker chooses a city (deep link `?city=<id>`, remembered choice in
 * localStorage, or the first city in the registry). Only the chosen city's
 * `tour.json` is fetched here; `useTour` fetches that same city's
 * `route.geojson` via `tour.city`. No other city's data is requested, so
 * adding cities to the registry never grows the first-visit payload.
 *
 * An unknown or missing city id falls back to the registry's first city with
 * a visible `fallbackMessage` — never a blank screen.
 */

import { registryUrl, tourUrl } from './tourPaths'
import type { CityRegistry, CityEntry, Tour } from '../types/tour'

const SELECTED_CITY_STORAGE_KEY = 'haunted-walk:selected-city'

function availableStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readSelectedCity(): string | null {
  const storage = availableStorage()
  if (!storage) return null
  try {
    return storage.getItem(SELECTED_CITY_STORAGE_KEY)
  } catch {
    return null
  }
}

export function persistSelectedCity(cityId: string): void {
  const storage = availableStorage()
  if (!storage) return
  try {
    storage.setItem(SELECTED_CITY_STORAGE_KEY, cityId)
  } catch {
    // Storage blocked (private mode): the choice simply isn't remembered.
  }
}

/** Read `?city=<id>` from a query string, e.g. `window.location.search`. */
export function cityIdFromSearchParams(search: string): string | null {
  try {
    const params = new URLSearchParams(search)
    const id = params.get('city')
    return id === null || id === '' ? null : id
  } catch {
    return null
  }
}

export interface LoadTourResult {
  tour: Tour
  city: CityEntry
  registry: CityRegistry
  /** Set when an unknown/missing id fell back to the first city. */
  fallbackMessage: string | null
}

/**
 * Load the registry, resolve the city, then load that city's tour.json.
 *
 * @param requestedCityId - id from `?city=<id>` or the city picker. Null means
 *   use the remembered/localStorage choice, then the first city.
 * @param base - Vite base path override, mainly for tests.
 */
export async function loadTour(
  requestedCityId: string | null,
  base?: string,
): Promise<LoadTourResult> {
  const registryResponse = await fetch(registryUrl(base))
  if (!registryResponse.ok) {
    throw new Error(`Failed to load tour registry: ${registryResponse.status}`)
  }
  const registry: CityRegistry = await registryResponse.json()
  const cities = registry.cities
  if (!cities || cities.length === 0) {
    throw new Error('No cities found in tour registry')
  }

  let city: CityEntry
  let fallbackMessage: string | null = null

  if (requestedCityId) {
    const found = cities.find((candidate) => candidate.id === requestedCityId)
    if (found) {
      city = found
    } else {
      city = cities[0]
      fallbackMessage = `Unknown city "${requestedCityId}". Showing ${cities[0].name}.`
    }
  } else {
    const stored = readSelectedCity()
    const found = stored ? cities.find((candidate) => candidate.id === stored) : undefined
    city = found ?? cities[0]
  }

  const tourResponse = await fetch(tourUrl(city.id, base))
  if (!tourResponse.ok) {
    throw new Error(`Failed to load tour: ${tourResponse.status}`)
  }
  const tour: Tour = await tourResponse.json()

  // `defaultTour` is a tour id, not a directory. Check it rather than ignore it,
  // so a registry that names a tour the city folder does not hold fails loudly.
  if (tour.id !== city.defaultTour) {
    throw new Error(
      `Registry names tour "${city.defaultTour}" for ${city.id} but its tour.json is "${tour.id}"`,
    )
  }

  // Remember an explicit pick only once its tour has loaded, so a failed
  // fetch never leaves the walker stuck on a city that cannot open.
  if (requestedCityId && city.id === requestedCityId) {
    persistSelectedCity(city.id)
  }

  return { tour, city, registry, fallbackMessage }
}
