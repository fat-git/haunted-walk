/**
 * FAT-56 rendering test: the in-tour stop list sheet (StopsSheet) is a modal
 * dialog with focus trap + focus restore + Escape-to-close semantics. While
 * those behaviours need a real DOM to exercise, the rendered markup must
 * expose the dialog contract: role="dialog", aria-modal="true", an
 * accessible name, and a focusable surface so the trap has something to
 * cycle between.
 *
 * Uses react-dom/server against the real tour.json, matching the existing
 * StartScreen/PlaybackControls tests; no DOM or new dependencies required.
 */
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { StopsSheet } from './StopsSheet'
import type { Tour } from '../types/tour'

const TOUR: Tour = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)

function decode(markup: string): string {
  return markup
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function renderSheet(props: Partial<Parameters<typeof StopsSheet>[0]> = {}): string {
  return decode(
    renderToStaticMarkup(
      <StopsSheet
        tour={TOUR}
        currentStopIndex={2}
        open={true}
        onClose={() => {}}
        onJumpStop={() => {}}
        {...props}
      />,
    ),
  )
}

describe('StopsSheet dialog contract (FAT-56)', () => {
  it('exposes a labelled modal dialog with a focusable surface', () => {
    const markup = renderSheet()
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-label="Jump to a stop"')
    expect(markup).toContain('tabindex="-1"')
  })

  it('lists every stop with a jump action, except the current stop', () => {
    const markup = renderSheet()
    expect(markup).toContain('Jump to a stop')
    expect(markup).toContain('You are here')
    for (const [index, stop] of TOUR.stops.entries()) {
      expect(markup).toContain(stop.name)
      if (index === 2) {
        // Current stop is not a jump target.
        expect(markup).not.toContain(
          `aria-label="Jump to stop ${index + 1}: ${stop.name}"`,
        )
      } else {
        expect(markup).toContain(`aria-label="Jump to stop ${index + 1}: ${stop.name}"`)
      }
    }
  })

  it('renders nothing when closed', () => {
    expect(renderSheet({ open: false })).toBe('')
  })
})
