/**
 * Main tour hook combining GPS, geofence, narration, and wake lock.
 *
 * This is the central orchestrator for the tour experience.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Tour, TourStop } from '../types/tour'
import type { GeoPoint } from '../lib/geofence'
import { createStopGeofence, updateGeofence, resetGeofence } from '../lib/geofence'
import { NarrationEngine } from '../lib/narration'
import { useGPS } from './useGPS'
import { useWakeLock } from './useWakeLock'

export type TourPhase = 'idle' | 'ready' | 'active' | 'paused' | 'completed'

export interface TourState {
  phase: TourPhase
  currentStopIndex: number
  currentStop: TourStop | null
  distanceToCurrentStop: number | null
  isAtStop: boolean
  narration: NarrationEngine | null
  safetyNoticeSeen: boolean
  userPosition: GeoPoint | null
  userAccuracyM: number | null
  audioUnlocked: boolean
}

export interface TourControls {
  startTour: () => Promise<void>
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
  const [safetyNoticeSeen, setSafetyNoticeSeen] = useState(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [narrationEngine, setNarrationEngine] = useState<NarrationEngine | null>(null)

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

  // Initialize narration engine for current stop
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
      gps.start()
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

  const startTour = useCallback(async () => {
    unlockAudio()
    if (!safetyNoticeSeen) {
      setSafetyNoticeSeen(true)
      // Show safety notice first, then start
      return
    }

    // Initialize narration for first stop
    initializeNarration(0)
    setPhase('active')
    setCurrentStopIndex(0)
    setIsAtStop(false)

    // Request wake lock
    await wakeLock.request()
    gps.start()
  }, [unlockAudio, safetyNoticeSeen, initializeNarration, wakeLock, gps])

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
      setCurrentStopIndex(prevIndex)
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
  }, [])

  const currentStop = tour.stops[currentStopIndex] ?? null

  return {
    phase,
    currentStopIndex,
    currentStop,
    distanceToCurrentStop,
    isAtStop,
    narration: narrationEngine,
    safetyNoticeSeen,
    userPosition: gps.position,
    userAccuracyM: gps.accuracyM,
    audioUnlocked,
    startTour,
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
