import { useState } from 'react'

interface Props {
  error: string | null
  onStart: () => void
}

export default function StartScreen({ error, onStart }: Props) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="screen start-screen">
      <h1>Haunted Walk</h1>
      <p className="subtitle">Self-guided ghost tour · New Orleans French Quarter</p>

      <section className="safety-notice">
        <h2>Safety Notice</h2>
        <ul>
          <li>Watch for traffic at every crossing.</li>
          <li>Do not walk while staring at the screen.</li>
          <li>This tour is best done in groups, especially at night.</li>
          <li>All stops are on public sidewalks only.</li>
        </ul>
      </section>

      <section className="permission-explainer">
        <h2>What this app needs</h2>
        <ul>
          <li>Your location (GPS) to know when you reach each stop.</li>
          <li>Audio — narration starts automatically at each stop.</li>
          <li>The screen stays awake during the tour so GPS keeps working.</li>
        </ul>
        <p className="hint">
          Audio cannot play until you tap below. Your first tap unlocks speech on this
          device.
        </p>
      </section>

      <label className="agree-row">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        I have read the safety notice and I agree to use this app responsibly.
      </label>

      <button className="start-button" disabled={!agreed} onClick={onStart} type="button">
        Start Tour
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
