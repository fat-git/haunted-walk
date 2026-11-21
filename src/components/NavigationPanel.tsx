/**
 * Navigation panel: the walking guidance card.
 *
 * Shows the maneuver from the route's committed maneuver list, the live
 * distance to the current stop, an off-route warning (the app never
 * re-routes), per-stop Google/Apple Maps deep links as the turn-by-turn
 * fallback, GPS status, and the wake lock state.
 *
 * After a jump (FAT-47), guidance degrades honestly: when the walker is not
 * on the committed leg into the current stop, no maneuver is claimed — only
 * straight-line distance, bearing, and the maps deep links.
 */

import type { Tour, TourStop } from '../types/tour'
import type { GeolocationPermissionState } from '../hooks/useGPS'
import type { WakeLockState } from '../hooks/useWakeLock'
import type { StopGuidance } from '../lib/jump'
import { formatDistanceM } from '../lib/format'
import { appleMapsDirectionsUrl, googleMapsDirectionsUrl } from '../lib/mapsLinks'
import { minAccuracyM } from '../lib/geofence'

interface NavigationPanelProps {
  tour: Tour
  currentStopIndex: number
  currentStop: TourStop
  guidance: StopGuidance
  distanceToNextStopM: number | null
  isAtStop: boolean
  isOffRoute: boolean
  routeLoaded: boolean
  routeError: string | null
  gpsSupported: boolean
  gpsPermission: GeolocationPermissionState
  gpsWatching: boolean
  gpsAccuracyM: number | null
  gpsError: GeolocationPositionError | null
  wakeLock: WakeLockState
  onEnableLocation: () => void
}

export function NavigationPanel({
  tour,
  currentStopIndex,
  currentStop,
  guidance,
  distanceToNextStopM,
  isAtStop,
  isOffRoute,
  routeLoaded,
  routeError,
  gpsSupported,
  gpsPermission,
  gpsWatching,
  gpsAccuracyM,
  gpsError,
  wakeLock,
  onEnableLocation,
}: NavigationPanelProps) {
  const viewpoint = currentStop.viewpoint
  const isFinalStop = currentStopIndex === tour.stops.length - 1

  return (
    <section className="navigation-panel" role="region" aria-label="Navigation">
      <p className="status">
        <span className="status-dot" aria-hidden="true" />
        Next move
      </p>

      {isOffRoute && (
        <div className="off-route-banner" role="alert">
          <p>
            <strong>You're off the walking route.</strong> This app doesn't re-route. Walk
            back to the route on the map, or open the stop in a maps app below for live
            turn-by-turn.
          </p>
        </div>
      )}

      <div className="maneuver" aria-live="polite">
        {!routeLoaded && !routeError && (
          <p className="maneuver-instruction">Loading walking directions…</p>
        )}
        {routeError && (
          <p className="maneuver-instruction">
            Walking directions couldn't load. Follow the line on the map.
          </p>
        )}
        {routeLoaded && guidance.mode === 'straight-line' && (
          <div className="jump-guidance" role="status">
            <p className="maneuver-instruction">
              You jumped to {currentStop.name}. The walking route is computed between
              stops, so there are no street directions from here.
            </p>
            {guidance.straightLineM !== null && guidance.bearing !== null && (
              <p className="maneuver-meta">
                {formatDistanceM(guidance.straightLineM)} as the crow flies · heading{' '}
                {guidance.bearing}
              </p>
            )}
          </div>
        )}
        {routeLoaded && guidance.mode === 'leg' && guidance.maneuver && (
          <>
            <p className="maneuver-instruction">{guidance.maneuver.instruction}</p>
            <p className="maneuver-meta">
              {formatDistanceM(guidance.maneuver.distanceM)} · about{' '}
              {Math.max(1, Math.round(guidance.maneuver.durationS / 60))} min on foot
            </p>
          </>
        )}
        {routeLoaded && guidance.mode === 'leg' && !guidance.maneuver && (
          <p className="maneuver-instruction">
            {isFinalStop
              ? 'Final stop — the tour ends here.'
              : 'Follow the route on the map.'}
          </p>
        )}
      </div>

      <p className="distance-readout" aria-live="polite">
        {distanceToNextStopM === null
          ? 'Waiting for your first GPS fix…'
          : isAtStop
            ? `At ${currentStop.name}`
            : `${formatDistanceM(distanceToNextStopM)} to ${currentStop.name}`}
      </p>

      <div className="directions-links">
        <span className="directions-caption">Live turn-by-turn:</span>
        <a
          className="directions-link"
          href={googleMapsDirectionsUrl(viewpoint.lat, viewpoint.lon)}
          target="_blank"
          rel="noopener"
          aria-label={`Open ${currentStop.name} in Google Maps`}
        >
          Google Maps
        </a>
        <a
          className="directions-link"
          href={appleMapsDirectionsUrl(viewpoint.lat, viewpoint.lon)}
          target="_blank"
          rel="noopener"
          aria-label={`Open ${currentStop.name} in Apple Maps`}
        >
          Apple Maps
        </a>
      </div>

      <div className="gps-status" role="status">
        {!gpsSupported && (
          <p>This browser doesn't provide location. Use the map links above.</p>
        )}
        {gpsSupported && gpsError?.code === 1 && (
          <p>
            Location access denied. Narration won't start automatically — tap Play Stop,
            or re-enable location in your browser's site settings.
          </p>
        )}
        {gpsSupported && !gpsError && gpsWatching && (
          <p>
            Location on{gpsAccuracyM != null ? ` · ±${Math.round(gpsAccuracyM)} m` : ''}
          </p>
        )}
        {gpsSupported &&
          !gpsError &&
          gpsAccuracyM != null &&
          gpsAccuracyM > minAccuracyM && (
            <p className="gps-weak-hint" role="status">
              GPS is weak here, so narration may not start by itself. Tap Play Stop to
              hear this stop.
            </p>
          )}
        {gpsSupported && !gpsError && !gpsWatching && gpsPermission !== 'denied' && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onEnableLocation}
          >
            Enable location access
          </button>
        )}
        {gpsSupported && gpsError && gpsError.code !== 1 && (
          <p>GPS error: {gpsError.message}</p>
        )}
      </div>

      <div className={`wake-lock-pill ${wakeLockPillClass(wakeLock)}`} role="status">
        {wakeLockCopy(wakeLock)}
      </div>
    </section>
  )
}

function wakeLockPillClass(wakeLock: WakeLockState): string {
  if (!wakeLock.isSupported) return 'unsupported'
  if (wakeLock.isActive) return 'active'
  return 'idle'
}

function wakeLockCopy(wakeLock: WakeLockState): string {
  if (!wakeLock.isSupported) {
    return 'Wake Lock not supported — screen may dim and GPS may pause'
  }
  if (wakeLock.isActive) {
    return 'Screen wake lock on — the screen stays awake during the tour'
  }
  if (wakeLock.error) {
    return `Wake lock unavailable (${wakeLock.error}) — screen may dim`
  }
  return 'Wake lock not held yet'
}
