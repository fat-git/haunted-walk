import { useCallback, useEffect, useState } from 'react'
import { TourHeader } from './components/TourHeader'
import { Map } from './components/Map'
import { NavigationPanel } from './components/NavigationPanel'
import { PlaybackControls } from './components/PlaybackControls'
import { Transcript } from './components/Transcript'
import { SafetyNotice } from './components/SafetyNotice'
import { GpsOnboarding } from './components/GpsOnboarding'
import { StartScreen } from './components/StartScreen'
import { CompletedScreen } from './components/CompletedScreen'
import { StopsSheet } from './components/StopsSheet'
import { useTour } from './hooks/useTour'
import { NarrationEngine } from './lib/narration'
import { cityIdFromSearchParams, loadTour, type LoadTourResult } from './lib/loadTour'
import type { Tour, CityRegistry, CityEntry } from './types/tour'
import './App.css'

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

function TourApp({
  tour,
  city,
  cities,
  onCityChange,
  fallbackMessage,
}: {
  tour: Tour
  city: CityEntry
  cities: CityEntry[]
  onCityChange: (cityId: string) => void
  fallbackMessage: string | null
}) {
  const speechSupported = NarrationEngine.isSupported()

  const {
    phase,
    currentStopIndex,
    currentStop,
    guidance,
    distanceToCurrentStop,
    isAtStop,
    isOffRoute,
    routeLoaded,
    routeError,
    narration,
    safetyNoticeSeen,
    userPosition,
    userAccuracyM,
    audioUnlocked,
    gpsSupported,
    gpsPermission,
    gpsWatching,
    gpsError,
    wakeLock,
    startTour,
    startTourAtStop,
    startWithLocation,
    startWithoutLocation,
    enableLocation,
    pauseTour,
    resumeTour,
    stopTour,
    nextStop,
    previousStop,
    jumpToStop,
    playCurrentStop,
    replayCurrentSentence,
    restartCurrentStop,
    narrationProblem,
    retryNarration,
    dismissNarrationProblem,
    dismissSafetyNotice,
    unlockAudio,
  } = useTour(tour)

  const [stopsOpen, setStopsOpen] = useState(false)

  const handleStartTour = () => {
    unlockAudio()
    startTour()
  }

  // A per-stop "Start here" tap is a real user gesture: unlock audio on the
  // same path as Start Tour, then walk the usual onboarding (safety notice,
  // GPS explainer) before activating at the chosen stop.
  const handleStartAtStop = (index: number) => {
    unlockAudio()
    startTourAtStop(index)
  }

  // Jumping mid-tour is also a user gesture; unlock so narration for the new
  // stop can play on geofence entry without a second tap.
  const handleJumpStop = (index: number) => {
    unlockAudio()
    jumpToStop(index)
    setStopsOpen(false)
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

        {/* GPS permission onboarding, before any browser prompt */}
        <GpsOnboarding
          isOpen={phase === 'ready'}
          onEnableLocation={startWithLocation}
          onStartWithoutGps={startWithoutLocation}
        />

        {/* Start Screen */}
        {phase === 'idle' && !showSafetyNotice && (
          <StartScreen
            tour={tour}
            city={city}
            cities={cities}
            onStartTour={handleStartTour}
            onStartAtStop={handleStartAtStop}
            onCityChange={onCityChange}
            wakeLockSupported={wakeLock.isSupported}
            speechSupported={speechSupported}
            fallbackMessage={fallbackMessage}
          />
        )}

        {/* Active Tour UI */}
        {phase !== 'idle' && phase !== 'completed' && (
          <>
            <TourHeader tour={tour} currentStopIndex={currentStopIndex} phase={phase} />

            <div className="stops-bar">
              <button
                className="btn btn-secondary stops-toggle"
                onClick={() => setStopsOpen(true)}
                aria-haspopup="dialog"
                type="button"
              >
                Stops
              </button>
            </div>

            <Map
              tour={tour}
              currentStopIndex={currentStopIndex}
              userPosition={userPosition}
              userAccuracyM={userAccuracyM}
              isAtStop={isAtStop}
              distanceToCurrentStop={distanceToCurrentStop}
            />

            {currentStop && (
              <NavigationPanel
                tour={tour}
                currentStopIndex={currentStopIndex}
                currentStop={currentStop}
                guidance={guidance}
                distanceToNextStopM={distanceToCurrentStop}
                isAtStop={isAtStop}
                isOffRoute={isOffRoute}
                routeLoaded={routeLoaded}
                routeError={routeError}
                gpsSupported={gpsSupported}
                gpsPermission={gpsPermission}
                gpsWatching={gpsWatching}
                gpsAccuracyM={userAccuracyM}
                gpsError={gpsError}
                wakeLock={wakeLock}
                onEnableLocation={enableLocation}
              />
            )}

            <PlaybackControls
              narration={narration}
              currentStop={currentStop}
              phase={phase}
              isAtStop={isAtStop}
              onPlayPause={handlePlayPause}
              onReplay={restartCurrentStop}
              onNextStop={nextStop}
              onPreviousStop={previousStop}
              onPlayCurrentStop={playCurrentStop}
              onReplaySentence={replayCurrentSentence}
              hasNextStop={currentStopIndex < tour.stops.length - 1}
              hasPreviousStop={currentStopIndex > 0}
              audioUnlocked={audioUnlocked}
              narrationProblem={narrationProblem}
              onRetryNarration={retryNarration}
              onDismissNarrationProblem={dismissNarrationProblem}
            />

            {narration && (
              <Transcript
                sentences={narration.getSentences()}
                currentSentenceIndex={narration.getState().currentSentenceIndex}
                isPlaying={narration.getState().isPlaying}
              />
            )}
          </>
        )}

        {/* Completed Screen */}
        {phase === 'completed' && (
          <CompletedScreen tour={tour} onRestart={handleRestart} />
        )}

        {/* In-tour stop list for jumping to any stop */}
        <StopsSheet
          tour={tour}
          currentStopIndex={currentStopIndex}
          open={stopsOpen}
          onClose={() => setStopsOpen(false)}
          onJumpStop={handleJumpStop}
        />
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
  const [city, setCity] = useState<CityEntry | null>(null)
  const [registry, setRegistry] = useState<CityRegistry | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)

  const setResult = useCallback((result: LoadTourResult) => {
    setTour(result.tour)
    setCity(result.city)
    setRegistry(result.registry)
    setFallbackMessage(result.fallbackMessage)
    setLoadError(null)
  }, [])

  // Load tour data on mount, honoring a `?city=<id>` deep link. Setters run in
  // `.then`/`.catch` callbacks, not directly in the effect body.
  useEffect(() => {
    loadTour(cityIdFromSearchParams(window.location.search))
      .then(setResult)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
  }, [setResult])

  const handleCityChange = useCallback(
    (cityId: string) => {
      loadTour(cityId)
        .then(setResult)
        .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
    },
    [setResult],
  )

  if (loadError) {
    return <ErrorScreen message={loadError} />
  }

  if (!tour || !city || !registry) {
    return <LoadingScreen />
  }

  return (
    <TourApp
      tour={tour}
      city={city}
      cities={registry.cities}
      onCityChange={handleCityChange}
      fallbackMessage={fallbackMessage}
    />
  )
}

export default App
