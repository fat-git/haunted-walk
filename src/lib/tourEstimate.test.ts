/**
 * FAT-76 item 4: data-driven tour duration estimate.
 *
 * Walking time comes from the committed route's maneuver `durationS`; narration
 * time from the tour data at 150 wpm; the sum is rounded to the nearest 5
 * minutes. Works per city from the selected city's data — no city constants.
 * Returns null when the route is not loaded, so the caller falls back to the
 * stops x 8 min wording.
 */

import { describe, expect, it } from 'vitest'
import {
  estimateTourMinutes,
  NARRATION_WPM,
  narrationWordCount,
  roundTo5,
} from './tourEstimate'
import type { Maneuver, RouteFile, Tour, TourStop } from '../types/tour'

function stop(id: string, narration: string): TourStop {
  return {
    id,
    name: `Stop ${id}`,
    lat: 0,
    lon: 0,
    address: '',
    viewpoint: { lat: 0, lon: 0, access: 'public-sidewalk', description: '' },
    geofenceRadiusM: 30,
    narration,
    legendLabel: 'Legend',
    sources: [],
  }
}

function routeFor(city: string, maneuvers: Maneuver[]): RouteFile {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      },
    ],
    metadata: {
      schemaVersion: 1,
      city,
      tour: `${city}-tour`,
      status: 'computed',
      generatedAt: '2026-01-01T00:00:00Z',
      stops: maneuvers.map((m) => m.from),
      maneuvers,
    },
  }
}

function tourFor(city: string, stops: TourStop[]): Tour {
  return {
    schemaVersion: 1,
    id: `${city}-tour`,
    city,
    name: `${city} Tour`,
    description: 'A test tour.',
    stops,
  }
}

describe('roundTo5', () => {
  it('rounds to the nearest 5 minutes', () => {
    expect(roundTo5(62)).toBe(60)
    expect(roundTo5(63)).toBe(65)
    expect(roundTo5(67)).toBe(65)
    expect(roundTo5(68)).toBe(70)
  })
})

describe('narrationWordCount', () => {
  it('counts words and ignores empty text', () => {
    expect(narrationWordCount('')).toBe(0)
    expect(narrationWordCount('one two three')).toBe(3)
    expect(narrationWordCount('  spaced   out  ')).toBe(2)
  })
})

describe('estimateTourMinutes', () => {
  const newOrleans = tourFor('new-orleans-fq', [
    stop('a', 'One two three four five six seven eight nine ten'),
    stop(
      'b',
      'Eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
    ),
  ])
  const nashville = tourFor('nashville-downtown', [
    stop('x', 'Word.'),
    stop('y', 'Two words here now.'),
  ])

  it('derives a per-city estimate from route durationS plus narration at 150 wpm', () => {
    // New Orleans: 4 min walk + (30 words / 150 wpm) = 4 min + 0.2 min = 4.2 -> 5 min
    const noEstimate = estimateTourMinutes(
      newOrleans,
      routeFor('new-orleans-fq', [
        { from: 'a', to: 'b', instruction: 'walk', distanceM: 400, durationS: 240 },
      ]),
    )
    expect(noEstimate).toBe(5)

    // Nashville: 1 min walk + (4 words / 150 wpm) = 1 min + 0.026 min -> 0 min (rounds to 0)
    const nsEstimate = estimateTourMinutes(
      nashville,
      routeFor('nashville-downtown', [
        { from: 'x', to: 'y', instruction: 'walk', distanceM: 100, durationS: 60 },
      ]),
    )
    expect(nsEstimate).toBe(0)

    // Different cities with the same stops differ only via route+narration data.
    expect(noEstimate).not.toBe(nsEstimate)
  })

  it('rounds the summed walking + narration time to the nearest 5', () => {
    const t = tourFor('city', [stop('s', 'a b c d e f g h i j k l m n o p')]) // 16 words
    const r = routeFor('city', [
      { from: 's', to: 's', instruction: 'walk', distanceM: 1000, durationS: 600 }, // 10 min walk
    ])
    // 10 min walk + 16/150 min narration (0.107) = 10.107 -> 10 min
    expect(estimateTourMinutes(t, r)).toBe(10)
  })

  it('returns null when the route is not loaded, so the caller falls back', () => {
    expect(estimateTourMinutes(newOrleans, null)).toBeNull()
  })

  it('uses 150 wpm for narration time', () => {
    expect(NARRATION_WPM).toBe(150)
  })
})
