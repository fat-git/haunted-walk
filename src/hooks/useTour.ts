/**
 * Main tour hook combining GPS, geofence, narration, wake lock, and the
 * committed route's maneuver list.
 *
 * This is the central orchestrator for the tour experience.
 *
 * Onboarding order: safety notice (idle) → GPS explainer (ready) → active.
 * The browser permission prompt only fires once the walker has read the
 * explainer and tapped through it, because `gps.start()` is not called until
 * then.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Maneuver, RouteFile, Tour, TourStop } from '../types/tour'
import type { GeoPoint } from '../lib/geofence'
import { createStopGeofence, updateGeofence, resetGeofence } from '../lib/geofence'
import { NarrationEngine } from '../lib/narration'
import {
  distanceToRouteM as measureDistanceToRouteM,
  getNextManeuver,
  isOffRoutePoint,
} from '../lib/route'
import { routeUrl } from '../lib/tourPaths'
import { useGPS, type GeolocationPermissionState } from './useGPS'
import { useWakeLock, type WakeLockState } from './useWakeLock'

const SAFETY_NOTICE_STORAGE_KEY = 'haunted-walk:safety-notice-seen'

function readSafetyNoticeSeen(): boolean {
  try {
    return window.localStorage.getItem(SAFETY_NOTICE_STORAGE_KEY) === '1'
  } catch {
    // Storage blocked (private mode): the notice simply returns on reload.
    return false
  }
}

function persistSafetyNoticeSeen(): void {
  try {
    window.localStorage.setItem(SAFETY_NOTICE_STORAGE_KEY, '1')
  } catch {
    // Storage blocked: not fatal, the notice returns next launch.
  }
}

export type TourPhase = 'idle' | 'ready' | 'active' | 'paused' | 'completed'

export interface TourState {
  phase: TourPhase
  currentStopIndex: number
  currentStop: TourStop | null
  nextManeuver: Maneuver | null
  distanceToCurrentStop: number | null
  distanceToRouteM: number | null
  isAtStop: boolean
  isOffRoute: boolean
  routeLoaded: boolean
  routeError: string | null
  narration: NarrationEngine | null
  safetyNoticeSeen: boolean
  userPosition: GeoPoint | null
  userAccuracyM: number | null
  audioUnlocked: boolean
  gpsSupported: boolean
  gpsPermission: GeolocationPermissionState
  gpsWatching: boolean
  gpsError: GeolocationPositionError | null
  wakeLock: WakeLockState
}

export interface TourControls {
  /** Leave idle: show the GPS explainer before any permission prompt. */
  startTour: () => void
  /** From the GPS explainer: ask for location and go active. */
  startWithLocation: () => void
  /** From the GPS explainer: go active without location (manual playback). */
  startWithoutLocation: () => void
  /** Re-ask for location while the tour is running. */
  enableLocation: () => void
  pauseTour: () => void
  resumeTour: () => void
  stopTour: () => void
  nextStop: () => void
  previousStop: () => void
  playCurrentStop: () => void
  replayCurrentSentence: () => void
  restartCurrentStop: () => void
  dismissSafetyNotice: () => void
  unlockAudio: () => void
}

