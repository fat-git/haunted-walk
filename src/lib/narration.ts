/**
 * Narration engine using Web Speech API (speechSynthesis).
 *
 * Handles sentence-level chunking, index tracking for reliable resume,
 * async voice loading on iOS, and playback controls.
 */

export interface NarrationSentence {
  text: string
  startChar: number
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
 * Split text into sentences for granular playback control.
 * Uses a simple regex that handles common sentence boundaries.
 */
export function splitIntoSentences(text: string): NarrationSentence[] {
  // Match sentences ending with . ! ? followed by space or end of string
  // This regex captures the sentence including the punctuation
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s|$)/g
  const sentences: NarrationSentence[] = []
  let match: RegExpExecArray | null
  let charIndex = 0

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentenceText = match[0].trim()
    if (sentenceText.length > 0) {
      sentences.push({
        text: sentenceText,
        startChar: charIndex,
        endChar: charIndex + sentenceText.length,
      })
      charIndex += match[0].length
    }
  }

  // If no sentences found (edge case), treat entire text as one sentence
  if (sentences.length === 0 && text.trim().length > 0) {
    sentences.push({
      text: text.trim(),
      startChar: 0,
      endChar: text.trim().length,
    })
  }

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
