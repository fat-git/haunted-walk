/**
 * Narration engine using Web Speech API (speechSynthesis).
 *
 * Handles sentence-level chunking, index tracking for reliable resume,
 * async voice loading on iOS, and playback controls.
 *
 * FAT-43 audio hardening: errors, watchdog, voice-loading timeouts, and
 * cancel-then-speak races surface as visible problems instead of silent
 * "playing" state.
 */

export interface NarrationSentence {
  /** Trimmed sentence text, as spoken and rendered in the transcript. */
  text: string
  /** Offset of the first sentence character in the full text. */
  startChar: number
  /** Offset just past the last sentence character in the full text. */
  endChar: number
}

export interface NarrationState {
  isPlaying: boolean
  isPaused: boolean
  currentSentenceIndex: number
  currentUtterance: SpeechSynthesisUtterance | null
  sentences: NarrationSentence[]
  fullText: string
}

export interface VoiceOption {
  voice: SpeechSynthesisVoice
  name: string
  lang: string
}

/** A user-visible narration failure the UI renders with a retry action. */
export interface NarrationProblem {
  kind: 'speech-error' | 'no-start' | 'no-voices'
  message: string
}

/** Default narration configuration. */
export const DEFAULT_NARRATION_CONFIG = {
  rate: 0.95,
  pitch: 1,
  volume: 1,
  lang: 'en-US',
}

/**
 * Timing constants for the audio-failure paths (FAT-43).
 *
 * - watchdogMs: if `onstart` has not fired this long after speak(), the
 *   utterance is not audible; report, cancel, and retry once.
 * - cancelSpeakDelayMs: Chrome drops a speak() issued right after cancel();
 *   delay the next speak by this much.
 * - voicesTimeoutMs: getVoices() must never hang waiting for voiceschanged.
 * - maxSpeakChunkLength: Chrome/Android stops utterances around 15 s, so
 *   long sentences are split for speaking only.
 */
export const NARRATION_TIMING = {
  watchdogMs: 3000,
  cancelSpeakDelayMs: 60,
  voicesTimeoutMs: 1500,
  maxSpeakChunkLength: 180,
} as const

/**
 * Abbreviations whose period is part of a name ("St. Louis", "No. 1",
 * "James Gallier Jr."), so it does not end a sentence.
 */
const NAME_ABBREVIATIONS = new Set([
  'St',
  'Sr',
  'Jr',
  'No',
  'Mr',
  'Mrs',
  'Ms',
  'Dr',
  'Mt',
  'Ft',
  'Capt',
])

/**
 * Closing characters that may sit between a terminator and the whitespace
 * after it (closing quotes, brackets, commas: "the past.'" / "Jr.,").
 */
const CLOSERS = new Set([',', "'", '"', ')', '’', '”'])

/** Characters a long sentence may be split at for speaking only. */
const SPEAK_SPLIT_CHARS = new Set([',', ';', ':', '—', '–'])

function isTerminal(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?'
}

/** True when the period at `periodIndex` belongs to a name abbreviation. */
function isNameAbbreviation(text: string, periodIndex: number): boolean {
  let j = periodIndex
  while (j > 0 && /[A-Za-z]/.test(text[j - 1])) j--
  return j < periodIndex && NAME_ABBREVIATIONS.has(text.slice(j, periodIndex))
}

/**
 * Split text into sentences for granular playback control.
 *
 * A sentence ends at a run of `.!?` followed by whitespace or the end of the
 * text, with optional closing characters (a quote, comma, or bracket) in
 * between — so `"past.'"` and `"Jr.,"` are kept whole. A period that is part
 * of a name abbreviation ("St. Louis Cemetery No. 1") does not end a
 * sentence. Every non-whitespace character is preserved: joining the
 * returned sentences with single spaces reproduces the input, and
 * startChar/endChar delimit each sentence in the original text.
 */
