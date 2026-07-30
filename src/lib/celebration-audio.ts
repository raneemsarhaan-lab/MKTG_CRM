// Web Audio API synthesis for celebration reactions
// constitution.md §V — 4 named reactions; audio plays on user interaction only
// spec.md FR-018, FR-019

type Reaction = 'zaghrota' | 'tasqeef' | 'mabhour' | 'tabla'

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

// zaghrota: rapid LFO oscillation on a bright sine, ~500ms
function playZaghrota(ctx: AudioContext) {
  const osc = ctx.createOscillator()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(28, ctx.currentTime)
  lfoGain.gain.setValueAtTime(220, ctx.currentTime)

  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02)
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.44)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)

  osc.connect(gain)
  gain.connect(ctx.destination)

  lfo.start()
  osc.start()
  osc.stop(ctx.currentTime + 0.5)
  lfo.stop(ctx.currentTime + 0.5)
}

// tasqeef: 4 rhythmic clap pulses on sawtooth, ~800ms
function playTasqeef(ctx: AudioContext) {
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime + i * 0.2

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(260 + i * 30, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.35, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.15)
  }
}

// mabhour: ascending arpeggio C5→E5→G5 on triangle, ~600ms
function playMabhour(ctx: AudioContext) {
  const notes = [523.25, 659.25, 783.99]   // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime + i * 0.2

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.4, t + 0.02)
    gain.gain.linearRampToValueAtTime(0.3, t + 0.14)
    gain.gain.linearRampToValueAtTime(0, t + 0.2)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.21)
  })
}

// tabla: low-freq noise burst through bandpass, ~700ms
function playTabla(ctx: AudioContext) {
  const bufferSize = ctx.sampleRate * 0.7
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const bpf = ctx.createBiquadFilter()
  bpf.type = 'bandpass'
  bpf.frequency.setValueAtTime(180, ctx.currentTime)
  bpf.Q.setValueAtTime(3, ctx.currentTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)

  source.connect(bpf)
  bpf.connect(gain)
  gain.connect(ctx.destination)
  source.start()
}

const PLAYERS: Record<Reaction, (ctx: AudioContext) => void> = {
  zaghrota: playZaghrota,
  tasqeef:  playTasqeef,
  mabhour:  playMabhour,
  tabla:    playTabla,
}

export function playCelebrationSound(reaction: Reaction): void {
  const ctx = getAudioCtx()
  if (!ctx) return
  // Resume context if suspended (browser autoplay policy)
  const run = () => PLAYERS[reaction](ctx)
  if (ctx.state === 'running') {
    run()
  } else {
    ctx.resume().then(run).catch(() => undefined)
  }
}
