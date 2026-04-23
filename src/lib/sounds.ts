/**
 * Fluxo Sound Engine — Web Audio API
 * All sounds are generated programmatically (no audio files needed).
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
  delay = 0
): void {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.connect(gain)
  gain.connect(audioCtx.destination)

  osc.type = type
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime + delay)

  gain.gain.setValueAtTime(0, audioCtx.currentTime + delay)
  gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + delay + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration)

  osc.start(audioCtx.currentTime + delay)
  osc.stop(audioCtx.currentTime + delay + duration + 0.05)
}

/** Soft pop — task card clicked / UI interaction */
export function playPop(): void {
  playTone(600, 0.08, 'sine', 0.15)
}

/** Whoosh chord — task moved to next stage */
export function playMove(): void {
  playTone(440, 0.12, 'sine', 0.2)
  playTone(554, 0.15, 'sine', 0.15, 0.05)
  playTone(659, 0.18, 'sine', 0.12, 0.10)
}

/** Bright ding — task created */
export function playCreate(): void {
  playTone(880, 0.10, 'triangle', 0.2)
  playTone(1100, 0.12, 'triangle', 0.15, 0.06)
}

/** Victory fanfare — task reaches Publish */
export function playVictory(): void {
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    playTone(freq, 0.22, 'triangle', 0.25, i * 0.12)
  })
  // final chord
  playTone(523, 0.5, 'sine', 0.15, notes.length * 0.12)
  playTone(659, 0.5, 'sine', 0.12, notes.length * 0.12)
  playTone(784, 0.5, 'sine', 0.10, notes.length * 0.12)
}

/** Gentle chime — celebration for stage owner arrival */
export function playCelebration(): void {
  playTone(784, 0.2,  'triangle', 0.2)
  playTone(988, 0.2,  'triangle', 0.18, 0.15)
  playTone(1175, 0.3, 'triangle', 0.15, 0.30)
}

/** Error buzz */
export function playError(): void {
  playTone(220, 0.15, 'sawtooth', 0.2)
  playTone(180, 0.15, 'sawtooth', 0.2, 0.12)
}