export function splitIntoSentences(text: string): NarrationSentence[] {
  const sentences: NarrationSentence[] = []
  let start = 0

  const push = (endExclusive: number) => {
    const raw = text.slice(start, endExclusive)
    const trimmed = raw.trim()
    if (trimmed.length === 0) return
    const lead = raw.length - raw.trimStart().length
    const startChar = start + lead
    sentences.push({
      text: trimmed,
      startChar,
      endChar: startChar + trimmed.length,
    })
  }

  for (let i = 0; i < text.length; i++) {
    if (!isTerminal(text[i])) continue

    // A period that is part of a name abbreviation never ends a sentence.
    if (text[i] === '.' && isNameAbbreviation(text, i)) continue

    // Absorb a run of terminal punctuation ("?!", "...").
    let end = i
    while (end + 1 < text.length && isTerminal(text[end + 1])) end++

    // Extend the boundary over closing characters until whitespace or the
    // end of the text; a terminator that runs into more text ("1.5", "U.S.")
    // is not a boundary.
    let k = end + 1
    while (k < text.length && CLOSERS.has(text[k])) k++
    if (k < text.length && !/\s/.test(text[k])) continue
    const boundary = k - 1

    push(boundary + 1)
    start = boundary + 1
    i = boundary
  }

  // Trailing text without a terminator is the final sentence.
  push(text.length)
  return sentences
}

/**
 * Split a sentence into speakable chunks for speech only (FAT-43).
 *
 * Chrome/Android stops utterances longer than ~15 s, so sentences over
 * `maxLength` characters are cut at commas, semicolons, colons, or dashes.
 * This never touches the transcript: `splitIntoSentences` indices and their
 * startChar/endChar mapping stay intact. Joining the chunks with single
 * spaces reproduces the sentence text modulo whitespace at the cut points.
 */
export function splitForSpeaking(
  text: string,
  maxLength: number = NARRATION_TIMING.maxSpeakChunkLength,
): string[] {
  if (text.length <= maxLength) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > maxLength) {
    // Prefer the last split character inside the window; fall back to a hard
    // cut so every iteration makes progress.
    let cut = maxLength
    for (let i = maxLength - 1; i > 0; i--) {
      if (SPEAK_SPLIT_CHARS.has(rest[i])) {
        cut = i + 1
        break
      }
    }
    const chunk = rest.slice(0, cut).trim()
    if (chunk.length > 0) chunks.push(chunk)
    rest = rest.slice(cut)
  }
  if (rest.trim().length > 0) chunks.push(rest.trim())
  return chunks.length > 0 ? chunks : [text.trim()]
}

/**
 * Create a SpeechSynthesisUtterance for a text chunk.
 */
export function createUtterance(
  text: string,
  config: typeof DEFAULT_NARRATION_CONFIG,
  voice: SpeechSynthesisVoice | null,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = config.rate
  utterance.pitch = config.pitch
  utterance.volume = config.volume
  utterance.lang = config.lang
  if (voice) {
    utterance.voice = voice
  }
  return utterance
}

/**
 * Get available voices, handling async loading on iOS.
 *
 * Never hangs and never rejects: if `voiceschanged` never fires (Android
 * Chrome, zero-voice devices) it resolves after `timeoutMs` with whatever
 * voices exist — possibly none. Callers must not block playback on the
 * result.
 */
export function getVoices(
  timeoutMs: number = NARRATION_TIMING.voicesTimeoutMs,
): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }
    let settled = false
    const finish = (result: SpeechSynthesisVoice[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      speechSynthesis.onvoiceschanged = null
      resolve(result)
    }
    const timer = setTimeout(() => {
      // Poll once more on timeout, then settle with what exists.
      finish(speechSynthesis.getVoices())
    }, timeoutMs)
    speechSynthesis.onvoiceschanged = () => {
      finish(speechSynthesis.getVoices())
    }
  })
}

/**
 * Select the best English voice for narration.
 * Prefers a natural-sounding English voice.
 */
export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  // Preferred voice names (high quality, natural)
  const preferredNames = [
    'Samantha', // iOS/macOS
    'Google US English', // Android/Chrome
    'Microsoft Zira', // Windows
    'Alex', // macOS
    'Victoria', // macOS
  ]

  // First try exact name matches
  for (const name of preferredNames) {
    const voice = voices.find((v) => v.name === name && v.lang.startsWith('en'))
    if (voice) return voice
  }

  // Then try partial name matches
  for (const name of preferredNames) {
    const voice = voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'))
    if (voice) return voice
  }

  // Fallback: any English voice
  const englishVoice = voices.find((v) => v.lang.startsWith('en'))
  if (englishVoice) return englishVoice

  // Last resort: first available voice
  return voices[0] ?? null
}

