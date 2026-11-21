/**
 * Map component using Leaflet.
 *
 * Displays the tour route, stops, user position, and geofence circles.
 */

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { routeUrl } from '../lib/tourPaths'
import { formatDistanceM } from '../lib/format'
import type { Tour, RouteFile } from '../types/tour'
import type { GeoPoint } from '../lib/geofence'

interface MapProps {
  tour: Tour
  currentStopIndex: number
  userPosition: GeoPoint | null
  userAccuracyM: number | null
  isAtStop: boolean
  distanceToCurrentStop: number | null
  className?: string
}

export function Map({
  tour,
  currentStopIndex,
  userPosition,
  userAccuracyM,
  isAtStop,
  distanceToCurrentStop,
  className = '',
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup>(L.layerGroup())
  const userMarkerRef = useRef<L.CircleMarker | null>(null)
  const accuracyCircleRef = useRef<L.Circle | null>(null)
  const geofenceCircleRef = useRef<L.Circle | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const [routeData, setRouteData] = useState<RouteFile | null>(null)
  const [tilesUnavailable, setTilesUnavailable] = useState(false)
  const tileLayerRef = useRef<L.TileLayer | null>(null)

  // Load the precomputed route. On failure we keep `routeData` null and the
  // render effect below draws straight stop-to-stop lines instead.
  useEffect(() => {
    fetch(routeUrl(tour.city))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load route: ${res.status}`)
        return res.json()
      })
      .then((data: RouteFile) => {
        setRouteData(data)
      })
      .catch((error: unknown) => {
        console.warn('Falling back to straight stop-to-stop lines:', error)
      })
  }, [tour.city])

  // Initialize map
  const initialLat = tour.stops[0]?.lat
  const initialLon = tour.stops[0]?.lon

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
      dragging: true,
    }).setView([initialLat, initialLon], 16)

    mapInstanceRef.current = map

    // Add OSM tile layer
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
    tileLayerRef.current = tiles
    // Show a non-blocking notice when tiles cannot load (offline), and clear it
    // as soon as tiles load again. Markers and the route polyline render on
    // their own layers and keep working without tiles.
    tiles.on('tileerror', () => setTilesUnavailable(true))
    tiles.on('tileload', () => setTilesUnavailable(false))
    tiles.addTo(map)

    // Add markers layer
    markersRef.current.addTo(map)

    // Add route layer
    routeLayerRef.current = L.layerGroup().addTo(map)

    // Add zoom control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Cleanup on unmount
    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [initialLat, initialLon])

  // Render the route: the precomputed geometry once it loads, and straight
  // stop-to-stop lines until then, so the map is never left without a route.
  useEffect(() => {
    const map = mapInstanceRef.current
    const routeLayer = routeLayerRef.current
    if (!map || !routeLayer) return

    routeLayer.clearLayers()

    const routeFeature = routeData?.features[0]
    const isPlaceholder = !routeData || routeData.metadata.status === 'placeholder'

    // GeoJSON is [lon, lat], Leaflet expects [lat, lon]
    const latLngs: [number, number][] = routeFeature
      ? routeFeature.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      : tour.stops.map((stop) => [stop.lat, stop.lon])

    if (latLngs.length < 2) return

    const routeLine = L.polyline(latLngs, {
      color: isPlaceholder ? '#f0b45c' : '#26262f',
      weight: 3,
      opacity: 0.8,
      dashArray: isPlaceholder ? '8, 6' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      className: isPlaceholder ? 'route-placeholder' : 'route-computed',
    })
    routeLayer.addLayer(routeLine)
  }, [routeData, tour.stops])

  // Render stops when map is ready
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const layerGroup = markersRef.current
    layerGroup.clearLayers()

    const currentStop = tour.stops[currentStopIndex]

    // Add stop markers
    tour.stops.forEach((stop, index) => {
      const isCurrent = index === currentStopIndex
      const isVisited = index < currentStopIndex

      const markerColor = isCurrent ? '#f0b45c' : isVisited ? '#7b756e' : '#26262f'
      const markerBorder = isCurrent ? '#f0b45c' : '#f2eee8'

      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: isCurrent ? 10 : 8,
        fillColor: markerColor,
        color: markerBorder,
        weight: 2,
        opacity: 1,
        fillOpacity: isCurrent ? 1 : 0.8,
        className: `stop-marker ${isCurrent ? 'current' : ''} ${isVisited ? 'visited' : ''}`,
      })

      const tooltipContent = `
        <div class="stop-tooltip">
          <strong>${stop.name}</strong>
          <span class="stop-number">${index + 1} of ${tour.stops.length}</span>
          ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
          ${isVisited ? '<span class="visited-badge">Visited</span>' : ''}
        </div>
      `
      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -12],
        className: 'custom-tooltip',
        sticky: true,
      })

      layerGroup.addLayer(marker)
    })

    // Add geofence circle for current stop
    if (currentStop && geofenceCircleRef.current) {
      map.removeLayer(geofenceCircleRef.current)
    }
    if (currentStop) {
      geofenceCircleRef.current = L.circle([currentStop.lat, currentStop.lon], {
        radius: currentStop.geofenceRadiusM,
        color: '#f0b45c',
        weight: 2,
        opacity: 0.6,
        fillColor: '#f0b45c',
        fillOpacity: 0.1,
        dashArray: '6, 4',
        className: 'geofence-circle',
      })
      layerGroup.addLayer(geofenceCircleRef.current)
    }

    // Fit bounds to show all stops on initial load
    if (tour.stops.length > 0) {
      const bounds = L.latLngBounds(tour.stops.map((s) => [s.lat, s.lon]))
      map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 17 })
    }
  }, [tour, currentStopIndex])

  // Update user position marker
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !userPosition) return

    const layerGroup = markersRef.current

    // Update or create user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPosition.lat, userPosition.lon])
    } else {
      userMarkerRef.current = L.circleMarker([userPosition.lat, userPosition.lon], {
        radius: 8,
        fillColor: '#f0b45c',
        color: '#0b0b0f',
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
        className: 'user-marker',
      })
      layerGroup.addLayer(userMarkerRef.current)
    }

    // Update or create accuracy circle
    if (userAccuracyM && userAccuracyM > 0) {
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([userPosition.lat, userPosition.lon])
        accuracyCircleRef.current.setRadius(userAccuracyM)
      } else {
        accuracyCircleRef.current = L.circle([userPosition.lat, userPosition.lon], {
          radius: userAccuracyM,
          color: '#f0b45c',
          weight: 1,
          opacity: 0.3,
          fillColor: '#f0b45c',
          fillOpacity: 0.08,
          className: 'accuracy-circle',
        })
        layerGroup.addLayer(accuracyCircleRef.current)
      }
    } else if (accuracyCircleRef.current) {
      layerGroup.removeLayer(accuracyCircleRef.current)
      accuracyCircleRef.current = null
    }

    // Center map on user if at stop (optional auto-follow)
    if (isAtStop) {
      map.panTo([userPosition.lat, userPosition.lon], { animate: true, duration: 1 })
    }
  }, [userPosition, userAccuracyM, isAtStop])

  const formatDistance =
    distanceToCurrentStop === null ? null : formatDistanceM(distanceToCurrentStop)

  return (
    <div
      className={`map-container ${className}`}
      role="application"
      aria-label="Tour map"
    >
      <div ref={mapRef} className="map" />
      {tilesUnavailable && (
        <div className="map-tile-notice" role="status" aria-live="polite">
          Map tiles unavailable offline. Stop markers and the route line still work; use
          the stop list and Play Stop.
        </div>
      )}
      {formatDistance && (
        <div className="map-distance" aria-live="polite">
          {isAtStop ? '📍 At stop' : `📍 ${formatDistance} to next stop`}
        </div>
      )}
      <div className="map-attribution">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
          OpenStreetMap
        </a>{' '}
        contributors
      </div>
    </div>
  )
}
