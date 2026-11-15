import type { TourMetadata } from '../types/tour';

const BASE = import.meta.env.BASE_URL;

export async function loadTour(_tourId: string, cityId: string): Promise<TourMetadata> {
  const res = await fetch(`${BASE}tours/${cityId}/tour.json`);
  if (!res.ok) throw new Error(`Failed to load tour: ${res.status}`);
  return (await res.json()) as TourMetadata;
}

export async function loadRoute(cityId: string) {
  const res = await fetch(`${BASE}tours/${cityId}/route.geojson`);
  if (!res.ok) throw new Error(`Failed to load route: ${res.status}`);
  return res.json();
}

export function mapDeepLink(lat: number, lon: number): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) {
    return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=w`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
}
