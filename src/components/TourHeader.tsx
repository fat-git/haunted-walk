/**
 * Tour header showing progress and current stop info.
 */

import type { Tour } from '../types/tour'

interface TourHeaderProps {
  tour: Tour
  currentStopIndex: number
  phase: 'idle' | 'ready' | 'active' | 'paused' | 'completed'
  rank?: string
}

export function TourHeader({ tour, currentStopIndex, phase, rank }: TourHeaderProps) {
  const currentStop = tour.stops[currentStopIndex]
  const visitedCount = phase === 'completed' ? tour.stops.length : currentStopIndex
  const progress = tour.stops.length > 0 ? (visitedCount / tour.stops.length) * 100 : 0

  if (phase === 'idle') {
    return (
      <header className="tour-header">
        <h2>{tour.name}</h2>
        <p className="tour-description">{tour.description}</p>
        <div className="tour-stats">
          <span>{tour.stops.length} stops</span>
          <span>·</span>
          <span>~{Math.round(tour.stops.length * 8)} min walk</span>
        </div>
      </header>
    )
  }

  return (
    <header className="tour-header active">
      <div
        className="tour-progress"
        role="progressbar"
        aria-valuenow={visitedCount}
        aria-valuemin={0}
        aria-valuemax={tour.stops.length}
        aria-label="Tour progress"
      >
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">
          {visitedCount} of {tour.stops.length} stops
        </span>
      </div>

      {currentStop && (
        <div className="current-stop-badge">
          <span className="stop-number">Stop {currentStopIndex + 1}</span>
          <span className="stop-name">{currentStop.name}</span>
        </div>
      )}

      {rank && phase !== 'completed' && (
        <div className="rank-badge" data-testid="visit-rank">
          <span className="rank-label" aria-live="polite">
            Rank: {rank}
          </span>
        </div>
      )}

      {phase === 'paused' && (
        <div className="paused-indicator" aria-live="polite">
          ⏸ Paused
        </div>
      )}

      {phase === 'completed' && (
        <div className="completed-indicator" aria-live="polite">
          ✓ Tour Complete
        </div>
      )}
    </header>
  )
}
