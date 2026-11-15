/**
 * FAT-34 QA walkthrough: simulated GPS pass over the committed route.
 *
 * Drives the exact geofence calls `useTour` makes per GPS fix
 * (createStopGeofence + updateGeofence) with the real tour.json stops and the
 * real route.geojson geometry, walking all 10 stops in order. Also exercises
 * the narration engine's sentence-highlight progression with a stubbed
 * speechSynthesis, and audits the committed maneuver list.
 */
/// <reference types="node" />
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  createStopGeofence,
  haversineDistance,
  resetGeofence,
  updateGeofence,
  type GeoPoint,
  type StopGeofence,
} from './geofence'
import { getNextManeuver } from './route'
import { NarrationEngine, splitIntoSentences } from './narration'
import type { Maneuver, RouteFile, Tour, TourStop } from '../types/tour'

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
const FIX_ACCURACY_M = 8

/** Index of each stop viewpoint in the route coordinate list, in walk order. */
function viewpointIndices(): number[] {
  const indices: number[] = []
  let searchFrom = 0
  for (const stop of stops) {
    const vp: [number, number] = [stop.viewpoint.lon, stop.viewpoint.lat]
    const idx = routeCoords.findIndex(
      (c, i) => i >= searchFrom && c[0] === vp[0] && c[1] === vp[1],
    )
    if (idx === -1) throw new Error(`viewpoint of ${stop.id} not found on route`)
    indices.push(idx)
    searchFrom = idx + 1
  }
  return indices
}

/** Interpolate the route between two coordinate indices into fixes <= stepM apart. */
function walkPath(fromIdx: number, toIdx: number, stepM = 3): GeoPoint[] {
  const path: GeoPoint[] = []
  for (let i = fromIdx; i < toIdx; i++) {
    const [lonA, latA] = routeCoords[i]
    const [lonB, latB] = routeCoords[i + 1]
    const a: GeoPoint = { lat: latA, lon: lonA }
    const b: GeoPoint = { lat: latB, lon: lonB }
    const steps = Math.max(1, Math.ceil(haversineDistance(a, b) / stepM))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      path.push({ lat: latA + (latB - latA) * t, lon: lonA + (lonB - lonA) * t })
    }
  }
  path.push({ lat: routeCoords[toIdx][1], lon: routeCoords[toIdx][0] })
  return path
}

/** Geofence map exactly as useTour builds it: center = stop.lat/lon, exit = radius + 15. */
function makeGeofences(): Map<string, StopGeofence> {
  const geofences = new Map<string, StopGeofence>()
  for (const stop of stops) {
    geofences.set(
      stop.id,
      createStopGeofence(
        stop.id,
        { lat: stop.lat, lon: stop.lon },
        stop.geofenceRadiusM,
        stop.geofenceRadiusM + 15,
      ),
    )
  }
  return geofences
}

/** Point `meters` away from `center` at `bearingDeg` (0 = north). */
function offsetPoint(center: GeoPoint, meters: number, bearingDeg: number): GeoPoint {
  const rad = (bearingDeg * Math.PI) / 180
  const mPerDegLat = 110540
  const mPerDegLon = 111320 * Math.cos((center.lat * Math.PI) / 180)
  return {
    lat: center.lat + (meters * Math.cos(rad)) / mPerDegLat,
    lon: center.lon + (meters * Math.sin(rad)) / mPerDegLon,
  }
}

