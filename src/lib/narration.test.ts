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
  SPEECH_RATE_KEY,
  VOICE_PREFERENCE_KEY,
  NarrationEngine,
  describeSpeechError,
  formatAudioCheck,
  getVoices,
  loadSpeechRate,
  loadVoicePreference,
  pickBestVoice,
  runAudioCheck,
  saveSpeechRate,
  saveVoicePreference,
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
    // FAT-49: sentence 2 starts only after the between-sentence pause.
    vi.advanceTimersByTime(NARRATION_TIMING.sentencePauseMs)
    advanceCurrent() // finish both sentences so no utterance is left pending
    vi.advanceTimersByTime(NARRATION_TIMING.watchdogMs)
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
    vi.advanceTimersByTime(NARRATION_TIMING.sentencePauseMs)
    advanceCurrent()
    engine.pause()
    engine.play()
    vi.advanceTimersByTime(NARRATION_TIMING.cancelSpeakDelayMs)
    while (engine.getState().isPlaying && spoken.length < 20) {
      advanceCurrent()
      vi.advanceTimersByTime(NARRATION_TIMING.sentencePauseMs)
    }
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

/** Fake localStorage for the FAT-49 persistence helpers (node env). */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const fake = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  }
  vi.stubGlobal('localStorage', fake)
  return store
}

/** Fixture voice factory: devices expose name+lang+voiceURI. */
const fixtureVoice = (
  name: string,
  lang: string,
  voiceURI = name,
): SpeechSynthesisVoice =>
  ({
    name,
    lang,
    voiceURI,
    default: false,
    localService: true,
  }) as unknown as SpeechSynthesisVoice

