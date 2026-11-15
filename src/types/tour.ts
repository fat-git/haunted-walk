/**
 * Minimal tour types for FAT-5 map screen.
 * After PR #3 merges, this will be replaced by the canonical types from main.
 */

export interface GeoPoint {
  lat: number
  lon: number
}

export interface Viewpoint extends GeoPoint {
  access: 'public-sidewalk'
  description: string
}

export interface TourStop extends GeoPoint {
  id: string
  name: string
  address: string
  viewpoint: Viewpoint
  geofenceRadiusM: number
  narration: string
  legendLabel: 'Legend' | 'Local legend'
  sources: string[]
}

export interface TourMetadata {
  schemaVersion: 1
  id: string
  city: string
  name: string
  description: string
  stops: TourStop[]
}
