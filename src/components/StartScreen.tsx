/**
 * Start screen shown before tour begins.
 *
 * Includes the FAT-43 "Test audio" button so the walker can verify speech
 * output with a single tap before starting the walk.
 */

import { useState } from 'react'
import type { Tour } from '../types/tour'
import { appleMapsDirectionsUrl, googleMapsDirectionsUrl } from '../lib/mapsLinks'
import { formatAudioCheck, runAudioCheck, type AudioCheckResult } from '../lib/narration'

interface StartScreenProps {
  tour: Tour
  onStartTour: () => void
  wakeLockSupported: boolean
  speechSupported: boolean
}

export function StartScreen({
  tour,
  onStartTour,
  wakeLockSupported,
  speechSupported,
}: StartScreenProps) {
  const [audioCheck, setAudioCheck] = useState<AudioCheckResult | null>(null)
  const [checkingAudio, setCheckingAudio] = useState(false)

  const handleTestAudio = async () => {
    setCheckingAudio(true)
    setAudioCheck(null)
    try {
      setAudioCheck(await runAudioCheck())
    } finally {
      setCheckingAudio(false)
    }
  }

  return (
    <div className="start-screen">
      <header className="tour-header">
        <h2>{tour.name}</h2>
        <p className="tour-description">{tour.description}</p>
        <div className="tour-stats">
          <span>{tour.stops.length} stops</span>
          <span>·</span>
          <span>~{Math.round(tour.stops.length * 8)} min walk</span>
        </div>
      </header>

      <div className="start-preview">
        <h3>Stops on this tour</h3>
        <ul className="stop-list">
          {tour.stops.map((stop, index) => (
            <li key={stop.id} className="stop-list-item">
              <span className="stop-index">{index + 1}</span>
              <div className="stop-details">
                <strong>{stop.name}</strong>
                <span>{stop.address}</span>
              </div>
              <div className="stop-directions">
                <a
                  href={googleMapsDirectionsUrl(stop.viewpoint.lat, stop.viewpoint.lon)}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${stop.name} in Google Maps`}
                >
                  Google Maps
                </a>
                <a
                  href={appleMapsDirectionsUrl(stop.viewpoint.lat, stop.viewpoint.lon)}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${stop.name} in Apple Maps`}
                >
                  Apple Maps
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="feature-badges" role="list" aria-label="Tour features">
        <div className="feature-badge" role="listitem">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
              fill="currentColor"
            />
          </svg>
          <span>GPS-guided</span>
        </div>
        <div className="feature-badge" role="listitem">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
              fill="currentColor"
            />
          </svg>
          <span>Auto-narration</span>
        </div>
        <div className="feature-badge" role="listitem">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
              fill="currentColor"
            />
          </svg>
          <span>Wake Lock</span>
        </div>
        <div className="feature-badge" role="listitem">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
              fill="currentColor"
            />
          </svg>
          <span>Offline-first</span>
        </div>
      </div>

      <div className="capability-status" role="status" aria-live="polite">
        <div className={`capability ${speechSupported ? 'supported' : 'unsupported'}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {speechSupported ? (
              <path
                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                fill="currentColor"
              />
            ) : (
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                fill="currentColor"
              />
            )}
          </svg>
          <span>{speechSupported ? 'Speech ready' : 'Speech unsupported'}</span>
        </div>
        <div className={`capability ${wakeLockSupported ? 'supported' : 'unsupported'}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {wakeLockSupported ? (
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
                fill="currentColor"
              />
            ) : (
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                fill="currentColor"
              />
            )}
          </svg>
          <span>{wakeLockSupported ? 'Wake Lock ready' : 'Wake Lock unsupported'}</span>
        </div>
      </div>

      <button className="btn btn-primary btn-start" onClick={onStartTour} type="button">
        Start Tour
      </button>

      <div className="audio-check">
        <button
          className="btn btn-secondary audio-check-button"
          onClick={handleTestAudio}
          disabled={!speechSupported || checkingAudio}
          type="button"
        >
          {checkingAudio ? 'Testing audio…' : 'Test audio'}
        </button>
        {audioCheck && (
          <p className="audio-check-result" role="status" aria-live="polite">
            {formatAudioCheck(audioCheck)}
          </p>
        )}
        {!speechSupported && (
          <p className="audio-check-hint">
            This browser cannot speak. Narration needs Safari (iOS) or Chrome (Android).
          </p>
        )}
      </div>

      <p className="footer-note">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </div>
  )
}