/** Plain-language message for a speechSynthesis error code. */
export function describeSpeechError(error: string): string {
  switch (error) {
    case 'not-allowed':
      return 'Speech was blocked by the browser or the phone. Check that silent mode is off and audio is allowed for this site.'
    case 'audio-busy':
      return 'The audio channel was busy. Stop other audio and tap Retry.'
    case 'audio-could-not-be-fetched':
      return 'The speech engine could not fetch the audio it needed.'
    case 'synthesis-failed':
    case 'synthesis-unavailable':
      return "The phone's speech engine failed. Tap Retry; if it keeps failing, restart the browser."
    case 'voice-unavailable':
      return 'The chosen speech voice is unavailable on this device.'
    case 'language-unavailable':
      return 'No English speech voice is available on this device.'
    case 'network':
      return 'The speech voice needs a network download that failed.'
    case 'interrupted':
    case 'canceled':
      return 'Speech was interrupted.'
    default:
      return `Speech error: ${error}`
  }
}

/** What the "Test audio" button on the start screen reports back. */
export interface AudioCheckResult {
  voiceCount: number
  voiceName: string | null
  started: boolean
  ended: boolean
  error: string | null
}

/** Human-readable one-liner for the audio check result. */
export function formatAudioCheck(result: AudioCheckResult): string {
  const voice = result.voiceName ? `"${result.voiceName}"` : 'none'
  let status: string
  if (result.error) {
    status = `failed: ${result.error}`
  } else if (result.ended && result.started) {
    status = 'played start to finish — narration should work'
  } else if (result.ended) {
    status = 'ended without a start event — narration may not be audible'
  } else if (result.started) {
    status = 'still speaking…'
  } else {
    status = 'did not start'
  }
  return `Voices installed: ${result.voiceCount}. Voice: ${voice}. ${status}`
}

/**
 * Speak a fixed check phrase and report what happened. Must be called from a
 * user gesture (the Test audio button tap).
 */
export function runAudioCheck(timeoutMs: number = 6000): Promise<AudioCheckResult> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    const voice = selectBestVoice(voices)
    const result: AudioCheckResult = {
      voiceCount: voices.length,
      voiceName: voice ? voice.name : null,
      started: false,
      ended: false,
      error: null,
    }
    const utterance = new SpeechSynthesisUtterance(
      'Audio check. If you can hear this, narration will work.',
    )
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.lang = DEFAULT_NARRATION_CONFIG.lang
    if (voice) utterance.voice = voice

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      if (!result.error) {
        result.error = 'audio did not start within the timeout'
      }
      speechSynthesis.cancel()
      finish()
    }, timeoutMs)

    utterance.onstart = () => {
      result.started = true
    }
    utterance.onend = () => {
      result.ended = true
      finish()
    }
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        result.error = describeSpeechError(event.error)
      }
      finish()
    }
    speechSynthesis.speak(utterance)
  })
}

/**
 * Narration engine class managing playback state.
 */
export class NarrationEngine {
  private state: NarrationState
  private config: typeof DEFAULT_NARRATION_CONFIG
  private voice: SpeechSynthesisVoice | null = null
  private onSentenceChange: ((index: number) => void) | null = null
  private onEnd: (() => void) | null = null
  private onProblem: ((problem: NarrationProblem) => void) | null = null
  private pendingResume = false
  private problem: NarrationProblem | null = null
  // Speech plumbing (FAT-43)
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null
  private speakDelayTimer: ReturnType<typeof setTimeout> | null = null
  private needsCancelDelay = false
  private startedCurrent = false
  private erroredCurrent = false
  private watchdogRetried = false
  private generation = 0
  private chunks: string[] = []

  constructor(text: string, config: Partial<typeof DEFAULT_NARRATION_CONFIG> = {}) {
    this.config = { ...DEFAULT_NARRATION_CONFIG, ...config }
    this.state = {
      isPlaying: false,
      isPaused: false,
      currentSentenceIndex: 0,
      currentUtterance: null,
      sentences: splitIntoSentences(text),
      fullText: text,
    }
  }

  /** Initialize the engine (load voices; never blocks playback). */
  async init(): Promise<void> {
    const voices = await getVoices()
    this.voice = selectBestVoice(voices)
    if (voices.length === 0) {
      this.reportProblem({
        kind: 'no-voices',
        message: 'No speech voices are installed on this device.',
      })
    }
  }

  /** Set callback for sentence changes (for transcript highlighting). */
  setOnSentenceChange(callback: (index: number) => void): void {
    this.onSentenceChange = callback
  }

