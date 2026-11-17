/**
 * Progress tracking for the tour.
 *
 * localStorage-only (no PII). Tracks stops visited, quizzes answered correctly,
 * and challenges completed. Provides playful rank calculation.
 *
 * The tour file can optionally override default rank labels and thresholds via
 * the `progress` field:
 *   "progress": {
 *     "rankLabels": ["Fledgling ghost hunter", "Ghost seeker", "Spirit walker", "Haunt master"],
 *     "rankThresholds": [0, 3, 6, 10]
 *   }
 *
 * Thresholds are in code (data-driven); rank labels come from the tour file
 * with sensible defaults so other cities need no code changes.
 */

export interface VisitProgress {
  /** Stop ids the walker has visited. */
  stopsVisited: string[]
  /** Keys of quizzes answered correctly, e.g. `${stopId}:${quizIndex}`. */
  quizzesCorrect: string[]
  /** Stop ids where the challenge has been completed. */
  challengesDone: string[]
}

export interface ProgressConfig {
  rankLabels?: string[]
  rankThresholds?: number[]
}

export const DEFAULT_RANK_LABELS = [
  'Fledgling ghost hunter',
  'Ghost seeker',
  'Spirit walker',
  'Haunt master',
]

export const DEFAULT_RANK_THRESHOLDS = [0, 3, 6, 10]

const STORAGE_PREFIX = 'haunted-walk:visit-progress:'

function storageKey(tourId: string): string {
  return `${STORAGE_PREFIX}${tourId}`
}

function load(tourId: string): VisitProgress {
  try {
    const raw = localStorage.getItem(storageKey(tourId))
    if (!raw) {
      return { stopsVisited: [], quizzesCorrect: [], challengesDone: [] }
    }
    const parsed = JSON.parse(raw) as Partial<VisitProgress>
    if (
      !Array.isArray(parsed.stopsVisited) ||
      !Array.isArray(parsed.quizzesCorrect) ||
      !Array.isArray(parsed.challengesDone)
    ) {
      return { stopsVisited: [], quizzesCorrect: [], challengesDone: [] }
    }
    return parsed as VisitProgress
  } catch {
    return { stopsVisited: [], quizzesCorrect: [], challengesDone: [] }
  }
}

export { load }

function save(tourId: string, progress: VisitProgress): void {
  try {
    localStorage.setItem(storageKey(tourId), JSON.stringify(progress))
  } catch {
    // Storage unavailable (private mode, quota): progress just does not persist.
  }
}

function isNewStop(progress: VisitProgress, stopId: string): boolean {
  return !progress.stopsVisited.includes(stopId)
}

function isNewQuiz(progress: VisitProgress, key: string): boolean {
  return !progress.quizzesCorrect.includes(key)
}

function isNewChallenge(progress: VisitProgress, stopId: string): boolean {
  return !progress.challengesDone.includes(stopId)
}

/**
 * Mark a stop as visited. Returns the updated progress (useful for UI updates).
 */
export function markStopVisited(tourId: string, stopId: string): VisitProgress {
  const progress = load(tourId)
  if (isNewStop(progress, stopId)) {
    progress.stopsVisited = [...progress.stopsVisited, stopId]
    save(tourId, progress)
  }
  return progress
}

/**
 * Mark a quiz as answered correctly. `quizIndex` is the 0-based index in the
 * stop's `quizzes` array (or 0 if the stop uses the singular `quiz`).
 */
export function markQuizCorrect(
  tourId: string,
  stopId: string,
  quizIndex: number,
): VisitProgress {
  const progress = load(tourId)
  const key = `${stopId}:${quizIndex}`
  if (isNewQuiz(progress, key)) {
    progress.quizzesCorrect = [...progress.quizzesCorrect, key]
    save(tourId, progress)
  }
  return progress
}

/**
 * Mark the stop's challenge as done.
 */
export function markChallengeDone(tourId: string, stopId: string): VisitProgress {
  const progress = load(tourId)
  if (isNewChallenge(progress, stopId)) {
    progress.challengesDone = [...progress.challengesDone, stopId]
    save(tourId, progress)
  }
  return progress
}

/**
 * Compute the overall progress score.
 *
 * Score = stopsVisited.length + quizzesCorrect.length * 2 + challengesDone.length * 3
 *
 * This weights quizzes and challenges more than simple stop visits, so engaging
 * with the content earns a higher rank.
 */
export function computeScore(progress: VisitProgress): number {
  return (
    progress.stopsVisited.length +
    progress.quizzesCorrect.length * 2 +
    progress.challengesDone.length * 3
  )
}

/**
 * Compute the current rank label from the score.
 *
 * Thresholds default to DEFAULT_RANK_THRESHOLDS; labels default to
 * DEFAULT_RANK_LABELS. The tour file can override either via `progress`.
 */
export function computeRank(score: number, config?: ProgressConfig): string {
  const thresholds = config?.rankThresholds ?? DEFAULT_RANK_THRESHOLDS
  const labels = config?.rankLabels ?? DEFAULT_RANK_LABELS

  let rank = labels[0]
  for (let i = 0; i < thresholds.length; i++) {
    if (score >= thresholds[i]) {
      rank = labels[i]
    } else {
      break
    }
  }
  return rank
}

/**
 * Compute a short human-readable summary of the walker's progress.
 *
 * Example: "You visited 5 of 8 stops, answered 3 quizzes, and completed 2 challenges."
 */
export function computeSummary(progress: VisitProgress, totalStops: number): string {
  const parts = []
  if (progress.stopsVisited.length > 0) {
    parts.push(`visited ${progress.stopsVisited.length} of ${totalStops} stops`)
  }
  if (progress.quizzesCorrect.length > 0) {
    parts.push(
      `answered ${progress.quizzesCorrect.length} ${
        progress.quizzesCorrect.length === 1 ? 'quiz' : 'quizzes'
      }`,
    )
  }
  if (progress.challengesDone.length > 0) {
    parts.push(
      `completed ${progress.challengesDone.length} ${
        progress.challengesDone.length === 1 ? 'challenge' : 'challenges'
      }`,
    )
  }
  if (parts.length === 0) {
    return 'You started the tour.'
  }
  return `You ${parts.join(', ')}.`
}
