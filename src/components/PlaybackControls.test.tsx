/**
 * FAT-51 rendering test: PlaybackControls renders the first stop image with a
 * fixed aspect-ratio box, alt text, and a credit line linking to sourceUrl,
 * and renders nothing (no gap) when a stop has no images.
 *
 * Uses react-dom/server against a real stop shape, so no DOM or new
 * dependencies are needed.
 */
/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlaybackControls } from './PlaybackControls'
import { imageUrl } from '../lib/tourPaths'
import type { TourStop } from '../types/tour'

const TOUR: { stops: TourStop[] } = JSON.parse(
  readFileSync(
    new URL('../../public/tours/new-orleans-fq/tour.json', import.meta.url),
    'utf8',
  ),
)

const stopWithImage: TourStop = {
  ...TOUR.stops[0],
  images: [
    {
      src: 'images/st-louis-cemetery-no-1-1.jpg',
      alt: 'Whitewashed above-ground tombs behind the cemetery wall.',
      credit: 'Jean Example',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    },
  ],
}

const stopWithoutImage: TourStop = {
  ...TOUR.stops[0],
  images: undefined,
}

function propsFor(stop: TourStop | null) {
  return {
    city: 'new-orleans-fq',
    narration: null,
    currentStop: stop,
    phase: 'active' as const,
    isAtStop: true,
    onPlayPause: () => {},
    onReplay: () => {},
    onNextStop: () => {},
    onPreviousStop: () => {},
    onPlayCurrentStop: () => {},
    onReplaySentence: () => {},
    hasNextStop: false,
    hasPreviousStop: false,
    audioUnlocked: true,
    narrationProblem: null,
    onRetryNarration: () => {},
    onDismissNarrationProblem: () => {},
  }
}

function decode(markup: string): string {
  return markup
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

function renderPlaybackControls(stop: TourStop | null): string {
  return decode(renderToStaticMarkup(<PlaybackControls {...propsFor(stop)} />))
}

describe('PlaybackControls stop image', () => {
  it('renders nothing when the stop has no images', () => {
    const markup = renderPlaybackControls(stopWithoutImage)
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('Photo:')
    expect(markup).toContain(stopWithoutImage.name)
  })

  it('renders the first image with alt, credit, license link, and lazy loading', () => {
    const markup = renderPlaybackControls(stopWithImage)
    const image = stopWithImage.images![0]
    expect(markup).toContain(`<img`)
    expect(markup).toContain(`alt="${image.alt}"`)
    expect(markup).toContain('loading="lazy"')
    expect(markup).toContain('Photo:')
    expect(markup).toContain(image.credit)
    expect(markup).toContain(image.license)
    expect(markup).toContain(image.sourceUrl)
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain(imageUrl('new-orleans-fq', image.src))
  })

  it('resolves the image URL through the tour-path helper', () => {
    expect(imageUrl('new-orleans-fq', 'images/x.jpg')).toBe(
      '/tours/new-orleans-fq/images/x.jpg',
    )
  })
})
