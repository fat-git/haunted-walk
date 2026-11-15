/**
 * Playback controls for narration.
 *
 * Provides play/pause, replay, skip, next stop, and manual play override.
 */

import { useMemo } from 'react'
import type { NarrationEngine, NarrationProblem } from '../lib/narration'
import type { TourStop } from '../types/tour'

interface PlaybackControlsProps {
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

export function PlaybackControls({
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
