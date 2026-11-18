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

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { RouteFile, Tour, TourStop } from '../types/tour'
import type { GeoPoint } from '../lib/geofence'
import {
  rebuildStopGeofences,
  type StopGeofence,
  updateGeofence,
  resetGeofence,
} from '../lib/geofence'
import { NarrationEngine, loadSpeechRate, type NarrationProblem } from '../lib/narration'
import {
  distanceToRouteM as measureDistanceToRouteM,
  isOffRoutePoint,
} from '../lib/route'
import { getStopGuidance, resolveJumpIndex, type StopGuidance } from '../lib/jump'
import { routeUrl } from '../lib/tourPaths'
import {
  load as loadProgress,
  markStopVisited,
  markQuizCorrect,
  markChallengeDone,
  computeScore,
  computeRank,
  type VisitProgress,
} from '../lib/progress'
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
  /** Guidance for the current stop; degrades to straight-line after a jump. */
  guidance: StopGuidance
  distanceToCurrentStop: number | null
  distanceToRouteM: number | null
  isAtStop: boolean
  isOffRoute: boolean
  routeLoaded: boolean
  routeError: string | null
  /** The committed precomputed route, null until it loads. */
  route: RouteFile | null
  narration: NarrationEngine | null
  /** Bumped on every sentence change so transcript highlights re-render. */
  sentenceTick: number
  /** Visible narration failure (error, audio never started, no voices). */
  narrationProblem: NarrationProblem | null
  safetyNoticeSeen: boolean
  userPosition: GeoPoint | null
  userAccuracyM: number | null
  audioUnlocked: boolean
  gpsSupported: boolean
  gpsPermission: GeolocationPermissionState
  gpsWatching: boolean
  gpsError: GeolocationPositionError | null
  wakeLock: WakeLockState
  /** Visit progress (localStorage only; no PII). */
  progress: VisitProgress
  /** Current playful rank label derived from progress. */
  rank: string
  /** Optional extra-story narration engine for the current stop. */
  extraStory: NarrationEngine | null
  /** Whether the extra story is currently playing. */
  extraStoryPlaying: boolean
  /** Whether the extra story is paused. */
  extraStoryPaused: boolean
  /** Whether the browser speech synthesis engine is available. */
  extraStorySupported: boolean
}

export interface TourControls {
  /** Leave idle: show the GPS explainer before any permission prompt. */
  startTour: () => void
  /** Leave idle aiming at a chosen stop (same onboarding path as startTour). */
  startTourAtStop: (index: number) => void
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
  /** Jump to any stop, forward or back, resetting geofence/narration state. */
  jumpToStop: (index: number) => void
  playCurrentStop: () => void
  replayCurrentSentence: () => void
  restartCurrentStop: () => void
  /** Retry narration after a visible problem. */
  retryNarration: () => void
  /** Hide the problem banner without retrying. */
  dismissNarrationProblem: () => void
  dismissSafetyNotice: () => void
  unlockAudio: () => void
  /** Record a correct quiz answer for the current stop. */
  recordQuizCorrect: (quizIndex: number) => void
  /** Record completion of the current stop's challenge. */
  recordChallengeDone: () => void
  /** Play the current stop's optional extra story. No-op while main narration plays. */
  playExtraStory: () => void
  /** Pause the current stop's extra story. */
  pauseExtraStory: () => void
  /** Stop the current stop's extra story. */
  stopExtraStory: () => void
}

