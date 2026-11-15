/**
 * Build-time walking-route computation over a committed OSM way snapshot.
 *
 * Pure module: no filesystem, no network. `compute-routes.mjs` feeds it the
 * Overpass snapshot and the tour, and writes the committed `route.geojson`.
 *
 * Pedestrian semantics: every walkable way is traversable in both directions
 * (one-way signs do not bind a walker), and only sidewalk-legal public ways
 * are walkable at all. Anything private, indoor, or motorway-class is dropped
 * before routing, so a computed route can never cut through private property.
 */

export const WALKABLE_HIGHWAYS = new Set([
  'footway',
  'path',
  'pedestrian',
  'steps',
  'living_street',
  'residential',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'service',
  'primary_link',
  'secondary_link',
  'tertiary_link',
])

export const MAX_SNAP_DISTANCE_M = 80

/** Walking pace used for duration estimates: 1.3 m/s ≈ 4.7 km/h. */
export const WALKING_SPEED_MPS = 1.3

export function pointDistanceMeters(from, to) {
  const earthRadiusM = 6_371_000
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLon = toRadians(to.lon - from.lon)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Is this OSM way somewhere a pedestrian on a public sidewalk may walk?
 * Private, no-access, indoor, and motorway-class ways are never walkable.
 * An explicit `foot=yes` rescues an otherwise restricted classification
 * (e.g. a riverside cycleway that formally allows pedestrians).
 */
export function isWalkableWay(way) {
  const tags = way?.tags
  if (!isPlainObject(tags)) return false
  const highway = tags.highway
  if (typeof highway !== 'string') return false
  const footYes = tags.foot === 'yes'
  if (!footYes && !WALKABLE_HIGHWAYS.has(highway)) return false
  if (!footYes && (tags.access === 'private' || tags.access === 'no')) return false
  if (tags.foot === 'private' || tags.foot === 'no') return false
  if (tags.indoor === 'yes' || highway === 'corridor') return false
  return true
}

function nodeKey(coordinate) {
  return `${coordinate[1]},${coordinate[0]}`
}

function keyToCoordinate(key) {
  const [lat, lon] = key.split(',')
  return { lat: Number(lat), lon: Number(lon) }
}

/**
 * Build an undirected walking graph from Overpass ways (`out body geom`):
 * nodes are coordinates, edges connect consecutive geometry positions, and
 * each edge remembers its way's street name. Deterministic: ways are read in
 * snapshot order and parallel edges keep the shortest distance, breaking ties
 * by street name.
 */
const WAY_LABELS = new Map([
  ['footway', 'the sidewalk'],
  ['steps', 'the steps'],
  ['pedestrian', 'the pedestrian way'],
  ['path', 'the path'],
  ['service', 'the service lane'],
])

export function buildWalkGraph(ways) {
  const adjacency = new Map()

  function addEdge(fromKey, toKey, distanceM, streetName, wayKind) {
    if (fromKey === toKey || !(distanceM > 0)) return
    for (const [u, v] of [
      [fromKey, toKey],
      [toKey, fromKey],
    ]) {
      let edges = adjacency.get(u)
      if (!edges) {
        edges = new Map()
        adjacency.set(u, edges)
      }
      const existing = edges.get(v)
      if (
        existing === undefined ||
        distanceM < existing.distanceM ||
        (distanceM === existing.distanceM &&
          (streetName ?? '') < (existing.streetName ?? ''))
      ) {
        edges.set(v, { distanceM, streetName: streetName ?? null, wayKind })
      }
    }
  }

  for (const way of ways) {
    if (!isWalkableWay(way)) continue
    const geometry = Array.isArray(way.geometry) ? way.geometry : []
    const name = typeof way.tags?.name === 'string' ? way.tags.name : null
    const kind = way.tags?.highway ?? 'footway'
    for (let i = 0; i < geometry.length - 1; i++) {
      const from = geometry[i]
      const to = geometry[i + 1]
      if (!isPlainObject(from) || !isPlainObject(to)) continue
      const fromKey = nodeKey([from.lon, from.lat])
      const toKey = nodeKey([to.lon, to.lat])
      addEdge(
        fromKey,
        toKey,
        pointDistanceMeters(
          { lat: from.lat, lon: from.lon },
          { lat: to.lat, lon: to.lon },
        ),
        name,
        kind,
      )
    }
  }

  return { adjacency }
}

/** Nearest graph node to the point, or null when nothing is within the limit. */
export function snapToGraph(graph, point, maxDistanceM = MAX_SNAP_DISTANCE_M) {
  let best = null
  for (const key of graph.adjacency.keys()) {
    const coordinate = keyToCoordinate(key)
    const distance = pointDistanceMeters(point, coordinate)
    if (distance > maxDistanceM) continue
    if (
      best === null ||
      distance < best.distanceM ||
      (distance === best.distanceM && key < best.key)
    ) {
      best = { key, distanceM: distance }
    }
  }
  return best
}

class MinHeap {
  constructor() {
    this.items = []
  }

  push(item) {
    this.items.push(item)
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.before(this.items[i], this.items[parent])) {
        ;[this.items[i], this.items[parent]] = [this.items[parent], this.items[i]]
        i = parent
      } else break
    }
  }

  before(a, b) {
    if (a.distanceM !== b.distanceM) return a.distanceM < b.distanceM
    return a.key < b.key
  }

  pop() {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (
          left < this.items.length &&
          this.before(this.items[left], this.items[smallest])
        )
          smallest = left
        if (
          right < this.items.length &&
          this.before(this.items[right], this.items[smallest])
        )
          smallest = right
        if (smallest === i) break
        ;[this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]]
        i = smallest
      }
    }
    return top
  }

  get size() {
    return this.items.length
  }
}

