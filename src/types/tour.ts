export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface TourStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  viewpoint: GeoPoint;
  geofenceRadiusM: number;
  narration: string;
  legendLabel: string;
  sources: string[];
}

export interface TourMetadata {
  id: string;
  city: string;
  name: string;
  description: string;
  stops: TourStop[];
}

export interface CityRegistry {
  cities: Array<{
    id: string;
    name: string;
    defaultTour: string;
    description: string;
  }>;
}

export interface Maneuver {
  from: string;
  to: string;
  instruction: string;
  distanceM: number;
  durationS: number;
}

export interface Route {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>; // [lng, lat]
    };
    properties: Record<string, unknown>;
  }>;
  metadata: {
    city: string;
    tour: string;
    generatedAt: string;
    stops: string[];
    maneuvers: Maneuver[];
  };
}
