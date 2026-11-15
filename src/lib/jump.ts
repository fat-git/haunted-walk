/**
 * Jump-to-stop guidance.
 *
 * The walking route is precomputed between consecutive stops and committed as
 * `route.geojson`; the app never re-routes. When a walker jumps to a stop they
 * have not walked to (from the start page or the in-tour stop list), the
 * committed leg into that stop starts at the previous stop — a place the
 * walker may nowhere near be. Guidance must then degrade honestly: straight
 * line distance and bearing plus the maps deep links, with no claim of a
 * street-following route that does not apply.
 *
 * All functions here are pure so the jump behaviour can be unit tested
 * against the real tour and route files.
 */

import type { GeoPoint } from './geofence'
import { haversineDistance } from './geofence'
import type { Maneuver, RouteFile, TourStop } from '../types/tour'
import {
  distanceToRouteM as measureDistanceToRouteM,
  getNextManeuver,
  isOffRoutePoint,
} from './route'

export type GuidanceMode = 'leg' | 'straight-line'

export interface StopGuidance {
  /**
   * 'leg': the shown maneuver is the committed walking route that applies.
   * 'straight-line': the walker is not on the committed leg into this stop
   * (or there is no fix to tell), so only distance + bearing + deep links
   * are shown and no maneuver is claimed.
   */
  mode: GuidanceMode
  /** The committed maneuver that applies right now, or null when none. */
  maneuver: Maneuver | null
  /** Straight-line distance to the stop's viewpoint, or null without a fix. */
  straightLineM: number | null
  /** 8-point compass bearing from the walker to the stop, or null. */
  bearing: string | null
}

/**
 * The committed leg into stop `index` (from the previous stop), or null for
 * the first stop. Returns both its maneuver and its slice of the committed
 * LineString, cut at the two viewpoints.
 */
export function incomingLeg(
  route: RouteFile | null,
  stops: TourStop[],
  index: number,
): { maneuver: Maneuver | null; coordinates: Array<[number, number]> | null } {
  if (index <= 0 || index >= stops.length) {
    return { maneuver: null, coordinates: null }
  }
  const from = stops[index - 1]
  const to = stops[index]

  const maneuver =
    route?.metadata.maneuvers.find((m) => m.from === from.id && m.to === to.id) ?? null

  return { maneuver, coordinates: legCoordinates(route, from, to) }
}

/** Slice of the committed route between two stops' viewpoints, inclusive. */
function legCoordinates(
  route: RouteFile | null,
  from: TourStop,
  to: TourStop,
): Array<[number, number]> | null {
  const coords = route?.features[0]?.geometry.coordinates
  if (!coords || coords.length === 0) return null

  const fromPoint: [number, number] = [from.viewpoint.lon, from.viewpoint.lat]
  const toPoint: [number, number] = [to.viewpoint.lon, to.viewpoint.lat]
  const fromIdx = indexOfPoint(coords, fromPoint)
  const toIdx = indexOfPoint(coords, toPoint)
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return null

  return coords.slice(fromIdx, toIdx + 1)
}

function indexOfPoint(coords: Array<[number, number]>, point: [number, number]): number {
  return coords.findIndex((c) => c[0] === point[0] && c[1] === point[1])
}

/** Initial bearing from `from` to `to`, snapped to an 8-point compass. */
export function compassBearing(from: GeoPoint, to: GeoPoint): string {
  const rad = Math.PI / 180
  const lat1 = from.lat * rad
  const lat2 = to.lat * rad
  const dLon = (to.lon - from.lon) * rad

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const deg = (Math.atan2(y, x) / rad + 360) % 360

  const points = [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ]
  return points[Math.round(deg / 45) % 8]
}

/**
 * Guidance for the current stop. Mirrors the pre-jump behaviour whenever the
 * walker is where the committed route says they should be:
 *
 * - Stop 1 (index 0): outgoing leg, as always.
 * - At the stop: outgoing leg to the next stop, as always.
 * - Walking a committed leg into the current stop: that leg's maneuver.
 * - Anything else (jumped in, or no fix to tell): straight-line guidance.
 */
export function getStopGuidance(params: {
  route: RouteFile | null
  stops: TourStop[]
  currentStopIndex: number
  isAtStop: boolean
  userPosition: GeoPoint | null
  userAccuracyM: number | null
}): StopGuidance {
  const { route, stops, currentStopIndex, isAtStop, userPosition, userAccuracyM } = params
  const stop = stops[currentStopIndex]
  if (!stop) {
    return { mode: 'straight-line', maneuver: null, straightLineM: null, bearing: null }
  }

  const straightLine =
    userPosition !== null ? haversineDistance(userPosition, stop.viewpoint) : null
  const bearing =
    userPosition !== null ? compassBearing(userPosition, stop.viewpoint) : null

  // Stop 1, or standing at the stop: the outgoing leg applies, as before jumps existed.
  if (currentStopIndex === 0 || isAtStop) {
    return {
      mode: 'leg',
      maneuver: getNextManeuver(route, stops, currentStopIndex),
      straightLineM: straightLine,
      bearing,
    }
  }

  const leg = incomingLeg(route, stops, currentStopIndex)
  if (userPosition !== null && leg.coordinates && leg.coordinates.length > 1) {
    const distanceToLegM = measureDistanceToRouteM(userPosition, leg.coordinates)
    if (!isOffRoutePoint(distanceToLegM, userAccuracyM)) {
      // The walker is genuinely on the committed leg into this stop.
      return { mode: 'leg', maneuver: leg.maneuver, straightLineM: straightLine, bearing }
    }
  }

  return { mode: 'straight-line', maneuver: null, straightLineM: straightLine, bearing }
}

/** Clamp/validate a jump target against the tour's stop list. */
export function resolveJumpIndex(stops: TourStop[], index: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= stops.length) return null
  return index
}
