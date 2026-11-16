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

  it('renders multiple images with navigation and per-image credits', () => {
    const stop: TourStop = {
      ...stopWithImage,
      images: [
        stopWithImage.images![0],
        {
          src: 'images/second.jpg',
          alt: 'A second angle from the sidewalk.',
          credit: 'Jane Photo',
          license: 'CC-BY-SA-4.0',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Second.jpg',
        },
      ],
    }
    const markup = renderPlaybackControls(stop)
    expect(markup).toContain(imageUrl('new-orleans-fq', stop.images![0].src))
    expect(markup).toContain(stop.images![0].credit)
    expect(markup).toContain('1 / 2')
    expect(markup).toContain('Next photo')
    expect(markup).toContain('Previous photo')
  })

  it('renders optional engagement cards and plain-text content', () => {
    const stop: TourStop = {
      ...stopWithoutImage,
      lookFor: 'Look for <ironwork> details.',
      discuss: 'What stories linger here?',
      funFact: {
        text: 'A sourced fact.',
        kind: 'fact',
        sourceUrl: 'https://example.org/fact',
      },
      quiz: {
        question: 'Where should you stand?',
        options: ['Public sidewalk', 'Private yard'],
        answerIndex: 0,
        explanation: 'Stay on public sidewalks.',
      },
    }
    const markup = renderPlaybackControls(stop)
    expect(markup).toContain('Look for')
    expect(markup).toContain('Discuss')
    expect(markup).toContain('Fun fact')
    expect(markup).toContain('Quick quiz')
    expect(markup).toContain('Look for <ironwork> details.')
    expect(markup).toContain('https://example.org/fact')
    expect(markup).toContain('Reveal answer')
  })

  it('resolves the image URL through the tour-path helper', () => {
    expect(imageUrl('new-orleans-fq', 'images/x.jpg')).toBe(
      '/tours/new-orleans-fq/images/x.jpg',
    )
  })
})