/**
 * Shortest walking path between two graph nodes. Deterministic: equal-cost
 * candidates tie-break on node key. Returns the node-key path from `fromKey`
 * to `toKey`, or null when no walkable connection exists.
 */
export function shortestPath(graph, fromKey, toKey) {
  if (fromKey === toKey) return [fromKey]
  const distances = new Map([[fromKey, 0]])
  const predecessors = new Map()
  const done = new Set()
  const heap = new MinHeap()
  heap.push({ key: fromKey, distanceM: 0 })

  while (heap.size > 0) {
    const current = heap.pop()
    if (done.has(current.key)) continue
    done.add(current.key)
    if (current.key === toKey) break

    const edges = graph.adjacency.get(current.key)
    if (!edges) continue
    for (const [next, edge] of edges) {
      if (done.has(next)) continue
      const candidate = current.distanceM + edge.distanceM
      if (!distances.has(next) || candidate < distances.get(next)) {
        distances.set(next, candidate)
        predecessors.set(next, current.key)
        heap.push({ key: next, distanceM: candidate })
      }
    }
  }

  if (!distances.has(toKey)) return null
  const path = []
  for (let key = toKey; ; key = predecessors.get(key)) {
    path.push(key)
    if (key === fromKey) break
  }
  return path.reverse()
}

function edgeBetween(graph, fromKey, toKey) {
  return graph.adjacency.get(fromKey)?.get(toKey) ?? null
}

const COMPASS_POINTS = [
  [22.5, 'north'],
  [67.5, 'northeast'],
  [112.5, 'east'],
  [157.5, 'southeast'],
  [202.5, 'south'],
  [247.5, 'southwest'],
  [292.5, 'west'],
  [337.5, 'northwest'],
  [361, 'north'],
]

function compassHeading(bearingDegrees) {
  const normalized = ((bearingDegrees % 360) + 360) % 360
  for (const [limit, label] of COMPASS_POINTS) {
    if (normalized < limit) return label
  }
  return 'north'
}

function bearingDegrees(from, to) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLon = toRadians(to.lon - from.lon)
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Collapse the node path into named-street steps: consecutive edges on the
 * same street merge, so a street split across OSM ways reads as one step.
 * Consecutive unnamed edges of the same kind (sidewalk pieces) merge too.
 */
export function pathSteps(graph, nodePath) {
  const steps = []
  for (let i = 0; i < nodePath.length - 1; i++) {
    const edge = edgeBetween(graph, nodePath[i], nodePath[i + 1])
    if (!edge) continue
    const from = keyToCoordinate(nodePath[i])
    const to = keyToCoordinate(nodePath[i + 1])
    const last = steps[steps.length - 1]
    const sameStreet = last && last.streetName === edge.streetName
    const sameUnnamed =
      last &&
      last.streetName === null &&
      edge.streetName === null &&
      last.kind === edge.wayKind
    if (sameStreet || sameUnnamed) {
      last.to = to
      last.distanceM += edge.distanceM
    } else {
      steps.push({
        streetName: edge.streetName,
        kind: edge.wayKind,
        from,
        to,
        distanceM: edge.distanceM,
      })
    }
  }
  return steps
}

function turnPhrase(before, after) {
  const delta =
    ((bearingDegrees(before.from, before.to) -
      bearingDegrees(after.from, after.to) +
      540) %
      360) -
    180
  if (Math.abs(delta) < 25) return 'continue on'
  if (delta > 0) return 'turn right onto'
  return 'turn left onto'
}

function describeStreet(steps, index) {
  const step = steps[index]
  if (step.streetName) return step.streetName
  const labels = {
    footway: 'the sidewalk',
    steps: 'the steps',
    pedestrian: 'the pedestrian way',
    path: 'the path',
    service: 'the service lane',
  }
  return labels[step.kind] ?? 'the street'
}

