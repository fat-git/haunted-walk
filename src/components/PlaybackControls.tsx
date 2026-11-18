/**
 * Playback controls for narration.
 *
 * Provides play/pause, replay, skip, next stop, manual play override,
 * stop image gallery, and optional engagement content.
 */

import { useMemo, useState } from 'react'
import type { NarrationEngine, NarrationProblem } from '../lib/narration'
import type { FunFact, Quiz, TourStop } from '../types/tour'
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
  extraStory: NarrationEngine | null
  extraStoryPlaying: boolean
  extraStoryPaused: boolean
  extraStorySupported: boolean
  onPlayExtraStory: () => void
  onPauseExtraStory: () => void
  onStopExtraStory: () => void
  onQuizCorrect: (quizIndex: number) => void
  onChallengeDone: () => void
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

function QuizCard({
  quiz,
  quizIndex,
  onAnswerCorrect,
}: {
  quiz: Quiz
  quizIndex: number
  onAnswerCorrect: (quizIndex: number) => void
}) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)

  const choose = (index: number) => {
    if (revealed) return
    setSelectedOption(index)
  }

  const reveal = () => {
    if (selectedOption === null) return
    setRevealed(true)
    if (selectedOption === quiz.answerIndex) {
      onAnswerCorrect(quizIndex)
    }
  }

  const isCorrect = revealed && selectedOption === quiz.answerIndex

  return (
    <article className="engagement-card engagement-quiz">
      <h4>Quick quiz</h4>
      <p>{quiz.question}</p>
      <div className="quiz-options">
        {quiz.options.map((option, index) => (
          <button
            key={`${index}-${option}`}
            type="button"
            className={`quiz-option ${selectedOption === index ? 'selected' : ''} ${
              isCorrect && index === quiz.answerIndex ? 'correct' : ''
            }`}
            onClick={() => choose(index)}
            aria-pressed={selectedOption === index}
          >
            {option}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="control-btn tertiary"
        onClick={reveal}
        disabled={selectedOption === null || revealed}
      >
        Reveal answer
      </button>
      {revealed && (
        <p className="quiz-explanation" role="status">
          {isCorrect ? 'Correct. ' : 'Not quite. '}
          {quiz.explanation}
        </p>
      )}
    </article>
  )
}

function StopFunFacts({
  funFacts,
  legendLabel,
}: {
  funFacts: FunFact[]
  legendLabel: string
}) {
  const [index, setIndex] = useState(0)
  const safeIndex = Math.min(index, funFacts.length - 1)
  const current = funFacts[safeIndex]

  if (!current) return null

  return (
    <article className="engagement-card stop-fun-fact">
      <h4>{current.kind === 'legend' ? legendLabel : 'Fun fact'}</h4>
      <p>{current.text}</p>
      <p className="engagement-source">
        <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source
        </a>
      </p>
      {funFacts.length > 1 && (
        <div className="stop-gallery-nav" aria-label="Fun fact navigation">
          <button
            type="button"
            className="control-btn tertiary"
            onClick={() => setIndex((i) => (i - 1 + funFacts.length) % funFacts.length)}
            aria-label="Previous fun fact"
          >
            Prev
          </button>
          <span className="stop-gallery-count" aria-live="polite">
            {safeIndex + 1} / {funFacts.length}
          </span>
          <button
            type="button"
            className="control-btn tertiary"
            onClick={() => setIndex((i) => (i + 1) % funFacts.length)}
            aria-label="Next fun fact"
          >
            Next fact
          </button>
        </div>
      )}
    </article>
  )
}

function StopEngagement({
  stop,
  extraStory,
  extraStoryPlaying,
  extraStoryPaused,
  extraStorySupported,
  onPlayExtraStory,
  onPauseExtraStory,
  onStopExtraStory,
  onQuizCorrect,
  onChallengeDone,
}: {
  stop: TourStop
  extraStory: NarrationEngine | null
  extraStoryPlaying: boolean
  extraStoryPaused: boolean
  extraStorySupported: boolean
  onPlayExtraStory: () => void
  onPauseExtraStory: () => void
  onStopExtraStory: () => void
  onQuizCorrect: (quizIndex: number) => void
  onChallengeDone: () => void
}) {
  const legendLabel = stop.legendLabel ?? 'Legend'

  const stopFunFacts: FunFact[] = stop.funFacts?.length
    ? stop.funFacts
    : stop.funFact
      ? [stop.funFact]
      : []
  const stopQuizzes: Quiz[] = stop.quizzes?.length
    ? stop.quizzes
    : stop.quiz
      ? [stop.quiz]
      : []

  const hasContent =
    stop.lookFor ||
    stop.discuss ||
    stopFunFacts.length > 0 ||
    stopQuizzes.length > 0 ||
    stop.extraStory ||
    stop.challenge

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
      {stopFunFacts.length > 0 && (
        <StopFunFacts funFacts={stopFunFacts} legendLabel={legendLabel} />
      )}
      {stopQuizzes.map((quiz, index) => (
        <QuizCard
          key={`quiz-${index}`}
          quiz={quiz}
          quizIndex={index}
          onAnswerCorrect={onQuizCorrect}
        />
      ))}
      {stop.extraStory && (
        <article className="engagement-card engagement-extra-story">
          <h4>Hear more</h4>
          {extraStory ? (
            <div className="extra-story-controls">
              {!extraStoryPlaying && !extraStoryPaused && (
                <button
                  type="button"
                  className="control-btn primary"
                  onClick={onPlayExtraStory}
                  disabled={!extraStorySupported}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M8 5v14l11-7-11-7z" fill="currentColor" />
                  </svg>
                  Hear more
                </button>
              )}
              {(extraStoryPlaying || extraStoryPaused) && (
                <button
                  type="button"
                  className="control-btn tertiary"
                  onClick={extraStoryPlaying ? onPauseExtraStory : onPlayExtraStory}
                >
                  {extraStoryPaused ? 'Resume' : 'Pause'}
                </button>
              )}
              {(extraStoryPlaying || extraStoryPaused) && (
                <button
                  type="button"
                  className="control-btn tertiary"
                  onClick={onStopExtraStory}
                >
                  Stop
                </button>
              )}
            </div>
          ) : (
            <p>{stop.extraStory.text}</p>
          )}
        </article>
      )}
      {stop.challenge && (
        <article className="engagement-card engagement-challenge">
          <h4>Challenge</h4>
          <p>{stop.challenge}</p>
          <button
            type="button"
            className="control-btn tertiary"
            onClick={onChallengeDone}
          >
            Done
          </button>
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
  extraStory,
  extraStoryPlaying,
  extraStoryPaused,
  extraStorySupported,
  onPlayExtraStory,
  onPauseExtraStory,
  onStopExtraStory,
  onQuizCorrect,
  onChallengeDone,
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
      <StopEngagement
        key={`${currentStop.id}-engagement`}
        stop={currentStop}
        extraStory={extraStory}
        extraStoryPlaying={extraStoryPlaying}
        extraStoryPaused={extraStoryPaused}
        extraStorySupported={extraStorySupported}
        onPlayExtraStory={onPlayExtraStory}
        onPauseExtraStory={onPauseExtraStory}
        onStopExtraStory={onStopExtraStory}
        onQuizCorrect={onQuizCorrect}
        onChallengeDone={onChallengeDone}
      />

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