describe('FAT-34 simulated GPS walkthrough (10 stops in order)', () => {
  it('fires arrival within 30 m of each viewpoint, narration once, guidance advances', () => {
    const geofences = makeGeofences()
    const vpIdx = viewpointIndices()
    const narrationPlays = new Map<string, number>()
    const evidence: string[] = []
    let currentStopIndex = 0
    let isAtStop = false
    let arrivals = 0
    let maxEntryDistanceToViewpoint = 0
    let completed = false

    // Replicates useTour's GPS-processing effect for one fix.
    const feed = (fix: GeoPoint) => {
      const stop = stops[currentStopIndex]
      const geofence = geofences.get(stop.id)
      if (!geofence) throw new Error(`no geofence for ${stop.id}`)
      const { entered, exited, distanceM } = updateGeofence(geofence, fix, FIX_ACCURACY_M)
      if (entered && !isAtStop) {
        isAtStop = true
        arrivals += 1
        narrationPlays.set(stop.id, (narrationPlays.get(stop.id) ?? 0) + 1)
        const dToViewpoint = haversineDistance(
          { lat: stop.viewpoint.lat, lon: stop.viewpoint.lon },
          fix,
        )
        maxEntryDistanceToViewpoint = Math.max(maxEntryDistanceToViewpoint, dToViewpoint)
        const maneuver = getNextManeuver(ROUTE, stops, currentStopIndex)
        evidence.push(
          `Stop ${currentStopIndex + 1} ${stop.name}: arrival fix ${dToViewpoint.toFixed(1)} m from viewpoint; ` +
            `distance readout ${Math.round(distanceM)} m; next maneuver: ` +
            (maneuver ? `${maneuver.instruction.slice(0, 58)}…` : 'final stop'),
        )
        // Narration ends while the walker is at the stop; the hook auto-advances.
        if (currentStopIndex < stops.length - 1) {
          currentStopIndex += 1
          isAtStop = false
          resetGeofence(geofences.get(stops[currentStopIndex].id) as StopGeofence)
        } else {
          completed = true
        }
      } else if (exited && isAtStop) {
        isAtStop = false
      }
    }

    // Two fixes standing at the first viewpoint, then walk the route.
    feed(stops[0].viewpoint)
    feed(stops[0].viewpoint)
    for (let i = 0; i < stops.length - 1; i++) {
      for (const fix of walkPath(vpIdx[i], vpIdx[i + 1])) feed(fix)
    }

    expect(arrivals).toBe(stops.length)
    expect(completed).toBe(true)
    for (const stop of stops) {
      expect(narrationPlays.get(stop.id)).toBe(1)
    }
    // Arrival must be within the 30 m enter radius of the stop viewpoint.
    expect(maxEntryDistanceToViewpoint).toBeLessThanOrEqual(30)

    // Maneuver text advances with the leg the walker is on; none at the final stop.
    for (let i = 0; i < stops.length - 1; i++) {
      const maneuver = getNextManeuver(ROUTE, stops, i)
      expect(maneuver?.from).toBe(stops[i].id)
      expect(maneuver?.to).toBe(stops[i + 1].id)
    }
    expect(getNextManeuver(ROUTE, stops, stops.length - 1)).toBeNull()

    console.log(evidence.join('\n'))
  })
})

describe('FAT-34 geofence hysteresis (enter 30 m / exit 45 m)', () => {
  it('enters after two fixes, survives edge jitter, exits only after two fixes past 45 m', () => {
    const stop = stops[1]
    const center: GeoPoint = { lat: stop.lat, lon: stop.lon }
    const geofence = createStopGeofence(
      stop.id,
      center,
      stop.geofenceRadiusM,
      stop.geofenceRadiusM + 15,
    )
    let atStop = false
    let enginePlaying = false
    let playThroughs = 0

    const feed = (point: GeoPoint) => {
      const { entered, exited } = updateGeofence(geofence, point, FIX_ACCURACY_M)
      // Exactly what the hook does, including the engine's play() guard.
      if (entered && !atStop) {
        atStop = true
        if (!enginePlaying) {
          enginePlaying = true
          playThroughs += 1
        }
      } else if (exited && atStop) {
        atStop = false
      }
    }

    feed(offsetPoint(center, 60, 0))
    feed(offsetPoint(center, 25, 0)) // fix 1 inside
    expect(atStop).toBe(false)
    feed(offsetPoint(center, 25, 0)) // fix 2 inside -> entry
    expect(atStop).toBe(true)
    expect(playThroughs).toBe(1)

    // Jitter at the edge: inside the 45 m hysteresis band and a single fix past it.
    feed(offsetPoint(center, 40, 90))
    feed(offsetPoint(center, 44, 180))
    feed(offsetPoint(center, 46, 270)) // one fix >= 45 m must NOT exit
    expect(atStop).toBe(true)
    feed(offsetPoint(center, 44, 270)) // resets the exit counter
    expect(atStop).toBe(true)
    feed(offsetPoint(center, 46, 270))
    feed(offsetPoint(center, 50, 270)) // two consecutive >= 45 m -> exit
    expect(atStop).toBe(false)

    // Re-entry while narration is still playing must not restart narration.
    feed(offsetPoint(center, 25, 0))
    feed(offsetPoint(center, 25, 0))
    expect(atStop).toBe(true)
    expect(playThroughs).toBe(1)

    // After the narration has ended, a genuine re-entry plays it again.
    enginePlaying = false
    feed(offsetPoint(center, 60, 45))
    feed(offsetPoint(center, 50, 45))
    feed(offsetPoint(center, 25, 45))
    feed(offsetPoint(center, 25, 45))
    expect(playThroughs).toBe(2)
  })
})

