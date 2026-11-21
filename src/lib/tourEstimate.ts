/**
 * Data-driven tour duration estimate.
 *
 * Walking time comes from the committed route's maneuver `durationS` (computed
 * at build time, never a live routing API). Narration time comes from the tour
 * data at a fixed 150 wpm speaking pace. The two are summed and rounded to the
 * nearest 5 minutes. Returns null when the route is not loaded yet, so the
 * caller can fall back to the stops x 8 min wording.
 *
 * Works per city: both inputs come from the selected city's data, so no city
 * is hard-coded.
 */

import type { RouteFile, Tour } from '../types/tour'

/** Speaking pace used to convert narration word count to time. */
export const NARRATION_WPM = 150

/** Round a duration in minutes to the nearest 5 minutes. */
export function roundTo5(minutes: number): number {
  return Math.round(minutes / 5) * 5
}

/** Count whitespace-separated words in a narration string. */
export function narrationWordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

/**
 * Estimated total tour duration in minutes, rounded to the nearest 5, or null
 * when the route has not loaded.
 */
export function estimateTourMinutes(tour: Tour, route: RouteFile | null): number | null {
  if (!route) return null

  const walkingS = route.metadata.maneuvers.reduce(
    (sum, maneuver) => sum + maneuver.durationS,
    0,
  )
  const narrationS = tour.stops.reduce(
    (sum, stop) => sum + (narrationWordCount(stop.narration) / NARRATION_WPM) * 60,
    0,
  )
  const totalM = (walkingS + narrationS) / 60
  return roundTo5(totalM)
}
