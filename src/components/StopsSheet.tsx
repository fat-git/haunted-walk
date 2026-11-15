/**
 * In-tour stop list sheet (FAT-47).
 *
 * Lets a walker jump to any stop, forward or back, even if they never reached
 * the next location. Each row is a real button with a confirm-free single
 * tap to jump; the current stop is marked and not a jump target. Reuses the
 * same jumpToStop path as the start page's "Start here" actions.
 */

import type { Tour } from '../types/tour'

interface StopsSheetProps {
  tour: Tour
  currentStopIndex: number
  open: boolean
  onClose: () => void
  onJumpStop: (index: number) => void
}

export function StopsSheet({
  tour,
  currentStopIndex,
  open,
  onClose,
  onJumpStop,
}: StopsSheetProps) {
  if (!open) return null

  return (
    <div className="stops-sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="stops-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a stop"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="stops-sheet-header">
          <h3>Jump to a stop</h3>
          <button
            className="control-btn tertiary stops-close"
            onClick={onClose}
            aria-label="Close stop list"
            type="button"
          >
            Close
          </button>
        </header>

        <ul className="stops-sheet-list">
          {tour.stops.map((stop, index) => {
            const isCurrent = index === currentStopIndex
            return (
              <li key={stop.id} className="stops-sheet-item">
                {isCurrent ? (
                  <p className="stops-current" aria-current="true">
                    <span className="stop-index">{index + 1}</span>
                    <span className="stops-current-details">
                      <strong>{stop.name}</strong>
                      <span>{stop.address}</span>
                    </span>
                    <span className="stops-current-badge">You are here</span>
                  </p>
                ) : (
                  <button
                    className="stops-jump-btn"
                    onClick={() => onJumpStop(index)}
                    aria-label={`Jump to stop ${index + 1}: ${stop.name}`}
                    type="button"
                  >
                    <span className="stop-index">{index + 1}</span>
                    <span className="stops-current-details">
                      <strong>{stop.name}</strong>
                      <span>{stop.address}</span>
                    </span>
                    <span className="stops-jump-action">Jump here</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
