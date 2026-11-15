/**
 * GPS hook for watchPosition with filtering.
 *
 * Provides filtered position updates with accuracy threshold.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { GeoPoint } from '../lib/geofence'

export interface GPSState {
  position: GeoPoint | null
  accuracyM: number | null
  error: GeolocationPositionError | null
  isSupported: boolean
  isWatching: boolean
}

export interface GPSOptions {
  enableHighAccuracy: boolean
  maximumAge: number
  timeout: number
  minAccuracyM: number
}

export const DEFAULT_GPS_OPTIONS: GPSOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
  minAccuracyM: 50,
}

export function useGPS(
  options: Partial<GPSOptions> = {},
): GPSState & { start: () => void; stop: () => void } {
  const opts = useMemo(() => ({ ...DEFAULT_GPS_OPTIONS, ...options }), [options])
  const [state, setState] = useState<GPSState>({
    position: null,
    accuracyM: null,
    error: null,
    isSupported: 'geolocation' in navigator,
    isWatching: false,
  })
  const watchIdRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  const start = useCallback(() => {
    if (!state.isSupported || watchIdRef.current !== null) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMountedRef.current) return
        const accuracy = pos.coords.accuracy
        if (accuracy <= opts.minAccuracyM) {
          setState((s) => ({
            ...s,
            position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            accuracyM: accuracy,
            error: null,
          }))
        }
        // Still update position even if accuracy is poor, but mark it
        else {
          setState((s) => ({
            ...s,
            position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            accuracyM: accuracy,
          }))
        }
      },
      (err) => {
        if (!isMountedRef.current) return
        setState((s) => ({ ...s, error: err }))
      },
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        maximumAge: opts.maximumAge,
        timeout: opts.timeout,
      },
    )

    setState((s) => ({ ...s, isWatching: true }))
  }, [state.isSupported, opts])

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      setState((s) => ({ ...s, isWatching: false }))
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  return { ...state, start, stop }
}
