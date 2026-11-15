/**
 * Safety notice modal shown on first launch.
 *
 * Warns about traffic, screen attention, and recommends groups at night.
 */

import { useEffect, useRef } from 'react'

interface SafetyNoticeProps {
  isOpen: boolean
  onDismiss: () => void
  onStartTour: () => void
}

export function SafetyNotice({ isOpen, onDismiss, onStartTour }: SafetyNoticeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    if (!dialog) return

    previousActiveElement.current = document.activeElement as HTMLElement
    dialog.showModal()
    dialog.focus()

    const handleClose = () => {
      onDismiss()
    }

    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.close()
    }
  }, [isOpen, onDismiss])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onDismiss()
    }
  }

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      className="safety-notice"
      onKeyDown={handleKeyDown}
      role="alertdialog"
      aria-labelledby="safety-title"
      aria-describedby="safety-description"
    >
      <div className="safety-content">
        <h2 id="safety-title">Safety First</h2>

        <div id="safety-description" className="safety-body">
          <p>
            <strong>Watch traffic.</strong> You are walking on real streets with real
            vehicles. Cross at crosswalks. Look up from your phone.
          </p>

          <p>
            <strong>Don't walk and read.</strong> Stop moving before reading the
            transcript or interacting with the screen.
          </p>

          <p>
            <strong>Best in groups at night.</strong> This is a ghost tour after dark.
            Bring a friend. Stay on well-lit sidewalks.
          </p>

          <p>
            <strong>Your location stays on your device.</strong> No tracking, no accounts,
            no data leaves your phone.
          </p>

          <p>
            <strong>Screen stays awake.</strong> The app requests a wake lock so GPS keeps
            running. Your screen won't dim during the tour.
          </p>
        </div>

        <div className="safety-actions">
          <button className="btn btn-secondary" onClick={onDismiss} type="button">
            Not Now
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onDismiss()
              onStartTour()
            }}
            type="button"
            autoFocus
          >
            Start Tour
          </button>
        </div>
      </div>
    </dialog>
  )
}