  /** Set callback for narration end. */
  setOnEnd(callback: () => void): void {
    this.onEnd = callback
  }

  /** Set callback for visible narration problems (errors, no audio start). */
  setOnProblem(callback: (problem: NarrationProblem) => void): void {
    this.onProblem = callback
  }

  /** Get current playback state. */
  getState(): Readonly<NarrationState> {
    return this.state
  }

  /** Get the current user-visible narration problem, if any. */
  getProblem(): NarrationProblem | null {
    return this.problem
  }

  /** Clear the current problem without changing playback. */
  clearProblem(): void {
    this.problem = null
  }

  /** Get sentences for transcript rendering. */
  getSentences(): readonly NarrationSentence[] {
    return this.state.sentences
  }

  /** Start or resume narration from current position. */
  play(): void {
    if (this.state.isPlaying && !this.state.isPaused) return

    // If paused, resume from tracked index (don't trust engine's pause state)
    if (this.state.isPaused) {
      this.resume()
      return
    }

    this.state.isPlaying = true
    this.state.isPaused = false
    this.speakCurrentSentence()
  }

  /** Pause narration. */
  pause(): void {
    if (!this.state.isPlaying || this.state.isPaused) return

    this.cancelSpeech()
    this.state.isPaused = true
    this.state.isPlaying = false
  }

  /** Resume from tracked sentence index. */
  private resume(): void {
    this.state.isPlaying = true
    this.state.isPaused = false
    this.speakCurrentSentence()
  }

  /** Stop narration and reset to beginning. */
  stop(): void {
    this.bumpGeneration()
    this.clearWatchdog()
    this.clearSpeakDelay()
    this.needsCancelDelay = false
    speechSynthesis.cancel()
    this.state.isPlaying = false
    this.state.isPaused = false
    this.state.currentSentenceIndex = 0
    this.state.currentUtterance = null
    this.pendingResume = false
    this.erroredCurrent = false
    this.startedCurrent = false
    this.watchdogRetried = false
    this.chunks = []
  }

  /** Skip to next sentence. */
  next(): void {
    if (this.state.currentSentenceIndex < this.state.sentences.length - 1) {
      this.cancelSpeech()
      this.state.currentSentenceIndex += 1
      if (this.state.isPlaying) {
        this.speakCurrentSentence()
      }
    } else {
      this.stop()
      this.onEnd?.()
    }
  }

  /** Go to previous sentence (replay current or previous). */
  previous(): void {
    this.cancelSpeech()
    if (this.state.currentSentenceIndex > 0) {
      this.state.currentSentenceIndex -= 1
    }
    if (this.state.isPlaying) {
      this.speakCurrentSentence()
    }
  }

  /** Jump to a specific sentence index. */
  goToSentence(index: number): void {
    const clampedIndex = Math.max(0, Math.min(index, this.state.sentences.length - 1))
    this.cancelSpeech()
    this.state.currentSentenceIndex = clampedIndex
    if (this.state.isPlaying) {
      this.speakCurrentSentence()
    }
  }

  /** Replay current sentence from beginning. */
  replay(): void {
    this.cancelSpeech()
    this.speakCurrentSentence()
  }

  /** User-tap retry after a visible problem: clear it and replay the sentence. */
  retry(): void {
    this.clearProblem()
    this.pendingResume = false
    this.erroredCurrent = false
    this.replay()
  }

  /**
   * cancel() plus bookkeeping. Chrome drops a speak() issued immediately
   * after cancel(), so the next speak is queued behind a short delay.
   */
  private cancelSpeech(): void {
    this.bumpGeneration()
    this.clearWatchdog()
    this.needsCancelDelay = true
    speechSynthesis.cancel()
  }

