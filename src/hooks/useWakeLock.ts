import { useCallback, useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [supported] = useState(() =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator
  );
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!supported || lockRef.current) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      setIsLocked(true);
      lockRef.current.addEventListener('release', () => {
        setIsLocked(false);
        lockRef.current = null;
      });
    } catch {
      setIsLocked(false);
    }
  }, [supported]);

  const release = useCallback(async () => {
    if (lockRef.current) {
      await lockRef.current.release();
      lockRef.current = null;
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && lockRef.current === null) {
        request();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [request]);

  useEffect(() => {
    return () => {
      if (lockRef.current) {
        lockRef.current.release();
      }
    };
  }, []);

  return { isLocked, supported, request, release };
}
