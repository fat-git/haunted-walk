/**
 * Geofence engine for tour stop detection.
 *
 * Uses haversine distance with hysteresis (enter at 30m, exit at 45m)
 * and requires two consecutive fixes before firing. Ignores fixes with
 * accuracy worse than ~50m.
 */

export interface GeoPoint {
  lat: number
  lon: number
}

export interface GeofenceConfig {
  enterRadiusM: number
  exitRadiusM: number
  minAccuracyM: number
  requiredConsecutiveFixes: number
}

export interface GeofenceState {
  isInside: boolean
  consecutiveFixes: number
  lastDistanceM: number | null
}

export interface StopGeofence {
  stopId: string
  center: GeoPoint
  enterRadiusM: number
  exitRadiusM: number
  state: GeofenceState
}

/** Earth radius in meters. */
const EARTH_RADIUS_M = 6371000

/** Default geofence configuration. */
export const DEFAULT_GEOFENCE_CONFIG: GeofenceConfig = {
  enterRadiusM: 30,
  exitRadiusM: 45,
  minAccuracyM: 50,
  requiredConsecutiveFixes: 2,
}

/**
 * Calculate haversine distance between two points in meters.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)

  const h = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Create initial geofence state for a stop.
 */
export function createStopGeofence(
  stopId: string,
  center: GeoPoint,
  enterRadiusM: number,
  exitRadiusM: number,
): StopGeofence {
  return {
    stopId,
    center,
    enterRadiusM,
    exitRadiusM,
    state: {
      isInside: false,
      consecutiveFixes: 0,
      lastDistanceM: null,
    },
  }
}

/**
 * Update geofence state with a new GPS fix.
 * Returns true if the stop was just entered (trigger narration).
 */
export function updateGeofence(
  geofence: StopGeofence,
  userPosition: GeoPoint,
  accuracyM: number,
): { entered: boolean; exited: boolean; distanceM: number } {
  const distanceM = haversineDistance(geofence.center, userPosition)

  // Ignore fixes with poor accuracy
  if (accuracyM > DEFAULT_GEOFENCE_CONFIG.minAccuracyM) {
    return { entered: false, exited: false, distanceM }
  }

  const { state } = geofence
  const enterRadius = geofence.enterRadiusM
  const exitRadius = geofence.exitRadiusM

  let entered = false
  let exited = false

  if (!state.isInside) {
    // Currently outside: check for entry
    if (distanceM <= enterRadius) {
      state.consecutiveFixes += 1
      if (state.consecutiveFixes >= DEFAULT_GEOFENCE_CONFIG.requiredConsecutiveFixes) {
        state.isInside = true
        state.consecutiveFixes = 0
        entered = true
      }
    } else {
      state.consecutiveFixes = 0
    }
  } else {
    // Currently inside: check for exit (hysteresis)
    if (distanceM >= exitRadius) {
      state.consecutiveFixes += 1
      if (state.consecutiveFixes >= DEFAULT_GEOFENCE_CONFIG.requiredConsecutiveFixes) {
        state.isInside = false
        state.consecutiveFixes = 0
        exited = true
      }
    } else {
      state.consecutiveFixes = 0
    }
  }

  state.lastDistanceM = distanceM
  return { entered, exited, distanceM }
}

/**
 * Reset geofence state (e.g., when manually skipping to a stop).
 */
export function resetGeofence(geofence: StopGeofence): void {
  geofence.state = {
    isInside: false,
    consecutiveFixes: 0,
    lastDistanceM: null,
  }
}