  private bumpGeneration(): void {
    this.generation += 1
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearTimeout(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  private clearSpeakDelay(): void {
    if (this.speakDelayTimer !== null) {
      clearTimeout(this.speakDelayTimer)
      this.speakDelayTimer = null
    }
  }

  private reportProblem(problem: NarrationProblem): void {
    this.problem = problem
    this.onProblem?.(problem)
  }

  /** Speak the current sentence. */
  private speakCurrentSentence(): void {
    const { currentSentenceIndex, sentences } = this.state
    if (currentSentenceIndex >= sentences.length) {
      this.stop()
      this.onEnd?.()
      return
    }

    const sentence = sentences[currentSentenceIndex]
    this.chunks = splitForSpeaking(sentence.text)
    this.state.isPlaying = true
    this.state.isPaused = false
    this.onSentenceChange?.(currentSentenceIndex)
    this.startChunk(0)
  }

  /**
   * Speak a chunk, honoring the post-cancel delay when a cancel just ran.
   * A generation token guards against stale timers after stop()/cancel().
   */
  private startChunk(chunkIndex: number): void {
    if (this.needsCancelDelay) {
      this.needsCancelDelay = false
      const gen = this.generation
      this.clearSpeakDelay()
      this.speakDelayTimer = setTimeout(() => {
        this.speakDelayTimer = null
        if (gen !== this.generation) return
        this.speakChunk(chunkIndex)
      }, NARRATION_TIMING.cancelSpeakDelayMs)
      return
    }
    this.speakChunk(chunkIndex)
  }

  private speakChunk(chunkIndex: number): void {
    const text = this.chunks[chunkIndex]
    if (text === undefined) return
    const utterance = createUtterance(text, this.config, this.voice)

    const gen = this.generation
    this.startedCurrent = false
    this.erroredCurrent = false

    utterance.onstart = () => {
      this.startedCurrent = true
      this.watchdogRetried = false
      this.clearWatchdog()
      this.clearProblem()
      this.state.isPlaying = true
      this.state.isPaused = false
    }

    utterance.onend = () => {
      // iOS sometimes fires onend prematurely; check if we were interrupted
      if (this.pendingResume) {
        this.pendingResume = false
        return
      }
      if (gen !== this.generation) return
      // A real error already surfaced; do not advance on the trailing end.
      if (this.erroredCurrent) {
        this.erroredCurrent = false
        return
      }
      this.clearWatchdog()
      const nextChunk = chunkIndex + 1
      if (nextChunk < this.chunks.length) {
        // Next chunk of the same sentence: no cancel involved, speak at once.
        this.startChunk(nextChunk)
        return
      }
      this.state.currentSentenceIndex += 1
      this.onSentenceChange?.(this.state.currentSentenceIndex)
      if (this.state.currentSentenceIndex < this.state.sentences.length) {
        this.speakCurrentSentence()
      } else {
        this.stop()
        this.onEnd?.()
      }
    }

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      // Ignore 'interrupted' errors (happen on pause/cancel)
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        this.erroredCurrent = true
        this.clearWatchdog()
        this.state.isPlaying = false
        this.state.isPaused = false
        this.reportProblem({
          kind: 'speech-error',
          message: describeSpeechError(event.error),
        })
      }
      // If interrupted during play, we may need to resume
      if (this.state.isPlaying && event.error === 'interrupted') {
        this.pendingResume = true
      }
    }

    this.state.currentUtterance = utterance
    // resume() clears a stuck paused state and is a no-op otherwise; it must
    // run before speak() (Chrome workaround).
    if (typeof speechSynthesis.resume === 'function') {
      speechSynthesis.resume()
    }
    speechSynthesis.speak(utterance)
    this.armWatchdog(utterance, gen, chunkIndex)
  }

  /**
   * Watchdog: if `onstart` never fires after speak(), the walker hears
   * nothing while the UI says "playing". Surface it, cancel, and retry once.
   */
  private armWatchdog(
    utterance: SpeechSynthesisUtterance,
    gen: number,
    chunkIndex: number,
  ): void {
    this.clearWatchdog()
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null
      if (gen !== this.generation) return
      if (this.state.currentUtterance !== utterance) return
      if (this.startedCurrent) return
      this.handleNoStart(chunkIndex)
    }, NARRATION_TIMING.watchdogMs)
  }

  private handleNoStart(chunkIndex: number): void {
    this.reportProblem({
      kind: 'no-start',
      message:
        'Audio did not start. Turn the media volume up, make sure the phone is not in silent or Do-Not-Disturb mode, then tap Retry.',
    })
    this.cancelSpeech()
    if (!this.watchdogRetried) {
      this.watchdogRetried = true
      this.startChunk(chunkIndex)
      return
    }
    // The retry also never started: stop pretending audio is playing.
    this.state.isPlaying = false
    this.state.isPaused = false
  }

  /** Check if speech synthesis is supported. */
  static isSupported(): boolean {
    return 'speechSynthesis' in window
  }

  /** Check if voices are loaded. */
  static areVoicesLoaded(): boolean {
    return speechSynthesis.getVoices().length > 0
  }
}
