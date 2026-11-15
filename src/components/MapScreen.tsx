import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TourMetadata, TourStop } from '../types/tour'
import {
  loadRoute,
  TILE_URL,
  TILE_ATTRIBUTION,
  TILE_SUBDOMAINS,
} from '../services/tourLoader'

const DEFAULT_CENTER: [number, number] = [29.9511, -90.064]
const DEFAULT_ZOOM = 16

function CustomMarker({ stop, isCurrent }: { stop: TourStop; isCurrent: boolean }) {
  return (
    <Marker position={[stop.lat, stop.lon]}>
      <div className={`custom-marker ${isCurrent ? 'current' : ''}`}>
        <span className="marker-dot" />
        <span className="marker-label">
          {stop.id === 'st-louis-cemetery-view' ? '1' : '2'}
        </span>
      </div>
      <Popup>
        <strong>{stop.name}</strong>
        <p>{stop.address}</p>
      </Popup>
    </Marker>
  )
}

export default function MapScreen({ tour }: { tour: TourMetadata }) {
  const [position, setPosition] = useState<{
    lat: number
    lon: number
    accuracy: number
  } | null>(null)
  const [route, setRoute] = useState<GeoJSON.FeatureCollection | null>(null)
  const [error, setError] = useState<string | null>(
    'geolocation' in navigator ? null : 'Geolocation is not supported by this browser.',
  )

  useEffect(() => {
    loadRoute('new-orleans-fq').then(setRoute).catch(console.error)
  }, [])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        setPosition({ lat: latitude, lon: longitude, accuracy })
        setError(null)
      },
      (err) => {
        setError(`GPS error: ${err.message}`)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return (
    <div className="screen map-screen">
      <header className="map-header">
        <h1>{tour.name}</h1>
        <div className="status-row">
          <span className="gps-status">
            {position ? '📍 GPS active' : '📍 Acquiring GPS…'}
          </span>
          {error && <span className="gps-error">{error}</span>}
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
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            subdomains={TILE_SUBDOMAINS}
            maxZoom={19}
          />
          {route && route.features[0]?.geometry?.type === 'LineString' && (
            <Polyline
              positions={
                (route.features[0].geometry as GeoJSON.LineString).coordinates.map(
                  ([lng, lat]) => [lat, lng],
                ) as [number, number][]
              }
              color="#8b5cf6"
              weight={4}
              opacity={0.8}
            />
          )}
          {tour.stops.map((stop, idx) => (
            <CustomMarker key={stop.id} stop={stop} isCurrent={idx === 0} />
          ))}
          {position && (
            <Marker position={[position.lat, position.lon]} icon={userLocationIcon()}>
              <Popup>You are here (±{position.accuracy.toFixed(0)} m)</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <section className="stops-list">
        <h2>Tour Stops</h2>
        <ul>
          {tour.stops.map((stop, idx) => (
            <li key={stop.id} className={idx === 0 ? 'current' : ''}>
              <span className="stop-number">{idx + 1}</span>
              <div>
                <strong>{stop.name}</strong>
                <p>{stop.address}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function userLocationIcon() {
  return L.divIcon({
    className: 'user-location-marker',
    html: '<div class="user-dot" />',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}
