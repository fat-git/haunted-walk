/**
 * FAT-66: city selection for `loadTour`.
 *
 * Uses a two-city registry fixture (never added to the shipped registry) and
 * stubs `fetch` so no network is required. Covers: explicit city selection,
 * the `?city=<id>` deep link, the remembered localStorage choice, the
 * unknown-id fallback to the first city with a visible message, and the
 * `tour.id === city.defaultTour` guard.
 */
/// <reference types="node" />
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  loadTour,
  cityIdFromSearchParams,
  readSelectedCity,
  type LoadTourResult,
} from './loadTour'
import type { CityRegistry, Tour } from '../types/tour'

const ALPHA_TOUR: Tour = {
  schemaVersion: 1,
  id: 'alpha-tour',
  city: 'alpha-city',
  name: 'Alpha Ghosts',
  description: 'A tour of Alpha City.',
  stops: [],
} as Tour

const BETA_TOUR: Tour = {
  schemaVersion: 1,
  id: 'beta-tour',
  city: 'beta-city',
  name: 'Beta Ghosts',
  description: 'A tour of Beta City.',
  stops: [],
} as Tour

const REGISTRY: CityRegistry = {
  schemaVersion: 1,
  cities: [
    {
      id: 'alpha-city',
      name: 'Alpha City',
      defaultTour: 'alpha-tour',
      description: 'First city',
    },
    {
      id: 'beta-city',
      name: 'Beta City',
      defaultTour: 'beta-tour',
      description: 'Second city',
    },
  ],
}

const ROUTES: Record<string, unknown> = {
  '/tours/index.json': REGISTRY,
  '/tours/alpha-city/tour.json': ALPHA_TOUR,
  '/tours/beta-city/tour.json': BETA_TOUR,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function installFetch() {
  const fetch = (input: string) => {
    const body = ROUTES[String(input)]
    if (body === undefined) return new Response(null, { status: 404 })
    return jsonResponse(body)
  }
  vi.stubGlobal('fetch', fetch)
}

function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    } as unknown as Storage,
  })
  return store
}

beforeEach(() => {
  installFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadTour city selection', () => {
  it('loads the requested city and validates defaultTour', async () => {
    const result: LoadTourResult = await loadTour('beta-city', '/')
    expect(result.city.id).toBe('beta-city')
    expect(result.tour.id).toBe('beta-tour')
    expect(result.tour.name).toBe('Beta Ghosts')
    expect(result.fallbackMessage).toBeNull()
  })

  it('defaults to the first city when no id is requested', async () => {
    const result = await loadTour(null, '/')
    expect(result.city.id).toBe('alpha-city')
    expect(result.tour.id).toBe('alpha-tour')
    expect(result.fallbackMessage).toBeNull()
  })

  it('falls back to the first city with a visible message for an unknown id', async () => {
    const result = await loadTour('nope-city', '/')
    expect(result.city.id).toBe('alpha-city')
    expect(result.tour.id).toBe('alpha-tour')
    expect(result.fallbackMessage).toBe('Unknown city "nope-city". Showing Alpha City.')
  })

  it('throws when the registry names a tour the tour.json does not hold', async () => {
    const mismatched: CityRegistry = {
      schemaVersion: 1,
      cities: [
        {
          id: 'alpha-city',
          name: 'Alpha City',
          defaultTour: 'does-not-exist',
          description: 'x',
        },
      ],
    }
    vi.stubGlobal('fetch', (input: string) => {
      if (String(input) === '/tours/index.json') return jsonResponse(mismatched)
      return jsonResponse(ALPHA_TOUR) // tour.json id is alpha-tour, not does-not-exist
    })
    await expect(loadTour('alpha-city', '/')).rejects.toThrow(
      /Registry names tour "does-not-exist"/,
    )
  })

  it('throws when the registry has no cities', async () => {
    vi.stubGlobal('fetch', () => jsonResponse({ schemaVersion: 1, cities: [] }))
    await expect(loadTour(null, '/')).rejects.toThrow('No cities found in tour registry')
  })
})

describe('loadTour remembers the choice in localStorage', () => {
  it('uses the stored city when no id is requested', async () => {
    installStorage()
    const result = await loadTour(null, '/')
    expect(result.city.id).toBe('alpha-city') // nothing stored yet -> first city

    // Pick beta explicitly; it should be persisted.
    await loadTour('beta-city', '/')
    expect(readSelectedCity()).toBe('beta-city')

    // Now no id -> the remembered choice wins.
    const remembered = await loadTour(null, '/')
    expect(remembered.city.id).toBe('beta-city')
    expect(remembered.tour.id).toBe('beta-tour')
  })
})

describe('loadTour failure paths and persistence (FAT-97)', () => {
  it('throws when the registry response is not OK', async () => {
    vi.stubGlobal('fetch', () => new Response(null, { status: 500 }))
    await expect(loadTour(null, '/')).rejects.toThrow('Failed to load tour registry: 500')
  })

  it('throws when tour.json is not OK', async () => {
    vi.stubGlobal('fetch', (input: string) =>
      String(input) === '/tours/index.json'
        ? jsonResponse(REGISTRY)
        : new Response(null, { status: 503 }),
    )
    await expect(loadTour('beta-city', '/')).rejects.toThrow('Failed to load tour: 503')
  })

  it('does not persist the pick when its tour.json fails to load', async () => {
    const store = installStorage()
    vi.stubGlobal('fetch', (input: string) =>
      String(input) === '/tours/index.json'
        ? jsonResponse(REGISTRY)
        : new Response(null, { status: 404 }),
    )
    await expect(loadTour('beta-city', '/')).rejects.toThrow()
    expect(store.size).toBe(0)
  })

  it('persists the pick after a successful load', async () => {
    const store = installStorage()
    await loadTour('beta-city', '/')
    expect([...store.values()]).toEqual(['beta-city'])
  })

  it('does not persist an unknown id that fell back to the first city', async () => {
    const store = installStorage()
    await loadTour('nope-city', '/')
    expect(store.size).toBe(0)
  })

  it('ignores a stored id that is not in the registry', async () => {
    const store = installStorage()
    store.set('haunted-walk:selected-city', 'gone-city')
    const result = await loadTour(null, '/')
    expect(result.city.id).toBe('alpha-city')
    expect(result.fallbackMessage).toBeNull()
  })

  it('still loads when localStorage throws', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    const result = await loadTour(null, '/')
    expect(result.city.id).toBe('alpha-city')
    const picked = await loadTour('beta-city', '/')
    expect(picked.city.id).toBe('beta-city')
    expect(readSelectedCity()).toBeNull()
  })

  it('still loads when accessing window.localStorage throws', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError')
      },
    })
    const result = await loadTour('beta-city', '/')
    expect(result.city.id).toBe('beta-city')
    expect(readSelectedCity()).toBeNull()
  })
})

describe('cityIdFromSearchParams', () => {
  it('parses a city deep link', () => {
    expect(cityIdFromSearchParams('?city=beta-city')).toBe('beta-city')
    expect(cityIdFromSearchParams('?city=alpha-city&other=1')).toBe('alpha-city')
  })

  it('returns null when there is no city param', () => {
    expect(cityIdFromSearchParams('')).toBeNull()
    expect(cityIdFromSearchParams('?other=1')).toBeNull()
    expect(cityIdFromSearchParams('?city=')).toBeNull()
  })
})
