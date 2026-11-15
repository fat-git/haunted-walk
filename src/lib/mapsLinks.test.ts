import { describe, expect, it } from 'vitest'
import { appleMapsDirectionsUrl, googleMapsDirectionsUrl } from './mapsLinks'

describe('map deep links', () => {
  it('builds a Google Maps walking directions URL for the viewpoint', () => {
    expect(googleMapsDirectionsUrl(29.95898, -90.07065)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=29.95898,-90.07065&travelmode=walking&dir_action=navigate',
    )
  })

  it('builds an Apple Maps walking directions URL for the viewpoint', () => {
    expect(appleMapsDirectionsUrl(29.95784, -90.0663)).toBe(
      'https://maps.apple.com/?daddr=29.95784,-90.0663&dirflg=w',
    )
  })
})
