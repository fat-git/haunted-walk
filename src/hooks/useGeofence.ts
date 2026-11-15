import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../types/tour';

export function haversineDistance(from: GeoPoint, to: GeoPoint): number {
  const R = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GeofenceOptions {
  target: GeoPoint | null;
  enterRadiusM: number;
  exitRadiusM: number;
  maxAccuracyM?: number;
  consecutiveFixes?: number;
}

export function useGeofence({
  target,
  enterRadiusM,
  exitRadiusM,
  maxAccuracyM = 50,
  consecutiveFixes = 2,
}: GeofenceOptions) {
  const [isInside, setIsInside] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const insideRef = useRef(false);
  const enterCountRef = useRef(0);
  const exitCountRef = useRef(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        const current: GeoPoint = { lat: latitude, lon: longitude };

        setPosition(current);
        setAccuracy(acc);
        setError(null);

        if (acc > maxAccuracyM) return;

        if (target) {
          const d = haversineDistance(current, target);
          setDistance(d);

          if (!insideRef.current && d <= enterRadiusM) {
            enterCountRef.current += 1;
            exitCountRef.current = 0;
            if (enterCountRef.current >= consecutiveFixes) {
              insideRef.current = true;
              setIsInside(true);
              enterCountRef.current = 0;
            }
          } else if (insideRef.current && d > exitRadiusM) {
            exitCountRef.current += 1;
            enterCountRef.current = 0;
            if (exitCountRef.current >= consecutiveFixes) {
              insideRef.current = false;
              setIsInside(false);
              exitCountRef.current = 0;
            }
          } else {
            enterCountRef.current = 0;
            exitCountRef.current = 0;
          }
        }
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [target, enterRadiusM, exitRadiusM, maxAccuracyM, consecutiveFixes]);

  const reset = useCallback(() => {
    insideRef.current = false;
    enterCountRef.current = 0;
    exitCountRef.current = 0;
    setIsInside(false);
  }, []);

  return { isInside, distance, position, accuracy, error, reset };
}