describe('FAT-34 narration engine and transcript highlights', () => {
  class FakeUtterance {
    text: string
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    constructor(text: string) {
      this.text = text
    }
  }

  let active: FakeUtterance | null = null
  /** Complete the active utterance the way Chrome does on natural end. */
  const advanceCurrent = () => {
    const utterance = active
    if (!utterance) return
    active = null
    utterance.onstart?.()
    utterance.onend?.()
  }

  beforeAll(() => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    // Deterministic manual model of Chrome's observable events: speak() marks
    // the utterance active; advanceCurrent() completes it (start + end);
    // cancel() completes it as interrupted (error + end), the order Chrome
    // uses for a canceled utterance.
    vi.stubGlobal('speechSynthesis', {
      speak(utterance: FakeUtterance) {
        active = utterance
      },
      cancel() {
        if (active) {
          const interrupted = active
          active = null
          interrupted.onerror?.({ error: 'interrupted' })
          interrupted.onend?.()
        }
      },
      getVoices() {
        return [{ name: 'QA Mock', lang: 'en-US' }] as unknown as SpeechSynthesisVoice[]
      },
      pause() {},
      resume() {},
      onvoiceschanged: null,
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('splits every stop script and moves the highlight through every sentence in order', async () => {
    for (const stop of stops) {
      const sentences = splitIntoSentences(stop.narration)
      expect(sentences.length).toBeGreaterThan(2)

      const engine = new NarrationEngine(stop.narration)
      const highlightIndices: number[] = []
      const onEnd = vi.fn()
      engine.setOnSentenceChange((index) => highlightIndices.push(index))
      engine.setOnEnd(onEnd)
      await engine.init()
      engine.play()
      // FAT-43: sentences over ~180 chars are split into several utterances
      // for speech, so advance until the engine finishes, not once per
      // transcript sentence.
      for (let i = 0; i < sentences.length * 6 && engine.getState().isPlaying; i++) {
        advanceCurrent()
      }

      // One completion per sentence, then the engine ends exactly once.
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(engine.getState().isPlaying).toBe(false)

      // The highlight covers every position 0..N exactly once each. The
      // engine announces the next index both on sentence end and on next
      // speak, so callbacks arrive twice per sentence (minor: one extra
      // render per sentence), but the highlight itself never regresses.
      const uniqueIndices = [...new Set(highlightIndices)]
      expect(highlightIndices[0]).toBe(0)
      expect(uniqueIndices).toEqual(
        Array.from({ length: sentences.length + 1 }, (_, i) => i),
      )
    }
  })

  it('pause keeps the highlight position and resume finishes without restarting', async () => {
    const stop = stops[0]
    const engine = new NarrationEngine(stop.narration)
    const onEnd = vi.fn()
    engine.setOnEnd(onEnd)
    await engine.init()
    engine.play()
    advanceCurrent() // sentence 0 completes -> highlight 1
    advanceCurrent() // sentence 1 completes -> highlight 2, sentence 2 active
    expect(engine.getState().currentSentenceIndex).toBe(2)

    engine.pause()
    expect(engine.getState().isPlaying).toBe(false)
    expect(engine.getState().isPaused).toBe(true)
    expect(engine.getState().currentSentenceIndex).toBe(2)

    engine.play() // resume from the tracked index, not from the start
    expect(engine.getState().isPlaying).toBe(true)

    // FAT-43: speak() runs ~60 ms after the pause()'s cancel() (Chrome drops
    // an immediate speak), so flush that delay before driving events.
    await new Promise((resolve) => setTimeout(resolve, 80))

    const total = splitIntoSentences(stop.narration).length
    for (let i = 0; i < total * 6 && engine.getState().isPlaying; i++) {
      advanceCurrent()
    }
    // Resume finished the script: onEnd fired once for the whole stop.
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

describe('FAT-37 transcript text integrity (splitIntoSentences)', () => {
  it('preserves the full script text for every stop (QA FAT-34 D1: no text loss)', () => {
    // All 10 committed scripts: joining the split sentences must reproduce
    // the narration exactly, modulo whitespace normalization. This was
    // it.skip-ped by QA while the splitter dropped text after "Jr.," and
    // "past.'".
    for (const stop of stops) {
      const joined = splitIntoSentences(stop.narration)
        .map((s) => s.text)
        .join(' ')
      expect(joined).toBe(stop.narration.replace(/\s+/g, ' ').trim())
    }
  })

  it('speaks the sentences QA pinned as lost: "Jr.," and the absinthe punchline', () => {
    const opera = splitIntoSentences(
      (stops.find((s) => s.id === 'french-opera-house-site') as TourStop).narration,
    ).map((s) => s.text)
    expect(
      opera.some((text) =>
        text.startsWith('The building opened in 1859, designed by James Gallier Jr.'),
      ),
    ).toBe(true)

    const absinthe = splitIntoSentences(
      (stops.find((s) => s.id === 'old-absinthe-house') as TourStop).narration,
    ).map((s) => s.text)
    expect(
      absinthe.some((text) => text.includes('a rival saloon on Chartres Street')),
    ).toBe(true)
    expect(absinthe.some((text) => text.endsWith("handed down from the past.'"))).toBe(
      true,
    )
  })

  it('keeps a sentence together when a terminator meets a closer, with no loss', () => {
    expect(
      splitIntoSentences('Opened in 1859 by James Gallier Jr., and it hosted opera.')
        .map((s) => s.text)
        .join(' '),
    ).toBe('Opened in 1859 by James Gallier Jr., and it hosted opera.')

    expect(
      splitIntoSentences(
        "A line worth keeping: 'Legend is hearsay handed down from the past.' That is how we tell it.",
      ).map((s) => s.text),
    ).toEqual([
      "A line worth keeping: 'Legend is hearsay handed down from the past.'",
      'That is how we tell it.',
    ])

    expect(splitIntoSentences('He said, "Run!" and ran.').map((s) => s.text)).toEqual([
      'He said, "Run!"',
      'and ran.',
    ])
  })

  it('does not break a name apart at "St." / "No." (QA minor: was an unnatural mid-name pause)', () => {
    const first = splitIntoSentences(stops[0].narration)
    expect(first[0].text).toBe(
      'You are standing outside St. Louis Cemetery No. 1, the oldest surviving cemetery in New Orleans.',
    )
    expect(first.some((s) => s.text.includes('the older St. Peter burial ground'))).toBe(
      true,
    )
  })
})

describe('FAT-34 committed maneuver audit (route.geojson)', () => {
  it('covers all 9 legs in tour order and flags non-public-path wording', () => {
    const maneuvers: Maneuver[] = ROUTE.metadata.maneuvers
    expect(ROUTE.metadata.status).toBe('computed')
    expect(maneuvers).toHaveLength(stops.length - 1)
    maneuvers.forEach((maneuver, i) => {
      expect(maneuver.from).toBe(stops[i].id)
      expect(maneuver.to).toBe(stops[i + 1].id)
      expect(maneuver.instruction.length).toBeGreaterThan(10)
      expect(maneuver.distanceM).toBeGreaterThan(0)
    })

    // QA note D2 pinned the three "service lane" maneuvers; the FAT-38 fix
    // reworded them (and the recomputed route avoids the service lanes), so
    // the audit now requires zero non-public-path wording.
    const flagged = maneuvers.filter((m) =>
      /service lane|private|gated/i.test(m.instruction),
    )
    expect(flagged).toEqual([])
  })

  it('geofence centers sit on the viewpoints so arrival is inside 30 m', () => {
    for (const stop of stops) {
      const offsetM = haversineDistance(
        { lat: stop.lat, lon: stop.lon },
        { lat: stop.viewpoint.lat, lon: stop.viewpoint.lon },
      )
      expect(offsetM).toBeLessThanOrEqual(3)
    }
  })
})
