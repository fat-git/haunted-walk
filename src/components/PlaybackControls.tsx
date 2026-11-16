/**
 * Playback controls for narration.
 *
 * Provides play/pause, replay, skip, next stop, manual play override,
 * stop image gallery, and optional engagement content.
 */

import { useMemo, useState } from 'react'
import type { NarrationEngine, NarrationProblem } from '../lib/narration'
import type { TourStop } from '../types/tour'
import { imageUrl } from '../lib/tourPaths'

interface PlaybackControlsProps {
  city: string
  narration: NarrationEngine | null
  currentStop: TourStop | null
  phase: 'idle' | 'ready' | 'active' | 'paused' | 'completed'
  isAtStop: boolean
  onPlayPause: () => void
  onReplay: () => void
  onNextStop: () => void
  onPreviousStop: () => void
  onPlayCurrentStop: () => void
  onReplaySentence: () => void
  hasNextStop: boolean
  hasPreviousStop: boolean
  audioUnlocked: boolean
  narrationProblem: NarrationProblem | null
  onRetryNarration: () => void
  onDismissNarrationProblem: () => void
}

function StopGallery({ city, stop }: { city: string; stop: TourStop }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [failed, setFailed] = useState<Record<number, boolean>>({})
  const images = stop.images ?? []

  if (images.length === 0) return null

  const safeIndex = Math.min(activeIndex, images.length - 1)
  const image = images[safeIndex]
  if (!image || failed[safeIndex]) return null

  return (
    <section className="stop-gallery" aria-label="Stop photos">
      <figure className="stop-image" key={`${stop.id}-${image.src}`}>
        <img
          src={imageUrl(city, image.src)}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((prev) => ({ ...prev, [safeIndex]: true }))}
        />
      </figure>
      <p className="stop-image-credit">
        Photo:{' '}
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
          {image.credit}, {image.license}
        </a>
      </p>
      {images.length > 1 && (
        <div className="stop-gallery-nav" aria-label="Photo navigation">
          <button
            type="button"
            className="control-btn tertiary"
            onClick={() => setActiveIndex((i) => (i - 1 + images.length) % images.length)}
            aria-label="Previous photo"
          >
            Prev
          </button>
          <span className="stop-gallery-count" aria-live="polite">
            {safeIndex + 1} / {images.length}
          </span>
          <button
            type="button"
            className="control-btn tertiary"
            onClick={() => setActiveIndex((i) => (i + 1) % images.length)}
            aria-label="Next photo"
          >
            Next
          </button>
        </div>
      )}
      {images.length > 1 && (
        <div className="stop-gallery-dots" role="tablist" aria-label="Choose photo">
          {images.map((img, idx) => (
            <button
              key={img.src}
              type="button"
              role="tab"
              className={`gallery-dot ${idx === safeIndex ? 'active' : ''}`}
              aria-selected={idx === safeIndex}
              aria-label={`Photo ${idx + 1}`}
              onClick={() => setActiveIndex(idx)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function StopEngagement({ stop }: { stop: TourStop }) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const hasContent = stop.lookFor || stop.discuss || stop.funFact || stop.quiz
  if (!hasContent) return null

  return (
    <section className="stop-engagement" aria-label="Engagement">
      {stop.lookFor && (
        <article className="engagement-card">
          <h4>Look for</h4>
          <p>{stop.lookFor}</p>
        </article>
      )}
      {stop.discuss && (
        <article className="engagement-card">
          <h4>Discuss</h4>
          <p>{stop.discuss}</p>
        </article>
      )}
      {stop.funFact && (
        <article className="engagement-card">
          <h4>{stop.funFact.kind === 'legend' ? 'Legend' : 'Fun fact'}</h4>
          <p>{stop.funFact.text}</p>
          <p className="engagement-source">
            <a href={stop.funFact.sourceUrl} target="_blank" rel="noopener noreferrer">
              Source
            </a>
          </p>
        </article>
      )}
      {stop.quiz && (
        <article className="engagement-card engagement-quiz">
          <h4>Quick quiz</h4>
          <p>{stop.quiz.question}</p>
          <div className="quiz-options">
            {stop.quiz.options.map((option, index) => (
              <button
                key={`${index}-${option}`}
                type="button"
                className={`quiz-option ${selectedOption === index ? 'selected' : ''} ${
                  revealed && index === stop.quiz!.answerIndex ? 'correct' : ''
                }`}
                onClick={() => setSelectedOption(index)}
                aria-pressed={selectedOption === index}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="control-btn tertiary"
            onClick={() => setRevealed(true)}
            disabled={selectedOption === null || revealed}
          >
            Reveal answer
          </button>
          {revealed && (
            <p className="quiz-explanation" role="status">
              {selectedOption === stop.quiz.answerIndex ? 'Correct. ' : 'Not quite. '}
              {stop.quiz.explanation}
            </p>
          )}
        </article>
      )}
    </section>
  )
}

export function PlaybackControls({
  city,
  narration,
  currentStop,
  phase,
  isAtStop,
  onPlayPause,
  onReplay,
  onNextStop,
  onPreviousStop,
  onPlayCurrentStop,
  onReplaySentence,
  hasNextStop,
  hasPreviousStop,
  audioUnlocked,
  narrationProblem,
  onRetryNarration,
  onDismissNarrationProblem,
}: PlaybackControlsProps) {
  const state = useMemo(() => narration?.getState(), [narration])
  const isPlaying = state?.isPlaying ?? false
  const currentSentenceIndex = state?.currentSentenceIndex ?? 0
  const totalSentences = state?.sentences.length ?? 0

  const canPlay = phase === 'active' || phase === 'paused'
  const showControls = phase !== 'idle' && phase !== 'completed'

  if (!showControls || !currentStop) {
    return null
  }

  return (
    <div className="playback-controls" role="region" aria-label="Narration controls">
      <div className="stop-info">
        <h3 className="stop-name">{currentStop.name}</h3>
        <p className="stop-address">{currentStop.address}</p>
      </div>

      <StopGallery key={currentStop.id} city={city} stop={currentStop} />
      <StopEngagement key={`${currentStop.id}-engagement`} stop={currentStop} />

      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={currentSentenceIndex}
        aria-valuemin={0}
        aria-valuemax={totalSentences}
        aria-label="Narration progress"
      >
        <div
          className="progress-fill"
          style={{
            width:
              totalSentences > 0
                ? `${(currentSentenceIndex / totalSentences) * 100}%`
                : '0%',
          }}
        />
        <span className="progress-text" aria-hidden="true">
          {currentSentenceIndex} / {totalSentences}
        </span>
      </div>

      <div className="control-row primary-controls">
        <button
          className="control-btn secondary"
          onClick={onPreviousStop}
          disabled={!hasPreviousStop || !canPlay}
          aria-label="Previous stop"
          aria-disabled={!hasPreviousStop || !canPlay}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M19 18H5V6h14v12zM11 16l-4-4 4-4v8z" fill="currentColor" />
          </svg>
        </button>

        <button
          className={`control-btn primary ${isPlaying ? 'playing' : ''}`}
          onClick={onPlayPause}
          disabled={!canPlay || !audioUnlocked}
          aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M8 5v14l11-7-11-7z" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          className="control-btn secondary"
          onClick={onNextStop}
          disabled={!hasNextStop || !canPlay}
          aria-label="Next stop"
          aria-disabled={!hasNextStop || !canPlay}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M5 18h14V6H5v12zM13 16l4-4-4-4v8z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="control-row secondary-controls">
        <button
          className="control-btn tertiary"
          onClick={onReplaySentence}
          disabled={!canPlay || !audioUnlocked}
          aria-label="Replay current sentence"
          aria-disabled={!canPlay || !audioUnlocked}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
          <span>Replay</span>
        </button>

        <button
          className="control-btn tertiary"
          onClick={onReplay}
          disabled={!canPlay || !audioUnlocked}
          aria-label="Replay stop from beginning"
          aria-disabled={!canPlay || !audioUnlocked}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
          <span>Restart</span>
        </button>

        <button
          className="control-btn tertiary manual-play"
          onClick={onPlayCurrentStop}
          disabled={!canPlay || !audioUnlocked}
          aria-label="Play this stop manually (GPS override)"
          aria-disabled={!canPlay || !audioUnlocked}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              fill="currentColor"
            />
          </svg>
          <span>Play Stop</span>
        </button>
      </div>

      {narrationProblem && (
        <div className="narration-problem" role="alert">
          <p className="narration-problem-message">{narrationProblem.message}</p>
          <div className="narration-problem-actions">
            <button
              className="control-btn tertiary"
              onClick={onRetryNarration}
              type="button"
            >
              Retry audio
            </button>
            <button
              className="control-btn tertiary"
              onClick={onDismissNarrationProblem}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!audioUnlocked && (
        <p className="audio-locked-notice" role="alert">
          Tap <strong>Play</strong> to unlock audio
        </p>
      )}

      {!isAtStop && phase === 'active' && (
        <p className="gps-wait-notice" role="status">
          Walking to stop… narration starts automatically on arrival
        </p>
      )}
    </div>
  )
}
