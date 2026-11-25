/**
 * In-tour stop list sheet (FAT-47).
 *
 * Lets a walker jump to any stop, forward or back, even if they never reached
 * the next location. Each row is a real button with a confirm-free single
 * tap to jump; the current stop is marked and not a jump target. Reuses the
 * same jumpToStop path as the start page's "Start here" actions.
 *
 * Accessibility (FAT-56): while open this behaves as a modal dialog. Focus is
 * trapped inside the sheet (Tab and Shift+Tab cycle through its controls),
 * Escape closes it, and focus returns to the element that opened it (the
 * "Stops" button) on close.
 */

import { useEffect, useRef } from 'react'
import type { Tour } from '../types/tour'

interface StopsSheetProps {
  tour: Tour
  currentStopIndex: number
  open: boolean
  onClose: () => void
  onJumpStop: (index: number) => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** The sheet's own focusable controls, in document order. */
function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

export function StopsSheet({
  tour,
  currentStopIndex,
  open,
  onClose,
  onJumpStop,
}: StopsSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  // Keep the latest onClose without re-running the open/close effect on
  // unrelated parent re-renders (which would steal focus back into the sheet).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // While the sheet is open: move focus in, trap Tab within it, close on
  // Escape, and restore focus to the opener when it closes.
  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    if (!sheet) return

    previousFocusRef.current = document.activeElement as HTMLElement | null

    // Focus the first control so the sheet is immediately keyboard-operable.
    focusableIn(sheet)[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableIn(sheet)
      if (focusable.length === 0) {
        event.preventDefault()
        sheet.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // Wrap forward from the last control, or back from the first.
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="stops-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="stops-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a stop"
        tabIndex={-1}
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
      </div>
    </div>
  )
}
