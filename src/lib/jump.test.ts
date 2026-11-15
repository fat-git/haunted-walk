/**
 * FAT-47 unit tests: jump-to-stop logic.
 *
 * Covers starting the tour at index N, guidance degradation when the walker
 * is not on the committed leg into the chosen stop, and geofence state reset
 * when re-jumping (no stale "inside geofence" flags). Uses the real tour.json
 * and route.geojson so the assertions hold for the shipped data contract.
 */
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { compassBearing, getStopGuidance, incomingLeg, resolveJumpIndex } from './jump'
import { createStopGeofence, resetGeofence, updateGeofence } from './geofence'
import { getNextManeuver } from './route'
import type { RouteFile, Tour, TourStop } from '../types/tour'

const TOUR: Tour = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)
const ROUTE: RouteFile = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/route.geojson', import.meta.url),
    'utf8',
  ),
)

const stops: TourStop[] = TOUR.stops
const routeCoords: Array<[number, number]> = ROUTE.features[0].geometry.coordinates

describe('compassBearing', () => {
  const origin = { lat: 0, lon: 0 }
  it('names the eight compass points', () => {
    expect(compassBearing(origin, { lat: 1, lon: 0 })).toBe('north')
    expect(compassBearing(origin, { lat: 0, lon: 1 })).toBe('east')
    expect(compassBearing(origin, { lat: -1, lon: 0 })).toBe('south')
    expect(compassBearing(origin, { lat: 0, lon: -1 })).toBe('west')
    expect(compassBearing(origin, { lat: 1, lon: 1 })).toBe('north-east')
    expect(compassBearing(origin, { lat: -1, lon: 1 })).toBe('south-east')
    expect(compassBearing(origin, { lat: -1, lon: -1 })).toBe('south-west')
    expect(compassBearing(origin, { lat: 1, lon: -1 })).toBe('north-west')
  })
})

describe('incomingLeg', () => {
  it('has no leg for the first stop or out-of-range indices', () => {
    expect(incomingLeg(ROUTE, stops, 0)).toEqual({ maneuver: null, coordinates: null })
    expect(incomingLeg(ROUTE, stops, -1)).toEqual({ maneuver: null, coordinates: null })
    expect(incomingLeg(ROUTE, stops, stops.length)).toEqual({
      maneuver: null,
      coordinates: null,
    })
  })

  it('returns the committed maneuver and leg slice for a mid-tour stop', () => {
    const index = 3
    const leg = incomingLeg(ROUTE, stops, index)
    expect(leg.maneuver?.from).toBe(stops[index - 1].id)
    expect(leg.maneuver?.to).toBe(stops[index].id)
    expect(leg.coordinates).not.toBeNull()
    const coords = leg.coordinates as Array<[number, number]>
    expect(coords[0]).toEqual([
      stops[index - 1].viewpoint.lon,
      stops[index - 1].viewpoint.lat,
    ])
    expect(coords[coords.length - 1]).toEqual([
      stops[index].viewpoint.lon,
      stops[index].viewpoint.lat,
    ])
  })
})

describe('getStopGuidance', () => {
  it('starts at stop 1 with the outgoing leg, even without a GPS fix', () => {
    const guidance = getStopGuidance({
      route: ROUTE,
      stops,
      currentStopIndex: 0,
      isAtStop: false,
      userPosition: null,
      userAccuracyM: null,
    })
    expect(guidance.mode).toBe('leg')
    expect(guidance.maneuver?.from).toBe(stops[0].id)
    expect(guidance.maneuver?.to).toBe(stops[1].id)
    expect(guidance.maneuver).toEqual(getNextManeuver(ROUTE, stops, 0))
  })

  it('at any stop shows the outgoing leg to the next stop', () => {
    const index = 4
    const guidance = getStopGuidance({
      route: ROUTE,
      stops,
      currentStopIndex: index,
      isAtStop: true,
      userPosition: stops[index].viewpoint,
      userAccuracyM: 8,
    })
    expect(guidance.mode).toBe('leg')
    expect(guidance.maneuver?.from).toBe(stops[index].id)
    expect(guidance.maneuver?.to).toBe(stops[index + 1].id)
  })

  it('on the committed leg into the jumped-to stop shows that leg', () => {
    const index = 3
    const coords = incomingLeg(ROUTE, stops, index).coordinates as Array<[number, number]>
    // Stand on the leg, a few segments in from its start.
    const position = { lat: coords[2][1], lon: coords[2][0] }
    const guidance = getStopGuidance({
      route: ROUTE,
      stops,
      currentStopIndex: index,
      isAtStop: false,
      userPosition: position,
      userAccuracyM: 8,
    })
    expect(guidance.mode).toBe('leg')
    expect(guidance.maneuver?.from).toBe(stops[index - 1].id)
    expect(guidance.maneuver?.to).toBe(stops[index].id)
  })

  it('degrades to straight-line guidance when the walker jumped from afar', () => {
    const index = 3
    const position = stops[8].viewpoint // nowhere near the leg into stop 4
    const guidance = getStopGuidance({
      route: ROUTE,
      stops,
      currentStopIndex: index,
      isAtStop: false,
      userPosition: position,
      userAccuracyM: 8,
    })
    expect(guidance.mode).toBe('straight-line')
    // Degraded guidance must not claim a street-following maneuver.
    expect(guidance.maneuver).toBeNull()
    expect(guidance.straightLineM).toBeGreaterThan(0)
    expect(guidance.bearing).not.toBeNull()
  })

  it('degrades with no distance or bearing when there is no GPS fix', () => {
    const guidance = getStopGuidance({
      route: ROUTE,
      stops,
      currentStopIndex: 5,
      isAtStop: false,
      userPosition: null,
      userAccuracyM: null,
    })
    expect(guidance.mode).toBe('straight-line')
    expect(guidance.maneuver).toBeNull()
    expect(guidance.straightLineM).toBeNull()
    expect(guidance.bearing).toBeNull()
  })
})