/**
 * One honest walking instruction per leg, composed from the streets the path
 * actually follows. Up to three turns are named; anything further collapses
 * into "continue" so instructions stay scannable on a phone.
 */
export function composeInstruction(steps, arrivalName, distanceM) {
  if (steps.length === 0) {
    return `Walk to ${arrivalName} (${formatDistance(distanceM)}).`
  }

  const initialBearing = bearingDegrees(steps[0].from, steps[0].to)
  const parts = [`Head ${compassHeading(initialBearing)} on ${describeStreet(steps, 0)}`]

  const turnLimit = 3
  const turnCount = Math.min(steps.length - 1, turnLimit)
  for (let i = 1; i <= turnCount; i++) {
    parts.push(`${turnPhrase(steps[i - 1], steps[i])} ${describeStreet(steps, i)}`)
  }

  return `${parts.join(', then ')} to ${arrivalName} (${formatDistance(distanceM)}).`
}

function formatDistance(distanceM) {
  return `${Math.round(distanceM)} m`
}

/**
 * Compute the walking route for a tour: one leg per stop pair, in tour order.
 * Legs that cannot be reached on public walkable ways are reported (returned
 * in `unroutableLegs`) rather than silently routed through private property.
 */
export function computeTourRoute(graph, stops) {
  const legs = []
  const unroutableLegs = []
  const snapFailures = []

  for (let i = 0; i < stops.length - 1; i++) {
    const fromStop = stops[i]
    const toStop = stops[i + 1]
    const fromSnap = snapToGraph(graph, fromStop.viewpoint)
    const toSnap = snapToGraph(graph, toStop.viewpoint)

    if (!fromSnap) {
      snapFailures.push(
        `${fromStop.id}: viewpoint is more than ${MAX_SNAP_DISTANCE_M} m from any public walkable way`,
      )
      continue
    }
    if (!toSnap) {
      snapFailures.push(
        `${toStop.id}: viewpoint is more than ${MAX_SNAP_DISTANCE_M} m from any public walkable way`,
      )
      continue
    }

    const nodePath = shortestPath(graph, fromSnap.key, toSnap.key)
    if (!nodePath) {
      unroutableLegs.push(
        `${fromStop.id} -> ${toStop.id}: no path over public walkable ways`,
      )
      continue
    }

    const pathCoordinates = nodePath.map(keyToCoordinate)
    const legCoordinates = [fromStop.viewpoint, ...pathCoordinates, toStop.viewpoint].map(
      (point) => [roundCoordinate(point.lon), roundCoordinate(point.lat)],
    )
    const coordinates = dedupeConsecutive(legCoordinates)

    const distanceM =
      pointDistanceMeters(fromStop.viewpoint, pathCoordinates[0]) +
      pathCoordinates
        .slice(0, -1)
        .reduce(
          (sum, point, index) =>
            sum + pointDistanceMeters(point, pathCoordinates[index + 1]),
          0,
        ) +
      pointDistanceMeters(pathCoordinates[pathCoordinates.length - 1], toStop.viewpoint)

    legs.push({
      from: fromStop.id,
      to: toStop.id,
      toName: toStop.name,
      coordinates,
      distanceM: Math.round(distanceM),
      steps: pathSteps(graph, nodePath),
    })
  }

  return { legs, unroutableLegs, snapFailures }
}

function roundCoordinate(value) {
  return Math.round(value * 1e7) / 1e7
}

function dedupeConsecutive(coordinates) {
  const result = []
  for (const coordinate of coordinates) {
    const previous = result[result.length - 1]
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      result.push(coordinate)
    }
  }
  return result
}

/**
 * Assemble the committed route document. `generatedAt` comes from the OSM
 * snapshot's base timestamp so a rebuild over the same snapshot is
 * byte-for-byte reproducible.
 */
export function buildRouteDocument({ city, tour, legs, baseTimestamp }) {
  const coordinates = []
  for (const leg of legs) {
    const start = coordinates.length === 0 ? 0 : 1
    for (let i = start; i < leg.coordinates.length; i++) {
      coordinates.push(leg.coordinates[i])
    }
  }

  const maneuvers = legs.map((leg) => ({
    from: leg.from,
    to: leg.to,
    instruction: composeInstruction(leg.steps, leg.toName, leg.distanceM),
    distanceM: leg.distanceM,
    durationS: Math.round(leg.distanceM / WALKING_SPEED_MPS),
  }))

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {
          name: `${tour.name} walking route`,
          mode: 'walking',
        },
      },
    ],
    metadata: {
      schemaVersion: 1,
      city,
      tour: tour.id,
      status: 'computed',
      note: `Walking route computed at build time from the committed OSM way snapshot (base timestamp ${baseTimestamp}); public walkable ways only, no live routing.`,
      generatedAt: baseTimestamp,
      stops: tour.stops.map((stop) => stop.id),
      maneuvers,
    },
  }
}
