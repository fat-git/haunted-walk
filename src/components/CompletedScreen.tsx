/**
 * Screen shown when tour is completed.
 */

import { useMemo } from 'react'
import type { Tour } from '../types/tour'
import { computeSummary, type VisitProgress } from '../lib/progress'

interface CompletedScreenProps {
  tour: Tour
  onRestart: () => void
  progress: VisitProgress
  rank: string
}

export function CompletedScreen({
  tour,
  onRestart,
  progress,
  rank,
}: CompletedScreenProps) {
  const summary = useMemo(
    () => computeSummary(progress, tour.stops.length),
    [progress, tour.stops.length],
  )

  return (
    <div className="completed-screen">
      <div className="completion-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="64" height="64">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            fill="currentColor"
          />
        </svg>
      </div>

      <h2>Tour Complete</h2>
      <p className="completion-message">
        You've walked all {tour.stops.length} stops of <strong>{tour.name}</strong>.
        Thanks for joining the walk.
      </p>

      <div className="tour-summary">
        <h3>Stops visited</h3>
        <ul>
          {tour.stops.map((stop, index) => (
            <li key={stop.id}>
              <span className="summary-stop-number">{index + 1}</span>
              <span className="summary-stop-name">{stop.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="visit-progress-summary">
        <h3>Your progress</h3>
        <p className="rank-display">
          <strong>{rank}</strong>
        </p>
        <p className="summary-text">{summary}</p>
      </div>

      <button className="btn btn-primary" onClick={onRestart} type="button">
        Start Over
      </button>

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
