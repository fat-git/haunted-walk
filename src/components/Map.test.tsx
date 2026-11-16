/**
 * FAT-76 item 2: Map renders its container and the OpenStreetMap attribution
 * even though Leaflet (and its CSS) are unavailable in the node test
 * environment. The tile-error notice itself is a browser-only behavior
 * (Leaflet `tileerror`/`tileload` events) and is verified by implementation
 * plus a real-device/offline QA pass; it cannot be driven in jsdom-less node.
 */

/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Map } from './Map'
import type { Tour } from '../types/tour'

vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('leaflet', () => {
  const layer = {
    on: vi.fn(),
    off: vi.fn(),
    addTo: vi.fn(),
  }
  const leaflet = {
    map: vi.fn(() => layer),
    tileLayer: vi.fn(() => layer),
    layerGroup: vi.fn(() => layer),
    circleMarker: vi.fn(() => layer),
    circle: vi.fn(() => layer),
    polyline: vi.fn(() => layer),
    latLngBounds: vi.fn(() => ({ pad: vi.fn(() => layer) })),
    control: { zoom: vi.fn(() => layer) },
  }
  return { ...leaflet, default: leaflet }
})

const TOUR: Tour = {
  schemaVersion: 1,
  id: 'test-tour',
  city: 'test-city',
  name: 'Test Tour',
  description: 'A test tour.',
  stops: [
    {
      id: 's1',
      name: 'Stop One',
      lat: 29.95894,
      lon: -90.0706,
      address: '123 Test St',
      viewpoint: {
        lat: 29.95894,
        lon: -90.0706,
        access: 'public-sidewalk',
        description: '',
      },
      geofenceRadiusM: 30,
      narration: 'Test narration.',
      legendLabel: 'Legend',
      sources: [],
    },
  ],
}

function renderMap(props: Partial<Parameters<typeof Map>[0]> = {}): string {
  return renderToStaticMarkup(
    <Map
      tour={TOUR}
      currentStopIndex={0}
      userPosition={null}
      userAccuracyM={null}
      isAtStop={false}
      distanceToCurrentStop={null}
      {...props}
    />,
  )
}

describe('Map render', () => {
  it('renders the map container and OpenStreetMap attribution without crashing', () => {
    const markup = renderMap()
    expect(markup).toContain('map-container')
    expect(markup).toContain('OpenStreetMap')
    expect(markup).toContain('role="application"')
  })

  it('renders no tile-unavailable notice when tiles are fine', () => {
    const markup = renderMap()
    expect(markup).not.toContain('Map tiles unavailable offline')
  })
})
