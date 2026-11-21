/**
 * FAT-76 item 1: NavigationPanel shows a weak-GPS hint when the latest fix
 * accuracy is worse than minAccuracyM (50 m). The geofence threshold itself is
 * not loosened; the hint only.
 *
 * Rendered with react-dom/server so no DOM is needed.
 */

/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavigationPanel } from './NavigationPanel'
import type { Tour, TourStop } from '../types/tour'
import type { StopGuidance } from '../lib/jump'
import type { WakeLockState } from '../hooks/useWakeLock'

const TOUR: Tour = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)

const STOP: TourStop = TOUR.stops[0]

const GUIDANCE: StopGuidance = {
  mode: 'leg',
  maneuver: null,
  straightLineM: null,
  bearing: null,
}

const WAKE_LOCK: WakeLockState = { isSupported: false, isActive: false, error: null }

function renderPanel(props: Partial<Parameters<typeof NavigationPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    <NavigationPanel
      tour={TOUR}
      currentStopIndex={0}
      currentStop={STOP}
      guidance={GUIDANCE}
      distanceToNextStopM={null}
      isAtStop={false}
      isOffRoute={false}
      routeLoaded={true}
      routeError={null}
      gpsSupported={true}
      gpsPermission={'granted'}
      gpsWatching={true}
      gpsAccuracyM={null}
      gpsError={null}
      wakeLock={WAKE_LOCK}
      onEnableLocation={() => {}}
      {...props}
    />,
  )
}

describe('NavigationPanel weak-GPS hint', () => {
  it('shows the hint when the latest accuracy is worse than minAccuracyM', () => {
    const markup = renderPanel({ gpsAccuracyM: 99 })
    expect(markup).toContain('GPS is weak here, so narration may not start by itself.')
    expect(markup).toContain('Tap Play Stop to hear this stop.')
  })

  it('does not show the hint when accuracy is good or unknown', () => {
    const good = renderPanel({ gpsAccuracyM: 8 })
    expect(good).not.toContain('GPS is weak here')

    const unknown = renderPanel({ gpsAccuracyM: null })
    expect(unknown).not.toContain('GPS is weak here')
  })

  it('still prints the normal Location on readout for a good fix', () => {
    const markup = renderPanel({ gpsAccuracyM: 12 })
    expect(markup).toContain('Location on · ±12 m')
  })
})
