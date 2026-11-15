import { useEffect, useState } from 'react';
import type { CityRegistry, TourMetadata } from './types/tour';
import { loadTour } from './services/tourLoader';
import StartScreen from './components/StartScreen';
import MapScreen from './components/MapScreen';

type Phase = 'loading' | 'start' | 'tour';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [tour, setTour] = useState<TourMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tours/index.json`)
      .then((r) => r.json())
      .then((registry: CityRegistry) => {
        const defaultCity = registry.cities[0];
        return loadTour(defaultCity.defaultTour, defaultCity.id);
      })
      .then((t) => {
        setTour(t);
        setPhase('start');
      })
      .catch((e) => {
        setError(String(e));
        setPhase('start');
      });
  }, []);

  if (phase === 'loading') {
    return (
      <div className="app">
        <div className="loading">Loading Haunted Walk…</div>
      </div>
    );
  }

  if (phase === 'start' || !tour) {
    return (
      <StartScreen
        error={error}
        onStart={() => setPhase('tour')}
      />
    );
  }

  return <MapScreen tour={tour} />;
}
