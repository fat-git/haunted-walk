/**
 * Screen Wake Lock hook.
 *
 * Requests wake lock on tour start and re-acquires on visibilitychange.
 * Provides fallback notice where the API is unsupported.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

export interface WakeLockState {
  isSupported: boolean
  isActive: boolean
  error: string | null
}

export interface WakeLockControls {
  request: () => Promise<boolean>
  release: () => Promise<void>
}

/**
 * Hook for managing Screen Wake Lock.
 * Returns state and controls for the wake lock.
 */
export function useWakeLock(): WakeLockState & WakeLockControls {
  const [state, setState] = useState<WakeLockState>({
    isSupported: 'wakeLock' in navigator,
    isActive: false,
    error: null,
  })
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const isMountedRef = useRef(true)

  const request = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((s) => ({ ...s, error: 'Wake Lock API not supported in this browser' }))
      return false
    }

    try {
      const wakeLock = await navigator.wakeLock.request('screen')
      wakeLockRef.current = wakeLock

      wakeLock.addEventListener('release', () => {
        if (isMountedRef.current) {
          setState((s) => ({ ...s, isActive: false }))
        }
      })

      setState((s) => ({ ...s, isActive: true, error: null }))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to acquire wake lock'
      setState((s) => ({ ...s, isActive: false, error: message }))
      return false
    }
  }, [state.isSupported])

  const release = useCallback(async (): Promise<void> => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      } catch {
        // Ignore release errors
      }
    }
    setState((s) => ({ ...s, isActive: false }))
  }, [])

  // Re-acquire on visibility change (when tab becomes visible again)
  useEffect(() => {
    isMountedRef.current = true

    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === 'visible' &&
        wakeLockRef.current === null &&
        state.isSupported
      ) {
        await request()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      isMountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [request, state.isSupported])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [])

  return { ...state, request, release }
}
