/**
 * Pure helpers for Transcript auto-scroll behavior.
 *
 * Kept in a separate module so `Transcript.tsx` exports only the component
 * (React Fast Refresh rule) and so the scroll decision logic can be unit
 * tested without a DOM.
 */

/** How long auto-scroll is paused after the walker touches or scrolls. */
export const TRANSCRIPT_SCROLL_PAUSE_MS = 3000

export interface TranscriptRect {
  top: number
  bottom: number
  height: number
}

/** True when `sentence` already lies fully inside `container`'s visible area. */
export function isSentenceInView(
  container: TranscriptRect,
  sentence: TranscriptRect,
): boolean {
  return sentence.top >= container.top && sentence.bottom <= container.bottom
}

/** Target scrollTop to center `sentence` inside `container` (container, not window). */
export function computeScrollTarget(params: {
  containerScrollTop: number
  containerHeight: number
  containerTop: number
  sentenceTop: number
  sentenceHeight: number
}): number {
  const {
    containerScrollTop,
    containerHeight,
    containerTop,
    sentenceTop,
    sentenceHeight,
  } = params
  return (
    containerScrollTop +
    sentenceTop -
    containerTop -
    containerHeight / 2 +
    sentenceHeight / 2
  )
}

/** True when auto-scroll is still paused after a touch/scroll. */
export function isScrollPaused(
  lastTouch: number | null,
  now: number,
  pauseMs: number = TRANSCRIPT_SCROLL_PAUSE_MS,
): boolean {
  return lastTouch !== null && now - lastTouch < pauseMs
}