describe('FAT-49 voice ranking (fixture voice lists per platform)', () => {
  it('iOS Safari: prefers a Premium/Enhanced voice over the compact default', () => {
    // iOS ships "Samantha" as the compact fallback; downloaded enhanced
    // voices surface names like "Ava (Premium)" or "Siri (English (US))".
    const ios = [
      fixtureVoice('Samantha', 'en-US'),
      fixtureVoice('Ava (Premium)', 'en-US'),
      fixtureVoice('Nick', 'en-US'),
    ]
    expect(pickBestVoice(ios)?.name).toBe('Ava (Premium)')
  })

  it('iOS Safari: Siri beats an Apple preferred name without quality markers', () => {
    const ios = [
      fixtureVoice('Samantha', 'en-US'),
      fixtureVoice('Siri (English (United States))', 'en-US'),
    ]
    expect(pickBestVoice(ios)?.name).toBe('Siri (English (United States))')
  })

  it('iOS Safari: compact Samantha still wins when it is the only en-US voice', () => {
    const ios = [fixtureVoice('Amélie', 'fr-CA'), fixtureVoice('Samantha', 'en-US')]
    expect(pickBestVoice(ios)?.name).toBe('Samantha')
  })

  it('Android Chrome: Google network voices beat generic device voices', () => {
    const android = [
      fixtureVoice('com.apple.ttsforgeign', 'en-US'),
      fixtureVoice('Samsung TTS', 'en-US'),
      fixtureVoice('Google US English', 'en-US'),
    ]
    expect(pickBestVoice(android)?.name).toBe('Google US English')
  })

  it('desktop Chrome: Google US English beats an SAPI fallback', () => {
    const desktop = [
      fixtureVoice('Microsoft Zira - English (United States)', 'en-US'),
      fixtureVoice('Google US English', 'en-US'),
    ]
    expect(pickBestVoice(desktop)?.name).toBe('Google US English')
  })

  it('Edge: Natural online voices beat Google voices', () => {
    const edge = [
      fixtureVoice('Google US English', 'en-US'),
      fixtureVoice('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    ]
    expect(pickBestVoice(edge)?.name).toBe(
      'Microsoft Aria Online (Natural) - English (United States)',
    )
  })

  it('exact tour language beats a same-primary-subtag voice', () => {
    const mixed = [fixtureVoice('Daniel', 'en-GB'), fixtureVoice('Fred', 'en-US')]
    expect(pickBestVoice(mixed, 'en-US')?.name).toBe('Fred')
  })

  it('falls back to the best-scoring voice of any language when the tour language is missing', () => {
    const onlyFrench = [fixtureVoice('Thomas', 'fr-FR'), fixtureVoice('Amélie', 'fr-CA')]
    expect(pickBestVoice(onlyFrench, 'en-US')?.name).toBe('Amélie')
    expect(pickBestVoice([], 'en-US')).toBeNull()
  })
})

describe('FAT-49 speed and voice persistence', () => {
  it('defaults to the tuned delivery rate when nothing is stored', () => {
    stubLocalStorage()
    expect(loadSpeechRate()).toBe(0.92)
  })

  it('round-trips a chosen speed', () => {
    stubLocalStorage()
    saveSpeechRate(0.9)
    expect(loadSpeechRate()).toBe(0.9)
    saveSpeechRate(1.1)
    expect(loadSpeechRate()).toBe(1.1)
  })

  it('falls back to the default on corrupt or out-of-range stored values', () => {
    stubLocalStorage({ [SPEECH_RATE_KEY]: 'not-a-number' })
    expect(loadSpeechRate()).toBe(0.92)
    stubLocalStorage({ [SPEECH_RATE_KEY]: '9' })
    expect(loadSpeechRate()).toBe(0.92)
    stubLocalStorage({ [SPEECH_RATE_KEY]: '-1' })
    expect(loadSpeechRate()).toBe(0.92)
  })

  it('round-trips the voice preference and ignores garbage', () => {
    stubLocalStorage()
    expect(loadVoicePreference()).toBeNull()
    saveVoicePreference('com.apple.tts.siri')
    expect(loadVoicePreference()).toBe('com.apple.tts.siri')
    saveVoicePreference('')
    expect(loadVoicePreference()).toBe('com.apple.tts.siri')
  })
})

describe('FAT-49 engine delivery', () => {
  it('speaks at the tuned default rate 0.92 and pitch 1', () => {
    const engine = new NarrationEngine('One.')
    engine.play()
    expect(spoken).toHaveLength(1)
    expect(spoken[0].rate).toBe(0.92)
    expect(spoken[0].pitch).toBe(1)
  })

  it('honors the start-screen Speed choice', () => {
    const engine = new NarrationEngine('One.', { rate: 0.8 })
    engine.play()
    expect(spoken[0].rate).toBe(0.8)
  })

  it('uses the voice saved in the picker after init', async () => {
    stubLocalStorage({ [VOICE_PREFERENCE_KEY]: 'com.apple.tts.siri' })
    voices = [
      { name: 'Samantha', lang: 'en-US' },
      {
        name: 'Siri (English (United States))',
        lang: 'en-US',
        voiceURI: 'com.apple.tts.siri',
      },
    ] as unknown as FakeVoice[]
    const engine = new NarrationEngine('One.')
    const init = engine.init()
    await init
    engine.play()
    expect(spoken[0].voice?.name).toBe('Siri (English (United States))')
  })

  it('falls back to the ranked voice when the saved voiceURI no longer exists', async () => {
    stubLocalStorage({ [VOICE_PREFERENCE_KEY]: 'removed.voice' })
    voices = [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Ava (Premium)', lang: 'en-US' },
    ] as unknown as FakeVoice[]
    const engine = new NarrationEngine('One.')
    await engine.init()
    engine.play()
    expect(spoken[0].voice?.name).toBe('Ava (Premium)')
  })

  it('leaves a 250 ms spoken pause between sentences, not between chunks', () => {
    const clause = 'C'.repeat(38)
    const long = Array.from({ length: 6 }, () => clause).join(', ') + '.'
    const engine = new NarrationEngine(`${long} Two.`)
    engine.play()
    expect(spoken).toHaveLength(1)
    // Chunk of the same sentence: chains immediately, no pause.
    advanceCurrent()
    expect(spoken).toHaveLength(2)
    expect(active).not.toBeNull()
    // Sentence boundary: the next speak waits for the pause.
    advanceCurrent()
    expect(spoken).toHaveLength(2)
    expect(active).toBeNull()
    vi.advanceTimersByTime(NARRATION_TIMING.sentencePauseMs - 1)
    expect(spoken).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(spoken).toHaveLength(3)
    expect(spoken[2].text).toBe('Two.')
  })

  it('drops a pending pause when the walker stops or skips', () => {
    const engine = new NarrationEngine('One. Two.')
    engine.play()
    advanceCurrent()
    engine.stop()
    vi.advanceTimersByTime(NARRATION_TIMING.sentencePauseMs * 2)
    expect(spoken).toHaveLength(1)
    expect(engine.getState().isPlaying).toBe(false)
  })

  it('skips the pause entirely when sentencePauseMs is 0', () => {
    const engine = new NarrationEngine('One. Two.', { sentencePauseMs: 0 })
    engine.play()
    advanceCurrent()
    expect(spoken).toHaveLength(2)
    expect(spoken[1].text).toBe('Two.')
  })
})

describe('FAT-49 audio check honors the picked voice and speed', () => {
  it('speaks with the selected picker voice at the persisted rate', async () => {
    stubLocalStorage({ [SPEECH_RATE_KEY]: '0.8' })
    const picked = fixtureVoice('Picked Voice', 'en-US', 'picked')
    const promise = runAudioCheck(picked)
    expect(spoken).toHaveLength(1)
    expect(spoken[0].voice?.name).toBe('Picked Voice')
    expect(spoken[0].rate).toBe(0.8)
    active?.onstart?.()
    active?.onend?.()
    const result = await promise
    expect(result.voiceName).toBe('Picked Voice')
  })
})
