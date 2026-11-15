import { useEffect, useState } from 'react'
import { TourHeader } from './components/TourHeader'
import { Map } from './components/Map'
import { PlaybackControls } from './components/PlaybackControls'
import { Transcript } from './components/Transcript'
import { SafetyNotice } from './components/SafetyNotice'
import { StartScreen } from './components/StartScreen'
import { CompletedScreen } from './components/CompletedScreen'
import { useTour } from './hooks/useTour'
import { NarrationEngine } from './lib/narration'
import { registryUrl, tourUrl } from './lib/tourPaths'
import type { Tour, CityRegistry, CityEntry } from './types/tour'
import './App.css'

/** Load the tour data from the registry, resolving the default tour for the first city. */
async function loadTour(): Promise<Tour> {
  const registryResponse = await fetch(registryUrl())
  if (!registryResponse.ok) {
    throw new Error(`Failed to load tour registry: ${registryResponse.status}`)
  }
  const registry: CityRegistry = await registryResponse.json()

  const city: CityEntry | undefined = registry.cities[0]
  if (!city) {
    throw new Error('No cities found in tour registry')
  }

  const tourResponse = await fetch(tourUrl(city.id))
  if (!tourResponse.ok) {
    throw new Error(`Failed to load tour: ${tourResponse.status}`)
  }
  const tour: Tour = await tourResponse.json()

  // `defaultTour` is a tour id, not a directory. Check it rather than ignore it,
  // so a registry that names a tour the city folder does not hold fails loudly.
  if (tour.id !== city.defaultTour) {
    throw new Error(
      `Registry names tour "${city.defaultTour}" for ${city.id} but its tour.json is "${tour.id}"`,
    )
  }
  return tour
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="app">
      <main className="shell">
        <header className="masthead">
          <p className="eyebrow">Self-guided ghost tour</p>
          <h1>Haunted Walk</h1>
        </header>
        <section className="card" role="alert">
          <h2>Failed to load tour</h2>
          <p>{message}</p>
          <p className="next">Check your connection and refresh the page.</p>
        </section>
      </main>
      <footer className="footer">
        <p>No accounts, no analytics. Your location never leaves your device.</p>
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
          contributors, available under the Open Database License.
        </p>
      </footer>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="app">
      <main className="shell">
        <header className="masthead">
          <p className="eyebrow">Self-guided ghost tour</p>
          <h1>Haunted Walk</h1>
        </header>
        <section className="card">
          <p className="status">
            <span className="status-dot" aria-hidden="true" />
            Loading tour…
          </p>
        </section>
      </main>
      <footer className="footer">
        <p>No accounts, no analytics. Your location never leaves your device.</p>
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
          contributors, available under the Open Database License.
        </p>
      </footer>
    </div>
  )
}

function TourApp({ tour }: { tour: Tour }) {
  const wakeLockSupported = 'wakeLock' in navigator
  const speechSupported = NarrationEngine.isSupported()

  const {
    phase,
    currentStopIndex,
    currentStop,
    distanceToCurrentStop,
    isAtStop,
    narration,
    safetyNoticeSeen,
    userPosition,
    userAccuracyM,
    audioUnlocked,
    startTour,
    pauseTour,
    resumeTour,
    stopTour,
    nextStop,
    previousStop,
    playCurrentStop,
    replayCurrentSentence,
    dismissSafetyNotice,
    unlockAudio,
  } = useTour(tour)

  const handleStartTour = () => {
    unlockAudio()
    startTour()
  }

  const handlePlayPause = () => {
    if (phase === 'paused') {
      unlockAudio()
      resumeTour()
    } else if (phase === 'active') {
      pauseTour()
    }
  }

  const handleRestart = () => {
    stopTour()
  }

  const showSafetyNotice = !safetyNoticeSeen && (phase === 'idle' || phase === 'ready')

  return (
    <div className="app">
      <main className="shell">
        {/* Safety Notice Modal */}
        <SafetyNotice
          isOpen={showSafetyNotice}
          onDismiss={dismissSafetyNotice}
          onStartTour={handleStartTour}
        />

        {/* Start Screen */}
        {phase === 'idle' && !showSafetyNotice && (
          <StartScreen
            tour={tour}
            onStartTour={handleStartTour}
            wakeLockSupported={wakeLockSupported}
            speechSupported={speechSupported}
          />
        )}

        {/* Active Tour UI */}
        {phase !== 'idle' && phase !== 'completed' && (
          <>
            <TourHeader tour={tour} currentStopIndex={currentStopIndex} phase={phase} />

            <Map
              tour={tour}
              currentStopIndex={currentStopIndex}
              userPosition={userPosition}
              userAccuracyM={userAccuracyM}
              isAtStop={isAtStop}
              distanceToCurrentStop={distanceToCurrentStop}
            />

            <PlaybackControls
              narration={narration}
              currentStop={currentStop}
              phase={phase}
              isAtStop={isAtStop}
              onPlayPause={handlePlayPause}
              onReplay={replayCurrentSentence}
              onNextStop={nextStop}
              onPreviousStop={previousStop}
              onPlayCurrentStop={playCurrentStop}
              onReplaySentence={replayCurrentSentence}
              hasNextStop={currentStopIndex < tour.stops.length - 1}
              hasPreviousStop={currentStopIndex > 0}
              audioUnlocked={audioUnlocked}
            />

            {narration && (
              <Transcript
                sentences={narration.getSentences()}
                currentSentenceIndex={narration.getState().currentSentenceIndex}
                isPlaying={narration.getState().isPlaying}
              />
            )}

            {/* Wake lock status indicator */}
            {!wakeLockSupported && (
              <div className="card card-quiet" role="status">
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>
                  ⚠ Wake Lock not supported in this browser. Screen may dim and GPS may
                  pause.
                </p>
              </div>
            )}
          </>
        )}

        {/* Completed Screen */}
        {phase === 'completed' && (
          <CompletedScreen tour={tour} onRestart={handleRestart} />
        )}
      </main>

      <footer className="footer">
        <p>No accounts, no analytics. Your location never leaves your device.</p>
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
          contributors, available under the Open Database License.
        </p>
      </footer>
    </div>
  )
}

function App() {
  const [tour, setTour] = useState<Tour | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load tour data on mount
  useEffect(() => {
    loadTour()
      .then(setTour)
      .catch((err) => setLoadError(err.message))
  }, [])

  if (loadError) {
    return <ErrorScreen message={loadError} />
  }

  if (!tour) {
    return <LoadingScreen />
  }

  return <TourApp tour={tour} />
}

export default App
