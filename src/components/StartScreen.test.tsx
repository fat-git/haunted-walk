/**
 * FAT-47 rendering test: the start page's stop list is driven entirely by
 * tour data (name + address per stop) and offers a "Start here" jump action
 * per stop, with the existing "Start Tour" button still present.
 *
 * FAT-66 addition: when the registry has more than one city the page offers a
 * city picker; with a single city it renders exactly as before (no picker).
 *
 * Renders the real component against the real shipped tour.json with
 * react-dom/server, so no DOM or new dependencies are needed.
 */
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { CityPicker, StartScreen } from './StartScreen'
import { isValidElement, type ReactElement } from 'react'
import type { Tour, CityEntry } from '../types/tour'

const TOUR: Tour = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)

const CITY: CityEntry = {
  id: 'new-orleans-fq',
  name: 'New Orleans French Quarter',
  defaultTour: 'french-quarter-ghosts',
  description: TOUR.description,
}

/** react-dom/server escapes apostrophes and ampersands; compare on text. */
function decode(markup: string): string {
  return markup
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function renderStartScreen(
  props: Partial<Parameters<typeof StartScreen>[0]> = {},
): string {
  return decode(
    renderToStaticMarkup(
      <StartScreen
        tour={TOUR}
        city={CITY}
        cities={[CITY]}
        onStartTour={() => {}}
        onStartAtStop={() => {}}
        onCityChange={() => {}}
        wakeLockSupported={true}
        speechSupported={true}
        fallbackMessage={null}
        {...props}
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

describe('StartScreen city picker (FAT-66)', () => {
  it('renders no city picker when the registry has a single city', () => {
    const markup = renderStartScreen()
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('Choose a city')
    expect(markup).not.toContain('aria-label="Choose city"')
  })

  it('renders a picker with every registered city when there is more than one', () => {
    const otherCity: CityEntry = {
      id: 'somewhere-else',
      name: 'Somewhere Else',
      defaultTour: 'somewhere-else-tour',
      description: 'A second city for the picker.',
    }
    const markup = renderStartScreen({ cities: [CITY, otherCity] })
    expect(markup).toContain('<select')
    expect(markup).toContain('Choose a city')
    expect(markup).toContain('New Orleans French Quarter')
    expect(markup).toContain('Somewhere Else')
    // the currently selected city is the selected option.
    expect(markup).toContain(`value="new-orleans-fq"`)
  })

  it('shows the fallback banner when an unknown city id was requested', () => {
    const markup = renderStartScreen({
      fallbackMessage: 'Unknown city "nowhere". Showing New Orleans French Quarter.',
    })
    expect(markup).toContain('Unknown city "nowhere"')
    expect(markup).toContain('Showing New Orleans French Quarter')
  })
})

describe('CityPicker onChange (FAT-97)', () => {
  const otherCity: CityEntry = {
    id: 'somewhere-else',
    name: 'Somewhere Else',
    defaultTour: 'somewhere-else-tour',
    description: 'A second city for the picker.',
  }

  function findSelect(node: unknown): ReactElement<Record<string, unknown>> | null {
    if (!isValidElement(node)) return null
    const element = node as ReactElement<Record<string, unknown>>
    if (element.type === 'select') return element
    const children = element.props.children
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findSelect(child)
      if (found) return found
    }
    return null
  }

  it('reports the chosen city id through onCityChange', () => {
    const picked: string[] = []
    const tree = CityPicker({
      city: CITY,
      cities: [CITY, otherCity],
      onCityChange: (id) => picked.push(id),
    })
    const select = findSelect(tree)
    expect(select).not.toBeNull()
    const onChange = select!.props.onChange as (event: {
      target: { value: string }
    }) => void
    onChange({ target: { value: 'somewhere-else' } })
    expect(picked).toEqual(['somewhere-else'])
  })

  it('renders nothing for a single city', () => {
    expect(CityPicker({ city: CITY, cities: [CITY], onCityChange: () => {} })).toBeNull()
  })
})
