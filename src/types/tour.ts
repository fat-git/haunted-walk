/**
 * The tour data contract.
 *
 * These types mirror the JSON files under `public/tours/`. The build-time
 * validator in `scripts/tour-schema.mjs` enforces the same rules for data that
 * is added without a code change. Keep the two in step.
 */

export type LegendLabel = 'Legend' | 'Local legend'

export type ViewpointAccess = 'public-sidewalk'

export type RouteStatus = 'placeholder' | 'computed'

export type ImageLicense =
  | 'CC0'
  | 'PD'
  | 'CC-BY-2.0'
  | 'CC-BY-3.0'
  | 'CC-BY-4.0'
  | 'CC-BY-SA-2.0'
  | 'CC-BY-SA-3.0'
  | 'CC-BY-SA-4.0'

export interface Image {
  /** Path relative to the tour folder, e.g. `images/<stop-id>-1.jpg`. */
  src: string
  /** Describes what is visible; non-empty, at most 160 characters. */
  alt: string
  /** Author or photographer; non-empty. */
  credit: string
  license: ImageLicense
  /** https URL of the file page on commons.wikimedia.org; attribution link only. */
  sourceUrl: string
  caption?: string
}

export interface GeoPoint {
  lat: number
  lon: number
}

/**
 * The public spot the app routes to and geofences. It is never the private
 * address itself: the walker stays on the sidewalk outside.
 */
export interface Viewpoint extends GeoPoint {
  access: ViewpointAccess
  description: string
}

export interface TourStop extends GeoPoint {
  id: string
  name: string
  address: string
  viewpoint: Viewpoint
  geofenceRadiusM: number
  narration: string
  legendLabel: LegendLabel
  sources: string[]
  images?: Image[]
}

export interface Tour {
  schemaVersion: 1
  id: string
  city: string
  name: string
  description: string
  stops: TourStop[]
}

/** Backwards-compatible name for the tour file as a whole. */
export type TourMetadata = Tour

export interface CityEntry {
  id: string
  name: string
  defaultTour: string
  description: string
}

export interface CityRegistry {
  schemaVersion: 1
  cities: CityEntry[]
}

export interface Maneuver {
  from: string
  to: string
  instruction: string
  distanceM: number
  durationS: number
}

export interface RouteFeature {
  type: 'Feature'
  geometry: {
    type: 'LineString'
    /** GeoJSON order: [longitude, latitude]. */
    coordinates: Array<[number, number]>
  }
  properties: Record<string, unknown>
}

export interface RouteMetadata {
  schemaVersion: 1
  city: string
  tour: string
  status: RouteStatus
  note?: string
  generatedAt: string
  stops: string[]
  maneuvers: Maneuver[]
}

export interface RouteFile {
  type: 'FeatureCollection'
  features: RouteFeature[]
  metadata: RouteMetadata
}
