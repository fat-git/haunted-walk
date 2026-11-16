/**
 * FAT-97: geofences must follow the active tour. useTour rebuilds its
 * geofence map with `rebuildStopGeofences` whenever `tour.stops` changes, so
 * after a city swap every lookup by the new city's stop ids succeeds.
 */
import { describe, expect, it } from 'vitest'
import { rebuildStopGeofences, updateGeofence, type StopGeofence } from './geofence'

const CITY_A = [
  { id: 'a-1', lat: 29.95, lon: -90.06, geofenceRadiusM: 30 },
  { id: 'a-2', lat: 29.951, lon: -90.061, geofenceRadiusM: 25 },
]
const CITY_B = [
  { id: 'b-1', lat: 41.88, lon: -87.63, geofenceRadiusM: 40 },
  { id: 'b-2', lat: 41.881, lon: -87.631, geofenceRadiusM: 35 },
  { id: 'b-3', lat: 41.882, lon: -87.632, geofenceRadiusM: 20 },
]

describe('rebuildStopGeofences', () => {
  it('creates one geofence per stop with the stop radius and a wider exit radius', () => {
    const map = new Map<string, StopGeofence>()
    rebuildStopGeofences(map, CITY_A)
    expect([...map.keys()]).toEqual(['a-1', 'a-2'])
    const first = map.get('a-1')!
    expect(first.center).toEqual({ lat: 29.95, lon: -90.06 })
    expect(first.enterRadiusM).toBe(30)
    expect(first.exitRadiusM).toBe(45)
  })

  it('replaces the previous city geofences when the tour is swapped', () => {
    const map = new Map<string, StopGeofence>()
    rebuildStopGeofences(map, CITY_A)
    rebuildStopGeofences(map, CITY_B)
    expect([...map.keys()]).toEqual(['b-1', 'b-2', 'b-3'])
    expect(map.get('a-1')).toBeUndefined()
    for (const stop of CITY_B) expect(map.get(stop.id)).toBeDefined()
  })

  it('produces working geofences for the new city (arrival detected)', () => {
    const map = new Map<string, StopGeofence>()
    rebuildStopGeofences(map, CITY_A)
    rebuildStopGeofences(map, CITY_B)
    const geofence = map.get('b-1')!
    let entered = false
    for (let i = 0; i < 5 && !entered; i++) {
      entered = updateGeofence(geofence, { lat: 41.88, lon: -87.63 }, 5).entered
    }
    expect(entered).toBe(true)
  })

  it('clears everything for an empty stop list', () => {
    const map = new Map<string, StopGeofence>()
    rebuildStopGeofences(map, CITY_A)
    rebuildStopGeofences(map, [])
    expect(map.size).toBe(0)
  })
})
