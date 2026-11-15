import type { TourMetadata } from '../types/tour';

const BASE = import.meta.env.BASE_URL;

export const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const TILE_SUBDOMAINS = import.meta.env.VITE_TILE_SUBDOMAINS || 'abc';

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