export function useTour(tour: Tour): TourState & TourControls {
  const [phase, setPhase] = useState<TourPhase>('idle')
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [distanceToCurrentStop, setDistanceToCurrentStop] = useState<number | null>(null)
  const [isAtStop, setIsAtStop] = useState(false)
  const [safetyNoticeSeen, setSafetyNoticeSeen] = useState<boolean>(readSafetyNoticeSeen)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [narrationEngine, setNarrationEngine] = useState<NarrationEngine | null>(null)

  // The committed, build-time route. Its maneuver list drives the next-maneuver
  // display and its geometry the off-route check. Never re-routed.
  const [route, setRoute] = useState<RouteFile | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const gps = useGPS()
  const wakeLock = useWakeLock()
  const geofencesRef = useRef<Map<string, ReturnType<typeof createStopGeofence>>>(
    new Map(),
  )

  // Refs for callbacks that need to reference each other
  const nextStopRef = useRef<() => void>(() => {})
  const initializeNarrationRef = useRef<(stopIndex: number) => void>(() => {})

  // Initialize geofences for all stops
  useEffect(() => {
    if (geofencesRef.current.size === 0 && tour.stops.length > 0) {
      for (const stop of tour.stops) {
        geofencesRef.current.set(
          stop.id,
          createStopGeofence(
            stop.id,
            { lat: stop.lat, lon: stop.lon },
            stop.geofenceRadiusM,
            stop.geofenceRadiusM + 15,
          ),
        )
      }
    }
  }, [tour.stops])

  // Load the committed route. On failure the map falls back to straight
  // stop-to-stop lines and the guidance panel says directions are unavailable.
  useEffect(() => {
    let cancelled = false
    fetch(routeUrl(tour.city))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load route: ${res.status}`)
        return res.json() as Promise<RouteFile>
      })
      .then((data: RouteFile) => {
        if (!cancelled) {
          setRoute(data)
          setRouteError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRouteError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [tour.city])

  // Off-route verdict against the committed geometry, derived per render.
  // The app never re-routes; this only drives the "you are off route" warning.
  const routeCoordinates = route?.features[0]?.geometry.coordinates ?? null
  const distanceToRouteM =
    phase === 'active' && gps.position && routeCoordinates && routeCoordinates.length > 0
      ? measureDistanceToRouteM(gps.position, routeCoordinates)
      : null
  const isOffRoute =
    distanceToRouteM !== null && isOffRoutePoint(distanceToRouteM, gps.accuracyM)

  // Initialize narration for current stop
  const initializeNarration = useCallback(
    (stopIndex: number) => {
      const stop = tour.stops[stopIndex]
      if (!stop) return

      // Clean up previous narration
      if (narrationEngine) {
        narrationEngine.stop()
      }

      const engine = new NarrationEngine(stop.narration)
      setNarrationEngine(engine)

      engine.setOnSentenceChange(() => {
        // Force re-render for transcript highlighting
        setCurrentStopIndex((prev) => prev)
      })

      engine.setOnEnd(() => {
        // Auto-advance to next stop when narration completes
        if (stopIndex < tour.stops.length - 1) {
          nextStopRef.current()
        } else {
          setPhase('completed')
        }
      })

      engine.init().catch(console.error)
    },
    [tour.stops, narrationEngine],
  )

  // Store initializeNarration in ref for nextStop to use
  useEffect(() => {
    initializeNarrationRef.current = initializeNarration
  }, [initializeNarration])

  // Start GPS and wake lock when tour becomes active
  useEffect(() => {
    if (phase === 'active') {
      wakeLock.request()
    } else if (phase === 'idle' || phase === 'completed') {
      gps.stop()
      wakeLock.release()
    }
  }, [phase, gps, wakeLock])

  // Process GPS updates for geofence detection
  useEffect(() => {
    if (phase !== 'active' || !gps.position) return

    const currentStop = tour.stops[currentStopIndex]
    if (!currentStop) return

    const geofence = geofencesRef.current.get(currentStop.id)
    if (!geofence) return

    const { entered, exited, distanceM } = updateGeofence(
      geofence,
      gps.position,
      gps.accuracyM ?? 999,
    )
    setDistanceToCurrentStop(distanceM)

    if (entered && !isAtStop) {
      setIsAtStop(true)
      if (narrationEngine && audioUnlocked) {
        narrationEngine.play()
      }
    } else if (exited && isAtStop) {
      setIsAtStop(false)
    }
  }, [
    gps.position,
    gps.accuracyM,
    phase,
    currentStopIndex,
    tour.stops,
    audioUnlocked,
    narrationEngine,
    isAtStop,
  ])

  // Audio unlock - must be called from user gesture
  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      // Play a silent utterance to unlock audio context
      const silentUtterance = new SpeechSynthesisUtterance(' ')
      silentUtterance.volume = 0
      silentUtterance.rate = 10
      speechSynthesis.speak(silentUtterance)
      setAudioUnlocked(true)
    }
  }, [audioUnlocked])

  const startTour = useCallback(() => {
    unlockAudio()
    if (!safetyNoticeSeen) {
      setSafetyNoticeSeen(true)
      persistSafetyNoticeSeen()
    }
    // Show the GPS explainer; no permission prompt fires until the walker
    // taps through it.
    setPhase('ready')
  }, [unlockAudio, safetyNoticeSeen])

  const activateTour = useCallback(() => {
    initializeNarration(0)
    setCurrentStopIndex(0)
    setIsAtStop(false)
    setDistanceToCurrentStop(null)
    setPhase('active')
    wakeLock.request()
  }, [initializeNarration, wakeLock])

  const startWithLocation = useCallback(() => {
    gps.start()
    activateTour()
  }, [gps, activateTour])

  const startWithoutLocation = useCallback(() => {
    activateTour()
  }, [activateTour])

  const enableLocation = useCallback(() => {
    gps.start()
  }, [gps])

  const pauseTour = useCallback(() => {
    narrationEngine?.pause()
    setPhase('paused')
  }, [narrationEngine])

  const resumeTour = useCallback(() => {
    unlockAudio()
    narrationEngine?.play()
    setPhase('active')
  }, [unlockAudio, narrationEngine])

  const stopTour = useCallback(() => {
    narrationEngine?.stop()
    gps.stop()
    wakeLock.release()
    // Reset all geofences
    for (const geofence of geofencesRef.current.values()) {
      resetGeofence(geofence)
    }
    setPhase('idle')
    setCurrentStopIndex(0)
    setIsAtStop(false)
    setDistanceToCurrentStop(null)
  }, [gps, wakeLock, narrationEngine])

  const nextStop = useCallback(() => {
    if (currentStopIndex < tour.stops.length - 1) {
      const nextIndex = currentStopIndex + 1
      setCurrentStopIndex(nextIndex)
      // Reset geofence for new stop
      const nextStopData = tour.stops[nextIndex]
      const geofence = geofencesRef.current.get(nextStopData.id)
      if (geofence) resetGeofence(geofence)
      initializeNarrationRef.current(nextIndex)
      setIsAtStop(false)
    }
  }, [currentStopIndex, tour.stops])

  // Store nextStop in ref for initializeNarration to use
  useEffect(() => {
    nextStopRef.current = nextStop
  }, [nextStop])

  const previousStop = useCallback(() => {
    if (currentStopIndex > 0) {
      const prevIndex = currentStopIndex - 1
      const prevStop = tour.stops[prevIndex]
      const geofence = geofencesRef.current.get(prevStop.id)
      if (geofence) resetGeofence(geofence)
      initializeNarrationRef.current(prevIndex)
      setIsAtStop(false)
    }
  }, [currentStopIndex, tour.stops])

  const playCurrentStop = useCallback(() => {
    unlockAudio()
    narrationEngine?.play()
  }, [unlockAudio, narrationEngine])

  const replayCurrentSentence = useCallback(() => {
    unlockAudio()
    narrationEngine?.replay()
  }, [unlockAudio, narrationEngine])

  const restartCurrentStop = useCallback(() => {
    unlockAudio()
    narrationEngine?.stop()
    narrationEngine?.play()
  }, [unlockAudio, narrationEngine])

  const dismissSafetyNotice = useCallback(() => {
    setSafetyNoticeSeen(true)
    persistSafetyNoticeSeen()
  }, [])

  const currentStop = tour.stops[currentStopIndex] ?? null

  return {
    phase,
    currentStopIndex,
    currentStop,
    nextManeuver: getNextManeuver(route, tour.stops, currentStopIndex),
    distanceToCurrentStop,
    distanceToRouteM,
    isAtStop,
    isOffRoute,
    routeLoaded: route !== null,
    routeError,
    narration: narrationEngine,
    safetyNoticeSeen,
    userPosition: gps.position,
    userAccuracyM: gps.accuracyM,
    audioUnlocked,
    gpsSupported: gps.isSupported,
    gpsPermission: gps.permission,
    gpsWatching: gps.isWatching,
    gpsError: gps.error,
    wakeLock,
    startTour,
    startWithLocation,
    startWithoutLocation,
    enableLocation,
    pauseTour,
    resumeTour,
    stopTour,
    nextStop,
    previousStop,
    playCurrentStop,
    replayCurrentSentence,
    restartCurrentStop,
    dismissSafetyNotice,
    unlockAudio,
  }
}