export function useTour(tour: Tour): TourState & TourControls {
  const [phase, setPhase] = useState<TourPhase>('idle')
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [distanceToCurrentStop, setDistanceToCurrentStop] = useState<number | null>(null)
  const [isAtStop, setIsAtStop] = useState(false)
  const [safetyNoticeSeen, setSafetyNoticeSeen] = useState<boolean>(readSafetyNoticeSeen)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [narrationEngine, setNarrationEngine] = useState<NarrationEngine | null>(null)
  const [sentenceTick, setSentenceTick] = useState(0)
  const [narrationProblem, setNarrationProblem] = useState<NarrationProblem | null>(null)

  const [progress, setProgress] = useState<VisitProgress>(() => loadProgress(tour.id))

  // Current stop for convenience (must be before the stop-visited effect).
  const currentStop = tour.stops[currentStopIndex] ?? null

  // Extra-story narration engine (optional per stop). Kept separate from the
  // main narration so it never alters the tour script. Stops on stop change
  // or geofence trigger.
  const [extraStoryEngine, setExtraStoryEngine] = useState<NarrationEngine | null>(null)
  const extraStoryRef = useRef<NarrationEngine | null>(null)

  const stopExtraStory = useCallback(() => {
    extraStoryRef.current?.stop()
    setExtraStoryEngine(null)
    extraStoryRef.current = null
  }, [])

  const playExtraStory = useCallback(() => {
    const text = currentStop?.extraStory?.text
    if (!text) return
    // Do not interrupt main narration.
    if (narrationEngine?.getState().isPlaying) return
    let engine = extraStoryRef.current
    if (!engine) {
      engine = new NarrationEngine(text, { rate: loadSpeechRate() })
      engine.setOnEnd(() => {
        engine?.stop()
        setExtraStoryEngine(null)
      })
      engine.init().catch(console.error)
      extraStoryRef.current = engine
      setExtraStoryEngine(engine)
    }
    engine.play()
  }, [currentStop, narrationEngine])

  const pauseExtraStory = useCallback(() => {
    extraStoryRef.current?.pause()
  }, [])

  // Create/stop the extra-story engine when the stop changes.
  useEffect(() => {
    const text = currentStop?.extraStory?.text
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      stopExtraStory()
      return
    }
    stopExtraStory()
    const engine = new NarrationEngine(text, { rate: loadSpeechRate() })
    engine.setOnEnd(() => {
      engine.stop()
      if (extraStoryRef.current === engine) {
        extraStoryRef.current = null
      }
    })
    engine.init().catch(console.error)
    extraStoryRef.current = engine
    setExtraStoryEngine(engine)
    return () => {
      engine.stop()
      if (extraStoryRef.current === engine) {
        extraStoryRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStop?.id, tour.id])

  // Mark stop as visited when the walker enters the geofence.
  useEffect(() => {
    if (isAtStop && currentStop) {
      const stopId = currentStop.id
      if (!progress.stopsVisited.includes(stopId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProgress(markStopVisited(tour.id, stopId))
      }
    }
  }, [isAtStop, currentStop, tour.id, progress.stopsVisited])

  // The committed, build-time route. Its maneuver list drives the next-maneuver
  // display and its geometry the off-route check. Never re-routed.
  const [route, setRoute] = useState<RouteFile | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  const gps = useGPS()
  const wakeLock = useWakeLock()
  // Stop index the pending activation should begin at (set from the start
  // screen's per-stop "Start here" action; defaults to the first stop).
  const startStopIndexRef = useRef(0)
  const geofencesRef = useRef<Map<string, StopGeofence>>(new Map())

  // Refs for callbacks that need to reference each other
  const nextStopRef = useRef<() => void>(() => {})
  const initializeNarrationRef = useRef<(stopIndex: number) => void>(() => {})

  // Rebuild geofences whenever the stop list changes (e.g. a city swap), so
  // lookups by stop id never go stale.
  useEffect(() => {
    rebuildStopGeofences(geofencesRef.current, tour.stops)
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

      // FAT-49: honor the start-screen Speed choice for this tour run.
      const engine = new NarrationEngine(stop.narration, { rate: loadSpeechRate() })
      setNarrationEngine(engine)
      setNarrationProblem(null)

      engine.setOnSentenceChange(() => {
        // Real state tick so the transcript highlight re-renders (FAT-43).
        setSentenceTick((tick) => tick + 1)
      })

      engine.setOnProblem((problem) => {
        setNarrationProblem(problem)
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
      // Main narration is starting: extra story must not continue.
      stopExtraStory()
      if (narrationEngine && audioUnlocked) {
        narrationEngine.play()
      }
    } else if (exited && isAtStop) {
      setIsAtStop(false)
      // Walker left the geofence: stop any extra story.
      stopExtraStory()
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
    stopExtraStory,
  ])

  // Audio unlock - must be called from user gesture
  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      // Speak a real (near-silent) word: some engines ignore empty or
      // zero-volume utterances, which fails to unlock audio (FAT-43).
      const unlockUtterance = new SpeechSynthesisUtterance('ghost')
      unlockUtterance.volume = 0.01
      unlockUtterance.rate = 10
      speechSynthesis.speak(unlockUtterance)
      setAudioUnlocked(true)
    }
  }, [audioUnlocked])

  const startTour = useCallback(() => {
    startStopIndexRef.current = 0
    unlockAudio()
    if (!safetyNoticeSeen) {
      setSafetyNoticeSeen(true)
      persistSafetyNoticeSeen()
    }
    // Show the GPS explainer; no permission prompt fires until the walker
    // taps through it.
    setPhase('ready')
  }, [unlockAudio, safetyNoticeSeen])

  const startTourAtStop = useCallback(
    (index: number) => {
      const resolved = resolveJumpIndex(tour.stops, index)
      if (resolved === null) return
      startStopIndexRef.current = resolved
      unlockAudio()
      if (!safetyNoticeSeen) {
        setSafetyNoticeSeen(true)
        persistSafetyNoticeSeen()
      }
      setPhase('ready')
    },
    [tour.stops, unlockAudio, safetyNoticeSeen],
  )

  const activateTour = useCallback(() => {
    const startIndex = resolveJumpIndex(tour.stops, startStopIndexRef.current) ?? 0
    startStopIndexRef.current = 0
    const geofence = geofencesRef.current.get(tour.stops[startIndex].id)
    if (geofence) resetGeofence(geofence)
    initializeNarration(startIndex)
    setCurrentStopIndex(startIndex)
    setIsAtStop(false)
    setDistanceToCurrentStop(null)
    setPhase('active')
    wakeLock.request()
  }, [tour.stops, initializeNarration, wakeLock])

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
    stopExtraStory()
  }, [gps, wakeLock, narrationEngine, stopExtraStory])

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
      stopExtraStory()
    }
  }, [currentStopIndex, tour.stops, stopExtraStory])

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
      stopExtraStory()
    }
  }, [currentStopIndex, tour.stops, stopExtraStory])

  // Jump to any stop, forward or back, from the start page path or the
  // in-tour stop list. Stops current narration cleanly and resets geofence
  // and narration state for the new stop, so no stale "already played" or
  // "inside geofence" flags survive the jump.
  // Normalization (FAT-56 QA item 2): a jump always activates the tour. If it
  // was paused this resumes playback; if already active it stays active. This
  // matches the expected UX where jumping starts narration at the new stop.
  const jumpToStop = useCallback(
    (index: number) => {
      const resolved = resolveJumpIndex(tour.stops, index)
      if (resolved === null) return
      const stop = tour.stops[resolved]
      const geofence = geofencesRef.current.get(stop.id)
      if (geofence) resetGeofence(geofence)
      initializeNarrationRef.current(resolved)
      setCurrentStopIndex(resolved)
      setIsAtStop(false)
      setDistanceToCurrentStop(null)
      stopExtraStory()
      setPhase('active')
    },
    [tour.stops, stopExtraStory],
  )

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

  const retryNarration = useCallback(() => {
    unlockAudio()
    narrationEngine?.retry()
    setNarrationProblem(null)
  }, [unlockAudio, narrationEngine])

  const dismissNarrationProblem = useCallback(() => {
    narrationEngine?.clearProblem()
    setNarrationProblem(null)
  }, [narrationEngine])

  const recordQuizCorrect = useCallback(
    (quizIndex: number) => {
      const stop = tour.stops[currentStopIndex]
      if (!stop) return
      setProgress(markQuizCorrect(tour.id, stop.id, quizIndex))
    },
    [tour.id, tour.stops, currentStopIndex],
  )

  const recordChallengeDone = useCallback(() => {
    const stop = tour.stops[currentStopIndex]
    if (!stop) return
    setProgress(markChallengeDone(tour.id, stop.id))
  }, [tour.id, tour.stops, currentStopIndex])

  const rank = computeRank(computeScore(progress), tour.progress)

  const extraStoryPlaying = extraStoryEngine?.getState().isPlaying ?? false
  const extraStoryPaused = extraStoryEngine?.getState().isPaused ?? false
  const extraStorySupported = NarrationEngine.isSupported()

  // FAT-56: memoize guidance so leg slicing + haversine only recompute when
  // their inputs change, not on unrelated state churn (sentence ticks, etc.).
  const guidance = useMemo(
    () =>
      getStopGuidance({
        route,
        stops: tour.stops,
        currentStopIndex,
        isAtStop,
        userPosition: gps.position,
        userAccuracyM: gps.accuracyM,
      }),
    [route, tour.stops, currentStopIndex, isAtStop, gps.position, gps.accuracyM],
  )

  return {
    phase,
    currentStopIndex,
    currentStop,
    guidance,
    distanceToCurrentStop,
    distanceToRouteM,
    isAtStop,
    isOffRoute,
    routeLoaded: route !== null,
    routeError,
    route,
    narration: narrationEngine,
    sentenceTick,
    narrationProblem,
    safetyNoticeSeen,
    userPosition: gps.position,
    userAccuracyM: gps.accuracyM,
    audioUnlocked,
    gpsSupported: gps.isSupported,
    gpsPermission: gps.permission,
    gpsWatching: gps.isWatching,
    gpsError: gps.error,
    wakeLock,
    progress,
    rank,
    extraStory: extraStoryEngine,
    extraStoryPlaying,
    extraStoryPaused,
    extraStorySupported,
    startTour,
    startTourAtStop,
    startWithLocation,
    startWithoutLocation,
    enableLocation,
    pauseTour,
    resumeTour,
    stopTour,
    nextStop,
    previousStop,
    jumpToStop,
    playCurrentStop,
    replayCurrentSentence,
    restartCurrentStop,
    retryNarration,
    dismissNarrationProblem,
    dismissSafetyNotice,
    unlockAudio,
    recordQuizCorrect,
    recordChallengeDone,
    playExtraStory,
    pauseExtraStory,
    stopExtraStory,
  }
}
