/**
 * Distance formatting shared by the map chip and the navigation panel.
 */

export function formatDistanceM(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`
  }
  return `${(distanceM / 1000).toFixed(1)} km`
}
