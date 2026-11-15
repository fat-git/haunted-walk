/**
 * Route guidance helpers.
 *
 * The route is computed at build time and committed (`route.geojson`); the app
 * never re-routes. These helpers read the committed maneuver list and detect
 * when the walker has left the routed line, so the UI can say so and offer the
 * maps deep link as the escape hatch.
 */

import type { GeoPoint } from './geofence'
import { haversineDistance } from './geofence'
import type { Maneuver, RouteFile, TourStop } from '../types/tour'

/**
 * How far past the routed line the walker must be before the UI says they are
 * off route. Added to twice the current fix accuracy, so a noisy fix in the
 * Quarter's urban canyon does not cry wolf.
 */
export const OFF_ROUTE_THRESHOLD_M = 100

/**
 * The maneuver for the leg the walker is on: from the current stop to the
 * next one. Null at the final stop, when the route is missing, or when the
 * committed list does not cover this leg.
 */
export function getNextManeuver(
  route: RouteFile | null,
  stops: TourStop[],
  currentStopIndex: number,
): Maneuver | null {
  if (!route) return null

  const maneuvers = route.metadata.maneuvers
  if (maneuvers.length === 0) return null

  const from = stops[currentStopIndex]?.id
  const to = stops[currentStopIndex + 1]?.id
  if (from !== undefined && to !== undefined) {
    const byLeg = maneuvers.find((m) => m.from === from && m.to === to)
    if (byLeg) return byLeg
  }

  return maneuvers[currentStopIndex] ?? null
}

/**
 * Shortest distance in meters from a point to the route's LineString.
 * Uses an equirectangular projection around each segment's midpoint, which is
 * exact enough at walking-tour scale.
 */
export function distanceToRouteM(
  point: GeoPoint,
  coordinates: Array<[number, number]>,
): number {
  if (coordinates.length === 0) return Number.POSITIVE_INFINITY
  if (coordinates.length === 1) {
    return haversineDistance(point, { lat: coordinates[0][1], lon: coordinates[0][0] })
  }

  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < coordinates.length - 1; i++) {
    const d = pointToSegmentM(point, coordinates[i], coordinates[i + 1])
    if (d < min) min = d
  }
  return min
}

function pointToSegmentM(
  point: GeoPoint,
  a: [number, number],
  b: [number, number],
): number {
  // GeoJSON coordinates are [lon, lat].
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const metersPerDegLon = Math.cos(midLat) * 111320
  const metersPerDegLat = 110540

  const ax = (a[0] - b[0]) * metersPerDegLon
  const ay = (a[1] - b[1]) * metersPerDegLat
  const px = (point.lon - b[0]) * metersPerDegLon
  const py = (point.lat - b[1]) * metersPerDegLat

  const lenSq = ax * ax + ay * ay
  let t = lenSq === 0 ? 0 : (px * ax + py * ay) / lenSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - t * ax, py - t * ay)
}

/**
 * Off-route verdict. Conservative: the base threshold grows with the fix's
 * stated accuracy, so a bad fix cannot put the walker "off route" by itself.
 */
export function isOffRoutePoint(
  distanceToRouteM: number,
  accuracyM: number | null,
): boolean {
  const accuracyPad = accuracyM != null && accuracyM > 0 ? accuracyM * 2 : 0
  return distanceToRouteM > OFF_ROUTE_THRESHOLD_M + accuracyPad
}
