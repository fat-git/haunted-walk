import { describe, expect, it } from 'vitest'
import {
  OFF_ROUTE_THRESHOLD_M,
  distanceToRouteM,
  getNextManeuver,
  isOffRoutePoint,
} from './route'
import type { Maneuver, RouteFile, TourStop } from '../types/tour'

const stops: TourStop[] = [
  {
    id: 'stop-a',
    name: 'A',
    lat: 29.959,
    lon: -90.071,
    address: '',
    viewpoint: { lat: 29.959, lon: -90.071, access: 'public-sidewalk', description: '' },
    geofenceRadiusM: 30,
    narration: '',
    legendLabel: 'Legend',
    sources: [],
  },
  {
    id: 'stop-b',
    name: 'B',
    lat: 29.958,
    lon: -90.068,
    address: '',
    viewpoint: { lat: 29.958, lon: -90.068, access: 'public-sidewalk', description: '' },
    geofenceRadiusM: 30,
    narration: '',
    legendLabel: 'Legend',
    sources: [],
  },
  {
    id: 'stop-c',
    name: 'C',
    lat: 29.957,
    lon: -90.065,
    address: '',
    viewpoint: { lat: 29.957, lon: -90.065, access: 'public-sidewalk', description: '' },
    geofenceRadiusM: 30,
    narration: '',
    legendLabel: 'Legend',
    sources: [],
  },
]

const maneuvers: Maneuver[] = [
  {
    from: 'stop-a',
    to: 'stop-b',
    instruction: 'Walk to B',
    distanceM: 300,
    durationS: 240,
  },
  {
    from: 'stop-b',
    to: 'stop-c',
    instruction: 'Walk to C',
    distanceM: 300,
    durationS: 240,
  },
]

const route: RouteFile = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-90.071, 29.959],
          [-90.068, 29.958],
          [-90.065, 29.957],
        ],
      },
      properties: {},
    },
  ],
  metadata: {
    schemaVersion: 1,
    city: 'new-orleans-fq',
    tour: 'french-quarter-ghosts',
    status: 'computed',
    generatedAt: '2026-01-01T00:00:00Z',
    stops: ['stop-a', 'stop-b', 'stop-c'],
    maneuvers,
  },
}

describe('getNextManeuver', () => {
  it('returns the leg leaving the current stop', () => {
    expect(getNextManeuver(route, stops, 0)?.instruction).toBe('Walk to B')
    expect(getNextManeuver(route, stops, 1)?.instruction).toBe('Walk to C')
  })

  it('returns null at the final stop', () => {
    expect(getNextManeuver(route, stops, 2)).toBeNull()
  })

  it('returns null when no route is loaded', () => {
    expect(getNextManeuver(null, stops, 0)).toBeNull()
  })

  it('falls back to list order when stop ids do not match', () => {
    const mismatched: RouteFile = {
      ...route,
      metadata: {
        ...route.metadata,
        maneuvers: [
          { ...maneuvers[0], from: 'other', to: 'other' },
          { ...maneuvers[1], from: 'other', to: 'other' },
        ],
      },
    }
    expect(getNextManeuver(mismatched, stops, 1)?.instruction).toBe('Walk to C')
  })
})

