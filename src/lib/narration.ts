/**
 * Narration engine using Web Speech API (speechSynthesis).
 *
 * Handles sentence-level chunking, index tracking for reliable resume,
 * async voice loading on iOS, and playback controls.
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

/** Default narration configuration. */
export const DEFAULT_NARRATION_CONFIG = {
  rate: 0.95,
  pitch: 1,
  volume: 1,
  lang: 'en-US',
}

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
 * Create a SpeechSynthesisUtterance for a sentence.
 */
export function createUtterance(
  sentence: NarrationSentence,
  config: typeof DEFAULT_NARRATION_CONFIG,
  voice: SpeechSynthesisVoice | null,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(sentence.text)
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
 */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }
    // Voices load asynchronously on iOS
    speechSynthesis.onvoiceschanged = () => {
      resolve(speechSynthesis.getVoices())
      speechSynthesis.onvoiceschanged = null
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

/**
 * Narration engine class managing playback state.
 */
export class NarrationEngine {
  private state: NarrationState
  private config: typeof DEFAULT_NARRATION_CONFIG
  private voice: SpeechSynthesisVoice | null = null
  private onSentenceChange: ((index: number) => void) | null = null
  private onEnd: (() => void) | null = null
  private onError: ((error: SpeechSynthesisErrorEvent) => void) | null = null
  private pendingResume = false

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

  /** Initialize the engine (load voices). */
  async init(): Promise<void> {
    const voices = await getVoices()
    this.voice = selectBestVoice(voices)
  }

  /** Set callback for sentence changes (for transcript highlighting). */
  setOnSentenceChange(callback: (index: number) => void): void {
    this.onSentenceChange = callback
  }

  /** Set callback for narration end. */
  setOnEnd(callback: () => void): void {
    this.onEnd = callback
  }

  /** Set callback for errors. */
  setOnError(callback: (error: SpeechSynthesisErrorEvent) => void): void {
    this.onError = callback
  }

  /** Get current playback state. */
  getState(): Readonly<NarrationState> {
    return this.state
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

    speechSynthesis.cancel()
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
    speechSynthesis.cancel()
    this.state.isPlaying = false
    this.state.isPaused = false
    this.state.currentSentenceIndex = 0
    this.state.currentUtterance = null
  }

  /** Skip to next sentence. */
  next(): void {
    if (this.state.currentSentenceIndex < this.state.sentences.length - 1) {
      speechSynthesis.cancel()
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
    speechSynthesis.cancel()
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
    speechSynthesis.cancel()
    this.state.currentSentenceIndex = clampedIndex
    if (this.state.isPlaying) {
      this.speakCurrentSentence()
    }
  }

  /** Replay current sentence from beginning. */
  replay(): void {
    speechSynthesis.cancel()
    this.speakCurrentSentence()
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
    const utterance = createUtterance(sentence, this.config, this.voice)

    utterance.onstart = () => {
      this.state.isPlaying = true
      this.state.isPaused = false
    }

    utterance.onend = () => {
      // iOS sometimes fires onend prematurely; check if we were interrupted
      if (this.pendingResume) {
        this.pendingResume = false
        return
      }
      this.state.currentSentenceIndex += 1
      this.onSentenceChange?.(this.state.currentSentenceIndex)
      if (this.state.currentSentenceIndex < sentences.length) {
        this.speakCurrentSentence()
      } else {
        this.stop()
        this.onEnd?.()
      }
    }

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      // Ignore 'interrupted' errors (happen on pause/cancel)
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        this.onError?.(event)
      }
      // If interrupted during play, we may need to resume
      if (this.state.isPlaying && event.error === 'interrupted') {
        this.pendingResume = true
      }
    }

    this.state.currentUtterance = utterance
    this.onSentenceChange?.(currentSentenceIndex)
    speechSynthesis.speak(utterance)
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
