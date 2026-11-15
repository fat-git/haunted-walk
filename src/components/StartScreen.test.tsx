/**
 * FAT-47 rendering test: the start page's stop list is driven entirely by
 * tour data (name + address per stop) and offers a "Start here" jump action
 * per stop, with the existing "Start Tour" button still present.
 *
 * Renders the real component against the real shipped tour.json with
 * react-dom/server, so no DOM or new dependencies are needed.
 */
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { StartScreen } from './StartScreen'
import type { Tour } from '../types/tour'

const TOUR: Tour = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)

/** react-dom/server escapes apostrophes and ampersands; compare on text. */
function decode(markup: string): string {
  return markup
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function renderStartScreen(): string {
  return decode(
    renderToStaticMarkup(
      <StartScreen
        tour={TOUR}
        onStartTour={() => {}}
        onStartAtStop={() => {}}
        wakeLockSupported={true}
        speechSupported={true}
      />,
    ),
  )
}

describe('StartScreen stop list', () => {
  const markup = renderStartScreen()

  it('renders every stop from tour.json with name, address, and a jump action', () => {
    for (const [index, stop] of TOUR.stops.entries()) {
      expect(markup).toContain(stop.name)
      expect(markup).toContain(stop.address)
      expect(markup).toContain(`Start the tour at stop ${index + 1}: ${stop.name}`)
    }
    const startHereCount = markup.match(/>Start here</g) ?? []
    expect(startHereCount).toHaveLength(TOUR.stops.length)
  })

  it('keeps the original Start Tour button for starting at stop 1', () => {
    expect(markup).toContain('>Start Tour</button>')
  })

  it('keeps the per-stop maps deep links', () => {
    for (const stop of TOUR.stops) {
      expect(markup).toContain(`Open ${stop.name} in Google Maps`)
      expect(markup).toContain(`Open ${stop.name} in Apple Maps`)
    }
  })
})