describe('distanceToRouteM', () => {
  it('is zero for a point on a vertex', () => {
    expect(
      distanceToRouteM(
        { lat: 29.958, lon: -90.068 },
        route.features[0].geometry.coordinates,
      ),
    ).toBe(0)
  })

  it('is small for a point on a segment', () => {
    const d = distanceToRouteM(
      { lat: 29.9585, lon: -90.0695 },
      route.features[0].geometry.coordinates,
    )
    expect(d).toBeLessThan(5)
  })

  it('measures lateral offset in meters', () => {
    // ~0.0005 deg of latitude north of the first segment, accounting for the
    // segment's slope: roughly 86 m from the routed line.
    const d = distanceToRouteM(
      { lat: 29.9595, lon: -90.07 },
      route.features[0].geometry.coordinates,
    )
    expect(d).toBeGreaterThan(80)
    expect(d).toBeLessThan(92)
  })

  it('measures offset from a vertex along the perpendicular', () => {
    // 0.001 deg of latitude (~110 m) north of the first vertex.
    const d = distanceToRouteM(
      { lat: 29.96, lon: -90.071 },
      route.features[0].geometry.coordinates,
    )
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(116)
  })

  it('falls back to the nearest endpoint past the line ends', () => {
    const d = distanceToRouteM({ lat: 29.957, lon: -90.065 }, [
      [-90.071, 29.959],
      [-90.068, 29.958],
    ])
    expect(d).toBeGreaterThan(300)
  })

  it('handles a single-point route', () => {
    const d = distanceToRouteM({ lat: 29.959, lon: -90.071 }, [[-90.071, 29.959]])
    expect(d).toBe(0)
  })

  it('returns Infinity for an empty route', () => {
    expect(distanceToRouteM({ lat: 29.959, lon: -90.071 }, [])).toBe(
      Number.POSITIVE_INFINITY,
    )
  })
})

describe('isOffRoutePoint', () => {
  it('is on route well inside the threshold', () => {
    expect(isOffRoutePoint(50, 10)).toBe(false)
  })

  it('is off route beyond the threshold', () => {
    expect(isOffRoutePoint(150, 10)).toBe(true)
  })

  it('widens the threshold for poor fixes', () => {
    expect(isOffRoutePoint(150, 50)).toBe(false)
    expect(isOffRoutePoint(250, 50)).toBe(true)
  })

  it('treats a missing accuracy as zero pad', () => {
    expect(isOffRoutePoint(101, null)).toBe(true)
  })
})

/**
 * The same checks against the committed tour data, so a route regeneration
 * that breaks the maneuver/stops alignment fails here. Mirrors the approach
 * in tourPaths.test.ts: pin the app's assumptions to the files on disk.
 */
describe('committed new-orleans-fq route', () => {
  const shipped = new Map(
    Object.entries(
      import.meta.glob('../../public/tours/new-orleans-fq/*', {
        eager: true,
        query: '?raw',
        import: 'default',
      }),
    ).map(([key, contents]) => [key.slice(key.lastIndexOf('/') + 1), contents]),
  ) as Map<string, string>

  const committedRoute = JSON.parse(shipped.get('route.geojson')!) as RouteFile
  const committedTour = JSON.parse(shipped.get('tour.json')!) as { stops: TourStop[] }

  it('has one maneuver per leg, aligned to stop order', () => {
    expect(committedRoute.metadata.maneuvers.length).toBe(committedTour.stops.length - 1)
    committedRoute.metadata.maneuvers.forEach((maneuver, index) => {
      expect(maneuver.from).toBe(committedTour.stops[index].id)
      expect(maneuver.to).toBe(committedTour.stops[index + 1].id)
    })
  })

  it('returns the committed leg instruction for the first stop', () => {
    const maneuver = getNextManeuver(committedRoute, committedTour.stops, 0)
    expect(maneuver?.instruction).toBe(committedRoute.metadata.maneuvers[0].instruction)
  })

  it('returns no maneuver at the final stop', () => {
    expect(
      getNextManeuver(
        committedRoute,
        committedTour.stops,
        committedTour.stops.length - 1,
      ),
    ).toBeNull()
  })

  it('treats a fix on the route as on route and one 300 m away as off route', () => {
    const coordinates = committedRoute.features[0].geometry.coordinates
    const atStart = { lat: coordinates[0][1], lon: coordinates[0][0] }
    expect(distanceToRouteM(atStart, coordinates)).toBe(0)

    const farAway = { lat: coordinates[0][1] + 0.003, lon: coordinates[0][0] }
    const d = distanceToRouteM(farAway, coordinates)
    // The placeholder geometry zigzags, so the exact offset varies; anything
    // well past the 100 m threshold proves the check fires.
    expect(d).toBeGreaterThan(OFF_ROUTE_THRESHOLD_M * 2)
    expect(isOffRoutePoint(d, 20)).toBe(true)
  })
})
