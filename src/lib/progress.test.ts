/**
 * Tests for progress tracking (FAT-119).
 *
 * Covers markStopVisited / markQuizCorrect / markChallengeDone, score and rank
 * computation, and the summary string. Uses a fake localStorage so no real
 * storage or DOM is required.
 */
/// <reference types="node" />
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  markStopVisited,
  markQuizCorrect,
  markChallengeDone,
  computeScore,
  computeRank,
  computeSummary,
  DEFAULT_RANK_LABELS,
  DEFAULT_RANK_THRESHOLDS,
  load,
} from './progress'

const TOUR_ID = 'test-city'

function makeStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key]
    },
    key: () => '',
    length: 0,
  } as Storage
}

describe('progress tracking', () => {
  let originalStorage: Storage | undefined

  beforeEach(() => {
    originalStorage = globalThis.localStorage
    ;(globalThis as { localStorage?: Storage }).localStorage = makeStorage()
  })

  afterEach(() => {
    if (originalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage
    } else {
      ;(globalThis as { localStorage?: Storage }).localStorage = originalStorage
    }
  })

  it('starts with an empty progress object', () => {
    const progress = load(TOUR_ID)
    expect(progress.stopsVisited).toEqual([])
    expect(progress.quizzesCorrect).toEqual([])
    expect(progress.challengesDone).toEqual([])
  })

  it('marks a stop as visited', () => {
    const progress = markStopVisited(TOUR_ID, 'stop-a')
    expect(progress.stopsVisited).toEqual(['stop-a'])
    // Idempotent: marking again does not duplicate.
    const again = markStopVisited(TOUR_ID, 'stop-a')
    expect(again.stopsVisited).toEqual(['stop-a'])
  })

  it('marks a quiz as answered correctly', () => {
    const progress = markQuizCorrect(TOUR_ID, 'stop-a', 0)
    expect(progress.quizzesCorrect).toEqual(['stop-a:0'])
    const again = markQuizCorrect(TOUR_ID, 'stop-a', 0)
    expect(again.quizzesCorrect).toEqual(['stop-a:0'])
    markQuizCorrect(TOUR_ID, 'stop-a', 1)
    expect(load(TOUR_ID).quizzesCorrect).toEqual(['stop-a:0', 'stop-a:1'])
  })

  it('marks a challenge as done', () => {
    const progress = markChallengeDone(TOUR_ID, 'stop-a')
    expect(progress.challengesDone).toEqual(['stop-a'])
    const again = markChallengeDone(TOUR_ID, 'stop-a')
    expect(again.challengesDone).toEqual(['stop-a'])
  })

  it('computes the weighted score', () => {
    const progress = load(TOUR_ID)
    expect(computeScore(progress)).toBe(0)
    markStopVisited(TOUR_ID, 'stop-a')
    markStopVisited(TOUR_ID, 'stop-b')
    markQuizCorrect(TOUR_ID, 'stop-a', 0)
    markChallengeDone(TOUR_ID, 'stop-b')
    const score = computeScore(load(TOUR_ID))
    // 2 stops + 1 quiz * 2 + 1 challenge * 3 = 7
    expect(score).toBe(7)
  })

  it('computes the rank from the score', () => {
    expect(computeRank(0)).toBe(DEFAULT_RANK_LABELS[0])
    expect(computeRank(1)).toBe(DEFAULT_RANK_LABELS[0])
    expect(computeRank(DEFAULT_RANK_THRESHOLDS[1])).toBe(DEFAULT_RANK_LABELS[1])
    expect(computeRank(DEFAULT_RANK_THRESHOLDS[2])).toBe(DEFAULT_RANK_LABELS[2])
    expect(computeRank(DEFAULT_RANK_THRESHOLDS[3])).toBe(DEFAULT_RANK_LABELS[3])
    // Score above the highest threshold still yields the top rank.
    expect(computeRank(999)).toBe(DEFAULT_RANK_LABELS[DEFAULT_RANK_LABELS.length - 1])
  })

  it('supports custom rank labels and thresholds', () => {
    expect(computeRank(5, { rankLabels: ['A', 'B'], rankThresholds: [0, 3] })).toBe('B')
    expect(computeRank(2, { rankLabels: ['A', 'B'], rankThresholds: [0, 3] })).toBe('A')
  })

  it('builds a human-readable summary', () => {
    const empty = computeSummary(load(TOUR_ID), 8)
    expect(empty).toBe('You started the tour.')
    markStopVisited(TOUR_ID, 'stop-a')
    markStopVisited(TOUR_ID, 'stop-b')
    markQuizCorrect(TOUR_ID, 'stop-a', 0)
    markChallengeDone(TOUR_ID, 'stop-b')
    const summary = computeSummary(load(TOUR_ID), 8)
    expect(summary).toContain('visited 2 of 8 stops')
    expect(summary).toContain('answered 1 quiz')
    expect(summary).toContain('completed 1 challenge')
  })
})