describe('resolveJumpIndex', () => {
  it('accepts in-range integer indices and rejects the rest', () => {
    expect(resolveJumpIndex(stops, 0)).toBe(0)
    expect(resolveJumpIndex(stops, stops.length - 1)).toBe(stops.length - 1)
    expect(resolveJumpIndex(stops, -1)).toBeNull()
    expect(resolveJumpIndex(stops, stops.length)).toBeNull()
    expect(resolveJumpIndex(stops, 1.5)).toBeNull()
  })
})

describe('re-jump resets geofence state', () => {
  it('a stop reached, left, and re-jumped detects entry again from scratch', () => {
    const target = stops[2]
    const geofence = createStopGeofence(
      target.id,
      { lat: target.lat, lon: target.lon },
      target.geofenceRadiusM,
      target.geofenceRadiusM + 15,
    )

    // Walker arrives: two consecutive fixes inside the geofence fire entry.
    updateGeofence(geofence, target.viewpoint, 8)
    const entered = updateGeofence(geofence, target.viewpoint, 8)
    expect(entered.entered).toBe(true)
    expect(geofence.state.isInside).toBe(true)

    // Jump away to an earlier stop, then re-jump back: jumpToStop resets the
    // target's geofence, so no stale "inside" flag survives.
    resetGeofence(geofence)
    expect(geofence.state.isInside).toBe(false)
    expect(geofence.state.consecutiveFixes).toBe(0)
    expect(geofence.state.lastDistanceM).toBeNull()

    // Standing at the re-jumped stop, entry fires again for auto-narration.
    updateGeofence(geofence, target.viewpoint, 8)
    const reEntered = updateGeofence(geofence, target.viewpoint, 8)
    expect(reEntered.entered).toBe(true)
  })

  it('a jump route through several stops leaves every visited fence fresh on re-jump', () => {
    const geofences = stops.map((stop) =>
      createStopGeofence(
        stop.id,
        { lat: stop.lat, lon: stop.lon },
        stop.geofenceRadiusM,
        stop.geofenceRadiusM + 15,
      ),
    )

    // jumpToStop contract: only the jump target's fence is reset; the stop
    // being left is no longer consulted, and any later arrival (sequential
    // or jumped) resets its fence as the new current stop.

    // Walk into stop 3: entry fires, fence marked inside.
    updateGeofence(geofences[2], stops[2].viewpoint, 8)
    updateGeofence(geofences[2], stops[2].viewpoint, 8)
    expect(geofences[2].state.isInside).toBe(true)

    // Jump to stop 8: the target fence starts fresh.
    resetGeofence(geofences[7])
    expect(geofences[7].state.isInside).toBe(false)

    // Jump back to stop 1: the target fence starts fresh.
    resetGeofence(geofences[0])
    expect(geofences[0].state.isInside).toBe(false)

    // Re-jump to stop 3: it is reset as the new current stop, so no stale
    // "already inside" flag survives.
    resetGeofence(geofences[2])
    expect(geofences[2].state.isInside).toBe(false)
    expect(geofences[2].state.consecutiveFixes).toBe(0)

    for (const fence of [geofences[0], geofences[2], geofences[7]]) {
      expect(fence.state.consecutiveFixes).toBe(0)
    }
  })
})

describe('jump guidance against the committed route', () => {
  it('every stop has a viewpoint on the route line, so legs are extractable', () => {
    for (let i = 1; i < stops.length; i++) {
      const leg = incomingLeg(ROUTE, stops, i)
      expect(leg.coordinates).not.toBeNull()
      expect((leg.coordinates as Array<[number, number]>).length).toBeGreaterThan(1)
    }
  })

  it('the leg slice lies within the full committed route', () => {
    const coords = incomingLeg(ROUTE, stops, 2).coordinates as Array<[number, number]>
    for (const c of coords) {
      expect(routeCoords.some((rc) => rc[0] === c[0] && rc[1] === c[1])).toBe(true)
    }
  })
})
