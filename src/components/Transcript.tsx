/**
 * Transcript component with sentence-level highlighting.
 *
 * Displays the full narration text with the current sentence highlighted
 * and auto-scrolls to keep the current sentence in view.
 */

import { useEffect, useRef, useMemo } from 'react'
import type { NarrationSentence } from '../lib/narration'

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

  // Auto-scroll to current sentence when it changes
  useEffect(() => {
    if (!isPlaying) return

    const currentRef = sentenceRefs.current.get(currentSentenceIndex)
    if (currentRef && containerRef.current) {
      currentRef.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    }
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
