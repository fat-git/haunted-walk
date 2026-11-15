/**
 * Map component using Leaflet.
 *
 * Displays the tour route, stops, user position, and geofence circles.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { withBase } from '../lib/url'
import type { Tour, RouteFile } from '../types/tour'
import type { GeoPoint } from '../lib/geofence'

// Fix Leaflet default icon paths
const iconDefaultProto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string }
delete iconDefaultProto._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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

  // Load route.geojson
  useEffect(() => {
    const routeUrl = withBase(`tours/${tour.city}/${tour.id}/route.geojson`)
    fetch(routeUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load route: ${res.status}`)
        return res.json()
      })
      .then((data: RouteFile) => {
        setRouteData(data)
      })
      .catch(() => {
        // Silently fail - will fall back to stop-to-stop lines
      })
  }, [tour.city, tour.id])

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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

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

  // Render route when route data is loaded
  useEffect(() => {
    const map = mapInstanceRef.current
    const routeLayer = routeLayerRef.current
    if (!map || !routeLayer || !routeData) return

    routeLayer.clearLayers()

    const isPlaceholder = routeData.metadata.status === 'placeholder'
    const routeFeature = routeData.features[0]
    if (!routeFeature) return

    const coordinates = routeFeature.geometry.coordinates
    // GeoJSON is [lon, lat], Leaflet expects [lat, lon]
    const latLngs = coordinates.map(([lon, lat]) => [lat, lon] as [number, number])

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
  }, [routeData])

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

  // Distance display helper
  const formatDistance = useMemo(() => {
    if (distanceToCurrentStop === null) return null
    if (distanceToCurrentStop < 1000) {
      return `${Math.round(distanceToCurrentStop)} m`
    }
    return `${(distanceToCurrentStop / 1000).toFixed(1)} km`
  }, [distanceToCurrentStop])

  return (
    <div
      className={`map-container ${className}`}
      role="application"
      aria-label="Tour map"
    >
      <div ref={mapRef} className="map" />
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
