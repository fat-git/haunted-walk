/**
 * FAT-76 item 3: Transcript auto-scroll only when the current sentence is
 * outside the visible area, scrolling the container (not the window), and
 * pausing after the walker touches or scrolls.
 *
 * The scroll decision helpers are pure and unit-tested; the component render
 * is checked with react-dom/server.
 */

/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Transcript } from './Transcript'
import {
  TRANSCRIPT_SCROLL_PAUSE_MS,
  computeScrollTarget,
  isScrollPaused,
  isSentenceInView,
} from '../lib/transcriptScroll'
import type { NarrationSentence } from '../lib/narration'

const SENTENCES: NarrationSentence[] = [
  { text: 'First sentence.', startChar: 0, endChar: 15 },
  { text: 'Second sentence.', startChar: 16, endChar: 32 },
  { text: 'Third sentence.', startChar: 33, endChar: 47 },
]

function renderTranscript(props: Partial<Parameters<typeof Transcript>[0]> = {}): string {
  return renderToStaticMarkup(
    <Transcript
      sentences={SENTENCES}
      currentSentenceIndex={0}
      isPlaying={false}
      {...props}
    />,
  )
}

describe('Transcript render', () => {
  it('renders every sentence with the current one highlighted', () => {
    const markup = renderTranscript({ currentSentenceIndex: 1, isPlaying: true })
    for (const [index, sentence] of SENTENCES.entries()) {
      expect(markup).toContain(sentence.text)
      expect(markup).toContain(`data-sentence-index="${index}"`)
    }
    expect(markup).toContain('data-sentence-index="1"')
    expect(markup).toContain('class="transcript-sentence current')
    // only the current sentence has the current class
    expect(markup.match(/transcript-sentence current/g)).toHaveLength(1)
  })

  it('renders an empty message when there are no sentences', () => {
    const markup = renderTranscript({ sentences: [] })
    expect(markup).toContain('No narration text for this stop.')
  })
})

describe('isSentenceInView', () => {
  const container = { top: 100, bottom: 300, height: 200 }

  it('is true when the sentence is fully inside the container', () => {
    expect(isSentenceInView(container, { top: 120, bottom: 200, height: 80 })).toBe(true)
  })

  it('is false when the sentence is above the container', () => {
    expect(isSentenceInView(container, { top: 50, bottom: 90, height: 40 })).toBe(false)
  })

  it('is false when the sentence is below the container', () => {
    expect(isSentenceInView(container, { top: 350, bottom: 400, height: 50 })).toBe(false)
  })
})

describe('computeScrollTarget', () => {
  it('centers the sentence inside the container', () => {
    // Container scrolled to 100, 400 tall starting at top 0; sentence top 250,
    // height 40. Target centers it: 100 + 250 - 0 - 200 + 20 = 170.
    expect(
      computeScrollTarget({
        containerScrollTop: 100,
        containerHeight: 400,
        containerTop: 0,
        sentenceTop: 250,
        sentenceHeight: 40,
      }),
    ).toBe(170)
  })
})

describe('isScrollPaused', () => {
  const now = 10000

  it('is not paused when there was no touch', () => {
    expect(isScrollPaused(null, now)).toBe(false)
  })

  it('is paused within the pause window', () => {
    expect(isScrollPaused(now - 1000, now)).toBe(true)
    expect(isScrollPaused(now - TRANSCRIPT_SCROLL_PAUSE_MS + 1, now)).toBe(true)
  })

  it('is not paused after the pause window', () => {
    expect(isScrollPaused(now - TRANSCRIPT_SCROLL_PAUSE_MS, now)).toBe(false)
    expect(isScrollPaused(now - TRANSCRIPT_SCROLL_PAUSE_MS - 1, now)).toBe(false)
  })
})
