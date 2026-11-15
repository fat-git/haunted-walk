/**
 * Map deep links.
 *
 * The app never calls a routing API; these are plain https URLs that hand the
 * stop to Google or Apple Maps for anyone who wants live turn-by-turn. They
 * target the stop's public-sidewalk viewpoint, never the private address.
 */

export function googleMapsDirectionsUrl(lat: number, lon: number): string {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${lat},${lon}` +
    `&travelmode=walking` +
    `&dir_action=navigate`
  )
}

export function appleMapsDirectionsUrl(lat: number, lon: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=w`
}
