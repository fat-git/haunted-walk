import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_CORRIDOR_M,
  MAX_CONNECTOR_LENGTH_M,
  MAX_SNAP_DISTANCE_M,
  buildRouteDocument,
  buildWalkGraph,
  composeInstruction,
  computeTourRoute,
  isWalkableWay,
  pathSteps,
  snapToGraph,
  shortestPath,
} from './route-graph.mjs'

function way(id, tags, coordinates) {
  return {
    type: 'way',
    id,
    tags,
    geometry: coordinates.map(([lat, lon]) => ({ lat, lon })),
  }
}

// A five-point square grid: streets A (north side) and B (south side) run
// east-west, street C runs north-south on the west, all 100 m per side.
const GRID = [
  way(1, { highway: 'residential', name: 'A Street' }, [
    [29.95, -90.0],
    [29.95, -90.001],
  ]),
  way(2, { highway: 'residential', name: 'B Street' }, [
    [29.949, -90.0],
    [29.949, -90.001],
  ]),
  way(3, { highway: 'residential', name: 'C Street' }, [
    [29.95, -90.0],
    [29.949, -90.0],
  ]),
]

function gridGraph() {
  return buildWalkGraph(GRID)
}

describe('isWalkableWay', () => {
  it('accepts public sidewalk-legal highways', () => {
    expect(
      isWalkableWay(
        way(1, { highway: 'footway' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(true)
    expect(
      isWalkableWay(
        way(2, { highway: 'pedestrian', name: 'Jackson Square' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(true)
    expect(
      isWalkableWay(
        way(3, { highway: 'residential', name: 'X' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(true)
  })

  it('rejects private, no-access, indoor, and motorized-only ways', () => {
    expect(
      isWalkableWay(
        way(1, { highway: 'footway', access: 'private' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
    expect(
      isWalkableWay(
        way(2, { highway: 'residential', access: 'no' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
    expect(
      isWalkableWay(
        way(3, { highway: 'footway', foot: 'no' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
    expect(
      isWalkableWay(
        way(4, { highway: 'corridor', indoor: 'yes' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
    expect(
      isWalkableWay(
        way(5, { highway: 'motorway' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
    expect(
      isWalkableWay(
        way(6, { highway: 'cycleway' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
  })

  it('lets an explicit foot=yes rescue a restricted classification', () => {
    expect(
      isWalkableWay(
        way(1, { highway: 'cycleway', foot: 'yes' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(true)
    expect(
      isWalkableWay(
        way(2, { highway: 'footway', access: 'private', foot: 'yes' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(true)
  })

  it('rejects ways without tags or a highway classification', () => {
    expect(isWalkableWay({ type: 'way', id: 1, geometry: [] })).toBe(false)
    expect(
      isWalkableWay(
        way(1, { name: 'mystery' }, [
          [0, 0],
          [0, 1],
        ]),
      ),
    ).toBe(false)
  })
})

describe('buildWalkGraph', () => {
  it('connects shared way endpoints into one graph', () => {
    const graph = gridGraph()
    expect(graph.adjacency.size).toBeGreaterThan(0)
    const path = shortestPath(graph, '29.949,-90.001', '29.95,-90')
    expect(path).not.toBeNull()
    expect(path[0]).toBe('29.949,-90.001')
    expect(path[path.length - 1]).toBe('29.95,-90')
  })

  it('treats edges as bidirectional (one-ways do not bind a walker)', () => {
    const graph = gridGraph()
    expect(shortestPath(graph, '29.95,-90', '29.949,-90.001')).not.toBeNull()
    expect(shortestPath(graph, '29.949,-90.001', '29.95,-90')).not.toBeNull()
  })

  it('keeps the shortest parallel edge between the same two points', () => {
    const graph = buildWalkGraph([
      ...GRID,
      way(9, { highway: 'footway' }, [
        [29.95, -90.0],
        [29.949, -90.0],
      ]),
    ])
    const path = shortestPath(graph, '29.95,-90', '29.949,-90')
    const steps = pathSteps(graph, path)
    // The direct footway (100 m) must beat the two-leg detour through A/B.
    expect(steps).toHaveLength(1)
    expect(steps[0].streetName).toBeNull()
  })
})

describe('shortestPath', () => {
  it('returns null when no walkable connection exists', () => {
    const graph = buildWalkGraph([
      way(1, { highway: 'residential' }, [
        [0, 0],
        [0, 1],
      ]),
      way(2, { highway: 'residential' }, [
        [2, 2],
        [2, 3],
      ]),
    ])
    expect(shortestPath(graph, '0,0', '2,2')).toBeNull()
  })
})

describe('snapToGraph', () => {
  it('snaps to the nearest walkable node within the limit', () => {
    const snapped = snapToGraph(gridGraph(), { lat: 29.9501, lon: -90.0005 })
    expect(snapped).not.toBeNull()
    expect(snapped.distanceM).toBeLessThanOrEqual(MAX_SNAP_DISTANCE_M)
  })

  it('returns null beyond the snap limit', () => {
    expect(snapToGraph(gridGraph(), { lat: 30.0, lon: -90.5 })).toBeNull()
  })
})

describe('pathSteps', () => {
  it('merges consecutive edges on the same street', () => {
    const graph = buildWalkGraph([
      way(1, { highway: 'residential', name: 'Long Street' }, [
        [0, 0],
        [0, 0.001],
      ]),
      way(2, { highway: 'residential', name: 'Long Street' }, [
        [0, 0.001],
        [0, 0.002],
      ]),
    ])
    const steps = pathSteps(graph, shortestPath(graph, '0,0', '0,0.002'))
    expect(steps).toHaveLength(1)
    expect(steps[0].streetName).toBe('Long Street')
  })
})

describe('composeInstruction', () => {
  it('names the street, turns, and arrival distance', () => {
    const steps = pathSteps(
      gridGraph(),
      shortestPath(gridGraph(), '29.95,-90', '29.949,-90.001'),
    )
    const distanceM = steps.reduce((sum, step) => sum + step.distanceM, 0)
    const instruction = composeInstruction(steps, 'The Stop', distanceM)
    expect(instruction).toContain('C Street')
    expect(instruction).toContain('B Street')
    expect(instruction).toContain('The Stop')
  })

  it('describes unnamed walkable ways by their kind, not as streets', () => {
    const graph = buildWalkGraph([
      way(1, { highway: 'footway' }, [
        [29.95, -90.0],
        [29.95, -90.001],
      ]),
    ])
    const steps = pathSteps(graph, shortestPath(graph, '29.95,-90', '29.95,-90.001'))
    const distanceM = steps.reduce((sum, step) => sum + step.distanceM, 0)
    expect(composeInstruction(steps, 'The Stop', distanceM)).toContain('the sidewalk')
  })

  it('describes an unnamed public service way as the alley, not a service lane', () => {
    const graph = buildWalkGraph([
      way(1, { highway: 'service' }, [
        [29.95, -90.0],
        [29.95, -90.001],
      ]),
    ])
    const steps = pathSteps(graph, shortestPath(graph, '29.95,-90', '29.95,-90.001'))
    const distanceM = steps.reduce((sum, step) => sum + step.distanceM, 0)
    const instruction = composeInstruction(steps, 'The Stop', distanceM)
    expect(instruction).toContain('the alley')
    expect(instruction).not.toContain('service lane')
  })
})

describe('computeTourRoute', () => {
  const stops = [
    {
      id: 'a',
      name: 'Stop A',
      viewpoint: { lat: 29.95, lon: -90.0 },
    },
    {
      id: 'b',
      name: 'Stop B',
      viewpoint: { lat: 29.95, lon: -90.001 },
    },
    {
      id: 'c',
      name: 'Stop C',
      viewpoint: { lat: 29.949, lon: -90.001 },
    },
  ]

  it('routes each leg in tour order over walkable ways', () => {
    const { legs, unroutableLegs, snapFailures, connectorFailures } = computeTourRoute(
      gridGraph(),
      stops,
    )
    expect(snapFailures).toHaveLength(0)
    expect(unroutableLegs).toHaveLength(0)
    expect(connectorFailures).toHaveLength(0)
    expect(legs.map((leg) => `${leg.from}->${leg.to}`)).toEqual(['a->b', 'b->c'])
    expect(legs[0].coordinates[0]).toEqual([-90.0, 29.95])
    expect(legs[0].coordinates[legs[0].coordinates.length - 1]).toEqual([-90.001, 29.95])
  })

  it('flags legs with no walkable path instead of routing them', () => {
    const isolated = [
      stops[0],
      {
        id: 'far',
        name: 'Far Stop',
        viewpoint: { lat: 30.0, lon: -90.5 },
      },
    ]
    const { legs, snapFailures } = computeTourRoute(gridGraph(), isolated)
    expect(legs).toHaveLength(0)
    expect(snapFailures).toHaveLength(1)
    expect(snapFailures[0]).toContain('far')
  })
})

describe('viewpoint connector validation (Security F1)', () => {
  // A 200 m east-west street whose only graph nodes are its endpoints, plus a
  // side arm hanging off the east endpoint (40 m north, reaching back west).
  const corridorGraph = () =>
    buildWalkGraph([
      way(1, { highway: 'residential', name: 'F Street' }, [
        [0, 0],
        [0, 0.0018],
      ]),
      way(2, { highway: 'residential', name: 'Side Arm' }, [
        [0, 0.0018],
        [0.00036, 0.0018],
        [0.00036, 0.0009],
      ]),
    ])

  it('accepts a viewpoint sitting on a public way', () => {
    const stops = [
      { id: 'a', name: 'Stop A', viewpoint: { lat: 0, lon: 0.0002 } },
      // Near F Street's east endpoint, so the snap and the drawn connector
      // both stay on the street itself.
      { id: 'b', name: 'Stop B', viewpoint: { lat: 0, lon: 0.0017 } },
    ]
    const { connectorFailures, unroutableLegs, snapFailures } = computeTourRoute(
      corridorGraph(),
      stops,
    )
    expect(snapFailures).toHaveLength(0)
    expect(unroutableLegs).toHaveLength(0)
    expect(connectorFailures).toHaveLength(0)
  })

  it('fails when the straight connector to the nearest public way exceeds the length bound', () => {
    const stops = [
      { id: 'a', name: 'Stop A', viewpoint: { lat: 0, lon: 0.0002 } },
      // ~17 m north of F Street's midpoint: over MAX_CONNECTOR_LENGTH_M.
      { id: 'b', name: 'Stop B', viewpoint: { lat: 0.00015, lon: 0.0005 } },
    ]
    const { connectorFailures } = computeTourRoute(corridorGraph(), stops)
    expect(connectorFailures).toHaveLength(1)
    expect(connectorFailures[0]).toContain('a -> b')
    expect(connectorFailures[0]).toContain('b')
    expect(connectorFailures[0]).toContain('nearest public walkable way')
    expect(Number(MAX_CONNECTOR_LENGTH_M)).toBeLessThan(16.7)
  })

  it('fails when the drawn connector leaves the walkable-way corridor', () => {
    const stops = [
      { id: 'a', name: 'Stop A', viewpoint: { lat: 0, lon: 0.0002 } },
      // Only 5 m off F Street (within the length bound), but the nearest graph
      // node is 35 m away on the side arm, so the straight drawn connector
      // crosses ground ~20 m from every public way.
      { id: 'b', name: 'Stop B', viewpoint: { lat: 0.000045, lon: 0.0009 } },
    ]
    const { connectorFailures } = computeTourRoute(corridorGraph(), stops)
    expect(connectorFailures).toHaveLength(1)
    expect(connectorFailures[0]).toContain('a -> b')
    expect(connectorFailures[0]).toContain('b')
    expect(connectorFailures[0]).toContain('corridor')
  })
})

describe('buildRouteDocument', () => {
  it('produces a deterministic computed route with one maneuver per leg', () => {
    const stops = [
      { id: 'a', name: 'Stop A', viewpoint: { lat: 29.95, lon: -90.0 } },
      { id: 'b', name: 'Stop B', viewpoint: { lat: 29.95, lon: -90.001 } },
    ]
    const { legs } = computeTourRoute(gridGraph(), stops)
    const tour = { id: 'test-tour', name: 'Test Tour', stops }
    const route = buildRouteDocument({
      city: 'test-city',
      tour,
      legs,
      baseTimestamp: '2026-01-01T00:00:00Z',
    })

    expect(route.type).toBe('FeatureCollection')
    expect(route.features).toHaveLength(1)
    expect(route.features[0].geometry.type).toBe('LineString')
    expect(route.metadata.status).toBe('computed')
    expect(route.metadata.generatedAt).toBe('2026-01-01T00:00:00Z')
    expect(route.metadata.stops).toEqual(['a', 'b'])
    expect(route.metadata.maneuvers).toHaveLength(1)
    expect(route.metadata.maneuvers[0]).toMatchObject({
      from: 'a',
      to: 'b',
      distanceM: expect.any(Number),
      durationS: expect.any(Number),
    })

    const again = buildRouteDocument({
      city: 'test-city',
      tour,
      legs,
      baseTimestamp: '2026-01-01T00:00:00Z',
    })
    expect(JSON.stringify(again)).toBe(JSON.stringify(route))
  })
})
