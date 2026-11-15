import { useCallback, useEffect, useRef, useState } from 'react';

interface NarrationOptions {
  text: string;
  onComplete?: () => void;
}

export function useNarration({ text, onComplete }: NarrationOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const hasUnlockedRef = useRef(false);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' && 'speechSynthesis' in window;
    setSupported(supported);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const splitIntoSentences = useCallback((input: string): string[] => {
    return input
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, []);

  const playChunk = useCallback(
    (index: number) => {
      if (index >= chunksRef.current.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setSpokenText('');
        onComplete?.();
        return;
      }

      chunkIndexRef.current = index;
      const utterance = new SpeechSynthesisUtterance(chunksRef.current[index]);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        setSpokenText((prev) => (prev ? prev + ' ' : '') + chunksRef.current[index]);
        playChunk(index + 1);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setIsPaused(false);
    },
    [onComplete]
  );

  const play = useCallback(() => {
    if (!supported) return;

    if (!hasUnlockedRef.current) {
      const silent = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(silent);
      hasUnlockedRef.current = true;
    }

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setSpokenText('');
    chunksRef.current = splitIntoSentences(text);
    chunkIndexRef.current = 0;
    playChunk(0);
  }, [supported, isPaused, text, splitIntoSentences, playChunk]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  }, [supported]);

  const replay = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsPaused(false);
    setSpokenText('');
    chunksRef.current = splitIntoSentences(text);
    chunkIndexRef.current = 0;
    playChunk(0);
  }, [supported, text, splitIntoSentences, playChunk]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setSpokenText('');
  }, [supported]);

  return { isPlaying, isPaused, spokenText, supported, play, pause, replay, stop };
}
