/**
 * Fluxo Sound Engine — Web Audio API
 * All sounds are generated programmatically (no audio files needed).
 */

let ctx: AudioContext | null = null

export function getCtx(): AudioContext {
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    ctx = new AC()
  }
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

/** زغروطة — vibrato sine wave */
export function playZaghrota(): void {
  const audioCtx = getCtx()
  const now = audioCtx.currentTime
  const duration = 1.5
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  const lfo = audioCtx.createOscillator()
  const lfoGain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(900, now)
  lfo.type = 'square'
  lfo.frequency.setValueAtTime(15, now)
  lfoGain.gain.setValueAtTime(200, now)
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.3, now + 0.1)
  gain.gain.linearRampToValueAtTime(0.3, now + duration - 0.2)
  gain.gain.linearRampToValueAtTime(0, now + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  lfo.start(now); osc.start(now)
  lfo.stop(now + duration); osc.stop(now + duration)
}

/** تسقيف — rhythmic clapping noise */
export function playTasqeef(): void {
  const audioCtx = getCtx()
  const now = audioCtx.currentTime
  const hits = 8, duration = 0.08, gap = 0.12
  for (let i = 0; i < hits; i++) {
    const time = now + i * (duration + gap)
    const bufferSize = Math.floor(audioCtx.sampleRate * duration)
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1
    const noise = audioCtx.createBufferSource()
    noise.buffer = buffer
    const filter = audioCtx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1200, time)
    filter.Q.setValueAtTime(0.5, time)
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(0.5, time)
    g.gain.exponentialRampToValueAtTime(0.01, time + duration)
    noise.connect(filter); filter.connect(g); g.connect(audioCtx.destination)
    noise.start(time)
  }
}

/** انا مبهور بيا — rising sawtooth arpeggio */
export function playMabhour(): void {
  const audioCtx = getCtx()
  const now = audioCtx.currentTime
  const notes = [261.63, 329.63, 392.00, 523.25]
  const stagger = 0.1
  notes.forEach((freq, i) => {
    playTone(freq, 0.15, 'sawtooth', 0.2, i * stagger)
  })
  playTone(523.25, 1.0, 'sawtooth', 0.3, notes.length * stagger)
}

/** طبلة — tabla drum pattern */
export function playTabla(): void {
  const audioCtx = getCtx()
  const now = audioCtx.currentTime
  const pattern = [
    { type: 'dum', time: 0 }, { type: 'tak', time: 0.15 }, { type: 'tak', time: 0.3 },
    { type: 'dum', time: 0.45 }, { type: 'tak', time: 0.6 }, { type: 'tak', time: 0.75 },
    { type: 'dum', time: 0.9 },
  ]
  pattern.forEach(hit => {
    if (hit.type === 'dum') {
      const osc = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, now + hit.time)
      osc.frequency.exponentialRampToValueAtTime(40, now + hit.time + 0.2)
      g.gain.setValueAtTime(0.6, now + hit.time)
      g.gain.exponentialRampToValueAtTime(0.01, now + hit.time + 0.2)
      osc.connect(g); g.connect(audioCtx.destination)
      osc.start(now + hit.time); osc.stop(now + hit.time + 0.2)
    } else {
      const osc = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      const f = audioCtx.createBiquadFilter()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(900, now + hit.time)
      f.type = 'bandpass'
      f.frequency.setValueAtTime(900, now + hit.time)
      f.Q.setValueAtTime(5, now + hit.time)
      g.gain.setValueAtTime(0.4, now + hit.time)
      g.gain.exponentialRampToValueAtTime(0.01, now + hit.time + 0.1)
      osc.connect(f); f.connect(g); g.connect(audioCtx.destination)
      osc.start(now + hit.time); osc.stop(now + hit.time + 0.1)
    }
  })
}
