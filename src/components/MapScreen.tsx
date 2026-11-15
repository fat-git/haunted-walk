import { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TourMetadata, TourStop } from '../types/tour';
import { loadRoute, mapDeepLink } from '../services/tourLoader';
import { useGeofence } from '../hooks/useGeofence';
import { useNarration } from '../hooks/useNarration';
import { useWakeLock } from '../hooks/useWakeLock';

const DEFAULT_CENTER: [number, number] = [29.9511, -90.064];
const DEFAULT_ZOOM = 16;

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function CustomMarker({ stop, isCurrent }: { stop: TourStop; isCurrent: boolean }) {
  return (
    <Marker position={[stop.lat, stop.lon]}>
      <div className={`custom-marker ${isCurrent ? 'current' : ''}`}>
        <span className="marker-dot" />
        <span className="marker-label">{stop.id === 'st-louis-cemetery-view' ? '1' : '2'}</span>
      </div>
      <Popup>
        <strong>{stop.name}</strong>
        <p>{stop.address}</p>
      </Popup>
    </Marker>
  );
}

export default function MapScreen({ tour }: { tour: TourMetadata }) {
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [route, setRoute] = useState<GeoJSON.FeatureCollection | null>(null);
  const [deepLinkUrl, setDeepLinkUrl] = useState('');
  const [distanceToStop, setDistanceToStop] = useState<number | null>(null);

  const { isLocked, supported: wakeSupported, request: requestWakeLock } = useWakeLock();
  const currentStop = tour.stops[currentStopIndex];

  const { isInside, distance, position, accuracy, reset: resetGeofence } = useGeofence({
    target: currentStop?.viewpoint || null,
    enterRadiusM: currentStop?.geofenceRadiusM || 30,
    exitRadiusM: (currentStop?.geofenceRadiusM || 30) * 1.5,
  });

  const { isPlaying, isPaused, spokenText, supported: speechSupported, play, pause, replay, stop } = useNarration({
    text: currentStop?.narration || '',
    onComplete: () => {},
  });

  useEffect(() => {
    loadRoute('new-orleans-fq').then(setRoute).catch(console.error);
    if (currentStop) {
      setDeepLinkUrl(mapDeepLink(currentStop.viewpoint.lat, currentStop.viewpoint.lon));
    }
  }, [currentStop]);

  useEffect(() => {
    if (isInside && !isPlaying && !isPaused) {
      requestWakeLock();
      play();
    }
  }, [isInside, isPlaying, isPaused, play, requestWakeLock]);

  useEffect(() => {
    if (distance !== null) {
      setDistanceToStop(Math.round(distance));
    }
  }, [distance]);

  const handleNextStop = useCallback(() => {
    stop();
    if (currentStopIndex < tour.stops.length - 1) {
      setCurrentStopIndex((i) => i + 1);
      resetGeofence();
    }
  }, [currentStopIndex, tour.stops.length, stop, resetGeofence]);

  const handleReplay = useCallback(() => {
    replay();
  }, [replay]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  return (
    <div className="screen map-screen">
      <header className="map-header">
        <h1>{tour.name}</h1>
        <div className="status-row">
          {wakeSupported ? (
            <span className={isLocked ? 'wake-lock on' : 'wake-lock off'}>
              {isLocked ? '🔒 Screen awake' : '🔓 Screen may sleep'}
            </span>
          ) : (
            <span className="wake-lock unsupported">Screen lock not supported</span>
          )}
          <span className="gps-status">
            {position ? '📍 GPS active' : '📍 Acquiring GPS…'}
          </span>
        </div>
      </header>

      <div className="map-container">
        <MapContainer
          center={position ? [position.lat, position.lon] : DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution={OSM_ATTRIBUTION}
            maxZoom={19}
          />
          {route && route.features[0]?.geometry?.type === 'LineString' && (
            <Polyline
              positions={(route.features[0].geometry as GeoJSON.LineString).coordinates.map(([lng, lat]) => [lat, lng]) as [number, number][]}
              color="#8b5cf6"
              weight={4}
              opacity={0.8}
            />
          )}
          {currentStop && (
            <Circle
              center={[currentStop.viewpoint.lat, currentStop.viewpoint.lon]}
              radius={currentStop.geofenceRadiusM}
              color="#8b5cf6"
              fillColor="#8b5cf6"
              fillOpacity={0.15}
              weight={2}
              dashArray="5,5"
            />
          )}
          {tour.stops.map((stop, idx) => (
            <CustomMarker key={stop.id} stop={stop} isCurrent={idx === currentStopIndex} />
          ))}
          {position && (
            <Marker position={[position.lat, position.lon]} icon={userLocationIcon()}>
              <Popup>You are here (±{accuracy?.toFixed(0)} m)</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <section className="nav-info">
        <div className="next-stop">
          <span className="label">Next:</span>
          <strong>{currentStop?.name}</strong>
        </div>
        <div className="distance">
          {distanceToStop !== null ? (
            <>
              <span className="label">Distance:</span>
              <strong>{distanceToStop} m</strong>
            </>
          ) : (
            <span className="label">Locating…</span>
          )}
        </div>
        <a href={deepLinkUrl} target="_blank" rel="noopener noreferrer" className="maps-link">
          Open in Maps →
        </a>
      </section>

      <section className="narration-panel">
        <div className="narration-header">
          <h3>{currentStop?.name}</h3>
          <span className="legend-badge">{currentStop?.legendLabel}</span>
        </div>
        <div className="narration-transcript">
          {spokenText || currentStop?.narration}
        </div>
        <div className="narration-controls">
          <button className="btn" onClick={handlePlayPause} disabled={!speechSupported}>
            {isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}
          </button>
          <button className="btn secondary" onClick={handleReplay} disabled={!speechSupported}>
            Replay
          </button>
          <button className="btn secondary" onClick={handleNextStop}>
            Next Stop
          </button>
        </div>
      </section>
    </div>
  );
}

function userLocationIcon() {
  return L.divIcon({
    className: 'user-location-marker',
    html: '<div class="user-dot" />',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}