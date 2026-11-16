/**
 * Transcript component with sentence-level highlighting.
 *
 * Displays the full narration text with the current sentence highlighted and
 * auto-scrolls to keep the current sentence in view.
 *
 * Auto-scroll rules:
 * - Only scroll when the current sentence is outside the transcript
 *   container's visible area (never yanks text from a reader who is mid-line).
 * - Scroll the transcript container, never the window.
 * - Pause auto-scroll for a few seconds after the walker touches or scrolls
 *   the transcript, so a manual read is not interrupted.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import type { NarrationSentence } from '../lib/narration'
import {
  TRANSCRIPT_SCROLL_PAUSE_MS,
  isSentenceInView,
  computeScrollTarget,
  isScrollPaused,
  type TranscriptRect,
} from '../lib/transcriptScroll'

interface TranscriptProps {
  sentences: readonly NarrationSentence[]
  currentSentenceIndex: number
  isPlaying: boolean
  className?: string
}

export function Transcript({
  sentences,
  currentSentenceIndex,
  isPlaying,
  className = '',
}: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentenceRefs = useRef<Map<number, HTMLSpanElement>>(new Map())
  const lastTouchRef = useRef<number | null>(null)

  const markTouched = useCallback(() => {
    lastTouchRef.current = Date.now()
  }, [])

  // Auto-scroll to current sentence when it changes, but only when it is not
  // already visible, and only scrolling the transcript container (never the
  // window). Paused for a few seconds after the walker touches or scrolls.
  useEffect(() => {
    if (!isPlaying) return
    if (isScrollPaused(lastTouchRef.current, Date.now(), TRANSCRIPT_SCROLL_PAUSE_MS))
      return

    const container = containerRef.current
    const current = sentenceRefs.current.get(currentSentenceIndex)
    if (!container || !current) return

    const containerRectDom = container.getBoundingClientRect()
    const sentenceRectDom = current.getBoundingClientRect()
    const containerRect: TranscriptRect = {
      top: containerRectDom.top,
      bottom: containerRectDom.bottom,
      height: containerRectDom.height,
    }
    const sentenceRect: TranscriptRect = {
      top: sentenceRectDom.top,
      bottom: sentenceRectDom.bottom,
      height: sentenceRectDom.height,
    }
    if (isSentenceInView(containerRect, sentenceRect)) {
      return
    }

    container.scrollTop = computeScrollTarget({
      containerScrollTop: container.scrollTop,
      containerHeight: container.clientHeight,
      containerTop: containerRectDom.top,
      sentenceTop: sentenceRectDom.top,
      sentenceHeight: sentenceRectDom.height,
    })
  }, [currentSentenceIndex, isPlaying])

  // Build transcript with sentence spans
  const transcriptNodes = useMemo(() => {
    return sentences.map((sentence, index) => {
      const isCurrent = index === currentSentenceIndex
      const isPast = index < currentSentenceIndex
      const isFuture = index > currentSentenceIndex

      const span = (
        <span
          key={index}
          ref={(el) => {
            if (el) sentenceRefs.current.set(index, el)
          }}
          className={`transcript-sentence ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
          data-sentence-index={index}
        >
          {sentence.text}{' '}
        </span>
      )

      return span
    })
  }, [sentences, currentSentenceIndex])

  if (sentences.length === 0) {
    return (
      <div
        className={`transcript ${className}`}
        role="region"
        aria-label="Narration transcript"
      >
        <p className="transcript-empty">No narration text for this stop.</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={markTouched}
      onScroll={markTouched}
      className={`transcript ${className}`}
      role="region"
      aria-label="Narration transcript"
      aria-live={isPlaying ? 'polite' : 'off'}
      aria-atomic="false"
    >
      <div className="transcript-content">{transcriptNodes}</div>
    </div>
  )
}
