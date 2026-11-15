/**
 * FAT-43 narration audio-failure coverage.
 *
 * A mocked speechSynthesis drives the failure paths the sandbox cannot hear:
 * surfaced speech errors, the no-start watchdog, voice-loading timeouts, the
 * Chrome cancel-then-speak race, and speaking-only chunking of long sentences
 * (transcript indices must not move).
 */
/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NARRATION_TIMING,
  NarrationEngine,
  describeSpeechError,
  formatAudioCheck,
  getVoices,
  runAudioCheck,
  splitForSpeaking,
  splitIntoSentences,
  type NarrationProblem,
} from './narration'

class FakeUtterance {
  text: string
  rate = 1
  pitch = 1
  volume = 1
  lang = ''
  voice: SpeechSynthesisVoice | undefined = undefined
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

type FakeVoice = { name: string; lang: string }

let spoken: FakeUtterance[]
let active: FakeUtterance | null
let cancelCount: number
let resumeCount: number
let voices: FakeVoice[]

const fakeSynthesis = {
  speak(utterance: FakeUtterance) {
    spoken.push(utterance)
    active = utterance
  },
  cancel() {
    cancelCount += 1
    if (active) {
      const interrupted = active
      active = null
      interrupted.onerror?.({ error: 'interrupted' })
      interrupted.onend?.()
    }
  },
  resume() {
    resumeCount += 1
  },
  pause() {},
  getVoices() {
    return voices as unknown as SpeechSynthesisVoice[]
  },
  onvoiceschanged: null as ((ev: SpeechSynthesisEvent) => void) | null,
}

/** Complete the active utterance the way a healthy engine does. */
const advanceCurrent = () => {
  const utterance = active
  if (!utterance) return
  active = null
  utterance.onstart?.()
  utterance.onend?.()
}

beforeEach(() => {
  vi.useFakeTimers()
  spoken = []
  active = null
  cancelCount = 0
  resumeCount = 0
  voices = [{ name: 'Test Voice', lang: 'en-US' }]
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', fakeSynthesis)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('FAT-43 splitForSpeaking (speech-only chunking)', () => {
  it('keeps short sentences whole', () => {
    expect(splitForSpeaking('Short sentence.')).toEqual(['Short sentence.'])
  })

  it('splits long sentences at commas into chunks within the length cap', () => {
    const clause = 'A'.repeat(38)
    const text = Array.from({ length: 6 }, () => clause).join(', ') + '.'
    const chunks = splitForSpeaking(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(NARRATION_TIMING.maxSpeakChunkLength)
    }
    expect(chunks.join(' ')).toBe(text)
  })

  it('hard-cuts progress when a long run has no split character', () => {
    const text = 'B'.repeat(400)
    const chunks = splitForSpeaking(text)
    expect(chunks.length).toBe(3)
    expect(chunks.join('')).toBe(text)
  })
})

describe('FAT-43 getVoices never hangs', () => {
  it('resolves immediately when voices exist', async () => {
    await expect(getVoices()).resolves.toHaveLength(1)
  })

  it('resolves on timeout with zero voices when voiceschanged never fires', async () => {
    voices = []
    const onVoices = vi.fn()
    const promise = getVoices().then(onVoices)
    await vi.advanceTimersByTimeAsync(NARRATION_TIMING.voicesTimeoutMs)
    await promise
    expect(onVoices).toHaveBeenCalledWith([])
    expect(fakeSynthesis.onvoiceschanged).toBeNull()
  })

  it('resolves early when voiceschanged fires before the timeout', async () => {
    voices = []
    const onVoices = vi.fn()
    const promise = getVoices().then(onVoices)
    await vi.advanceTimersByTimeAsync(10)
    expect(onVoices).not.toHaveBeenCalled()
    voices = [{ name: 'Late Voice', lang: 'en-US' }]
    fakeSynthesis.onvoiceschanged?.(new Event('voiceschanged') as SpeechSynthesisEvent)
    await promise
    expect(onVoices).toHaveBeenCalledWith(voices)
  })
})

describe('FAT-43 error surfacing', () => {
  it('surfaces a real speech error as a visible problem and stops "playing"', () => {
    const engine = new NarrationEngine('One. Two.')
    const problems: NarrationProblem[] = []
    engine.setOnProblem((problem) => problems.push(problem))
    engine.play()
    expect(spoken).toHaveLength(1)

    active?.onerror?.({ error: 'not-allowed' })
    active?.onend?.()

    expect(problems).toHaveLength(1)
    expect(problems[0].kind).toBe('speech-error')
    expect(problems[0].message).toBe(describeSpeechError('not-allowed'))
    expect(engine.getProblem()).toEqual(problems[0])
    expect(engine.getState().isPlaying).toBe(false)
    // The trailing end event must not advance the transcript past the error.
    expect(engine.getState().currentSentenceIndex).toBe(0)
  })

  it('filters cancel/interrupt noise: no problem is reported for those', () => {
    const engine = new NarrationEngine('One. Two.')
    const problems: NarrationProblem[] = []
    engine.setOnProblem((problem) => problems.push(problem))
    engine.play()
    engine.pause() // cancel -> interrupted error + end
    expect(problems).toEqual([])
    expect(engine.getProblem()).toBeNull()
  })

  it('maps error codes to plain language', () => {
    expect(describeSpeechError('not-allowed')).toMatch(/blocked|silent/i)
    expect(describeSpeechError('synthesis-failed')).toMatch(/speech engine/i)
    expect(describeSpeechError('voice-unavailable')).toMatch(/voice/i)
    expect(describeSpeechError('weird-thing')).toMatch(/weird-thing/)
  })
})

describe('FAT-43 no-start watchdog', () => {
  it('reports, cancels, and retries once when onstart never fires', () => {
    const engine = new NarrationEngine('One. Two. Three.')
    const problems: NarrationProblem[] = []
    engine.setOnProblem((problem) => problems.push(problem))
    engine.play()
    expect(spoken).toHaveLength(1)
    const firstText = spoken[0].text

    vi.advanceTimersByTime(NARRATION_TIMING.watchdogMs)
    expect(problems[0].kind).toBe('no-start')
    expect(problems[0].message).toMatch(/Audio did not start/i)
    expect(cancelCount).toBeGreaterThan(0)
    // Retry is queued behind the post-cancel delay, not dropped.
    expect(spoken).toHaveLength(1)
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    expect(spoken).toHaveLength(2)
    expect(spoken[1].text).toBe(firstText)

    // The retry also never starts: no third speak, no fake "playing" state.
    vi.advanceTimersByTime(NARRATION_TIMING.watchdogMs)
    expect(spoken).toHaveLength(2)
    expect(engine.getState().isPlaying).toBe(false)
    expect(problems).toHaveLength(2)
  })

  it('does not fire when onstart arrives in time and clears the problem', () => {
    const engine = new NarrationEngine('One. Two.')
    const problems: NarrationProblem[] = []
    engine.setOnProblem((problem) => problems.push(problem))
    engine.play()
    advanceCurrent()
    advanceCurrent() // finish both sentences so no utterance is left pending
    vi.advanceTimersByTime(NARRATION_TIMING.watchdogMs * 2)
    expect(problems).toEqual([])
    expect(spoken).toHaveLength(2)
  })
})

describe('FAT-43 cancel-then-speak race', () => {
  it('delays speak by ~60 ms after cancel in next/previous/replay paths', () => {
    const engine = new NarrationEngine('One. Two. Three. Four.')
    engine.play()
    expect(spoken).toHaveLength(1)

    engine.next()
    expect(cancelCount).toBe(1)
    expect(spoken).toHaveLength(1) // dropped by Chrome if spoken immediately
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    expect(spoken).toHaveLength(2)
    expect(spoken[1].text).toBe('Two.')

    engine.previous()
    expect(spoken).toHaveLength(2)
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    expect(spoken).toHaveLength(3)
    expect(spoken[2].text).toBe('One.')

    engine.replay()
    expect(spoken).toHaveLength(3)
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    expect(spoken).toHaveLength(4)
    expect(spoken[3].text).toBe('One.')
  })

  it('calls resume() before speak() to clear a stuck paused state', () => {
    const engine = new NarrationEngine('One. Two.')
    engine.play()
    advanceCurrent()
    engine.pause()
    const resumesBefore = resumeCount
    engine.play()
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    expect(resumeCount).toBeGreaterThan(resumesBefore)
    expect(spoken[spoken.length - 1].text).toBe('Two.')
  })

  it('keeps resume playing the rest of the script (pause -> play -> finish)', () => {
    const engine = new NarrationEngine('One. Two. Three.')
    const onEnd = vi.fn()
    engine.setOnEnd(onEnd)
    engine.play()
    advanceCurrent()
    advanceCurrent()
    engine.pause()
    engine.play()
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    while (engine.getState().isPlaying && spoken.length < 20) advanceCurrent()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

describe('FAT-43 zero voices', () => {
  it('reports no-voices on init and still plays without an explicit voice', async () => {
    voices = []
    const engine = new NarrationEngine('One. Two.')
    const problems: NarrationProblem[] = []
    engine.setOnProblem((problem) => problems.push(problem))
    const init = engine.init()
    await vi.advanceTimersByTimeAsync(NARRATION_TIMING.voicesTimeoutMs)
    await init
    expect(problems).toHaveLength(1)
    expect(problems[0].kind).toBe('no-voices')
    expect(problems[0].message).toMatch(/No speech voices are installed/i)

    engine.play()
    expect(spoken).toHaveLength(1)
    expect(spoken[0].voice).toBeUndefined()
  })
})

describe('FAT-43 transcript indices vs spoken chunks', () => {
  it('speaks chunks of a long sentence while transcript mapping stays intact', () => {
    const clause = 'C'.repeat(38)
    const text = Array.from({ length: 6 }, () => clause).join(', ') + '.'
    const engine = new NarrationEngine(text)
    const indices: number[] = []
    engine.setOnSentenceChange((index) => indices.push(index))
    engine.play()
    while (engine.getState().isPlaying && spoken.length < 20) advanceCurrent()

    const chunkTexts = spoken.map((u) => u.text)
    expect(chunkTexts.length).toBeGreaterThan(1)
    for (const chunk of chunkTexts) {
      expect(chunk.length).toBeLessThanOrEqual(NARRATION_TIMING.maxSpeakChunkLength)
    }
    expect(chunkTexts.join(' ')).toBe(text)

    // Transcript: exactly one sentence, original offsets unchanged.
    expect(engine.getSentences()).toEqual(splitIntoSentences(text))
    expect(engine.getSentences()[0].startChar).toBe(0)
    expect(engine.getSentences()[0].endChar).toBe(text.length)

    // Highlight covered only the one transcript sentence (0), then ended (1).
    expect([...new Set(indices)]).toEqual([0, 1])
  })
})

describe('FAT-43 audio check', () => {
  it('reports voice count, chosen voice, started/ended', async () => {
    const promise = runAudioCheck()
    expect(spoken).toHaveLength(1)
    expect(spoken[0].text).toContain('Audio check')
    active?.onstart?.()
    active?.onend?.()
    const result = await promise
    expect(result).toEqual({
      voiceCount: 1,
      voiceName: 'Test Voice',
      started: true,
      ended: true,
      error: null,
    })
    expect(formatAudioCheck(result)).toMatch(/1.*Test Voice.*narration should work/s)
  })

  it('reports an error instead of hanging when nothing starts', async () => {
    const promise = runAudioCheck()
    await vi.advanceTimersByTimeAsync(6000)
    const result = await promise
    expect(result.started).toBe(false)
    expect(result.error).toMatch(/did not start/i)
  })

  it('surfaces speech errors from the check', async () => {
    const promise = runAudioCheck()
    active?.onerror?.({ error: 'not-allowed' })
    const result = await promise
    expect(result.error).toBe(describeSpeechError('not-allowed'))
  })
})
