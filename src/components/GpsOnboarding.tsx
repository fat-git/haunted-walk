/**
 * GPS permission onboarding.
 *
 * Shown before the browser's permission prompt is allowed to fire: the walker
 * reads why the tour needs location, that it never leaves the device, and then
 * chooses to enable it or start without it. `gps.start()` is only called after
 * the "Enable location access" tap.
 */

import { useEffect, useRef } from 'react'

interface GpsOnboardingProps {
  isOpen: boolean
  onEnableLocation: () => void
  onStartWithoutGps: () => void
}

export function GpsOnboarding({
  isOpen,
  onEnableLocation,
  onStartWithoutGps,
}: GpsOnboardingProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const choseRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    if (!dialog) return

    choseRef.current = false
    dialog.showModal()
    dialog.focus()

    // Covers Escape and any other native close path: declining the explainer
    // still starts the tour, with manual playback instead of auto-narration.
    const handleClose = () => {
      if (!choseRef.current) onStartWithoutGps()
    }
    dialog.addEventListener('close', handleClose)

    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.close()
    }
  }, [isOpen, onStartWithoutGps])

  const handleEnableLocation = () => {
    choseRef.current = true
    onEnableLocation()
  }

  const handleStartWithoutGps = () => {
    choseRef.current = true
    onStartWithoutGps()
  }

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      className="safety-notice gps-onboarding"
      role="alertdialog"
      aria-labelledby="gps-title"
      aria-describedby="gps-description"
    >
      <div className="safety-content">
        <h2 id="gps-title">Location Access</h2>

        <div id="gps-description" className="safety-body">
          <p>
            <strong>Why location?</strong> The tour watches your position to know when you
            arrive at a stop, so narration starts on its own and the distance to the next
            stop stays current.
          </p>

          <p>
            <strong>Your position never leaves your device.</strong> No accounts, no
            analytics, nothing is uploaded or shared.
          </p>

          <p>
            <strong>What happens next.</strong> Your browser will ask to allow location
            access. Choose Allow, or While using the app. Precise location works best.
          </p>
        </div>

        <div className="safety-actions">
          <button
            className="btn btn-secondary"
            onClick={handleStartWithoutGps}
            type="button"
          >
            Start Without GPS
          </button>
          <button
            className="btn btn-primary"
            onClick={handleEnableLocation}
            type="button"
            autoFocus
          >
            Enable Location Access
          </button>
        </div>

        <p className="footer-note">
          You can turn location on later from the navigation panel.
        </p>
      </div>
    </dialog>
  )
}
