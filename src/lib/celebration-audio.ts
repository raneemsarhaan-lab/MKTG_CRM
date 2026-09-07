// Celebration audio — constitution.md §V, spec.md FR-018, FR-019.
//
// Primary path plays the recorded assets in public/sounds/, named in
// CRM_Labels_Reference.xlsx. The Web Audio synthesis below is retained as a
// fallback for when a file cannot be decoded or fetched — losing the sound
// entirely is worse than an approximation of it.
//
// Audio only ever plays off a user gesture (advancing a task).

import { REACTION_BY_KEY, type ReactionKey } from '@/lib/celebrations'

type Reaction = ReactionKey

/** Hard ceiling on how long any celebration sound may play, recorded or synthesized. */
const MAX_DURATION_MS = 3000

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

type SynthNode = OscillatorNode | AudioBufferSourceNode

// zaghrota: rapid LFO oscillation on a bright sine, ~500ms
function playZaghrota(ctx: AudioContext, nodes: SynthNode[]) {
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
  nodes.push(osc, lfo)
}

// tasqeef: 4 rhythmic clap pulses on sawtooth, ~800ms
function playTasqeef(ctx: AudioContext, nodes: SynthNode[]) {
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
    nodes.push(osc)
  }
}

// mabhour: ascending arpeggio C5→E5→G5 on triangle, ~600ms
function playMabhour(ctx: AudioContext, nodes: SynthNode[]) {
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
    nodes.push(osc)
  })
}

// tabla: low-freq noise burst through bandpass, ~700ms
function playTabla(ctx: AudioContext, nodes: SynthNode[]) {
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
  nodes.push(source)
}

const PLAYERS: Record<Reaction, (ctx: AudioContext, nodes: SynthNode[]) => void> = {
  zaghrota: playZaghrota,
  tasqeef:  playTasqeef,
  mabhour:  playMabhour,
  tabla:    playTabla,
}

/** Last element created, so a new celebration can cut off the previous one. */
let current: HTMLAudioElement | null = null
/** Oscillators/buffer sources from the active synthesized fallback, so they can be cut off early. */
let currentSynthNodes: SynthNode[] = []
/** Enforces MAX_DURATION_MS on whichever source is currently playing. */
let stopTimer: ReturnType<typeof setTimeout> | null = null

function clearStopTimer(): void {
  if (stopTimer !== null) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
}

/** Immediately silences any celebration sound in progress — recorded or synthesized. */
export function stopCelebrationSound(): void {
  clearStopTimer()

  current?.pause()
  current = null

  for (const node of currentSynthNodes) {
    try { node.stop() } catch { /* already stopped */ }
  }
  currentSynthNodes = []
}

function playSynthesized(reaction: Reaction): void {
  const ctx = getAudioCtx()
  if (!ctx) return
  const nodes: SynthNode[] = []
  const run = () => {
    PLAYERS[reaction](ctx, nodes)
    currentSynthNodes = nodes
    stopTimer = setTimeout(stopCelebrationSound, MAX_DURATION_MS)
  }
  if (ctx.state === 'running') {
    run()
  } else {
    ctx.resume().then(run).catch(() => undefined)
  }
}

/**
 * Play the recorded asset for a reaction, trying each candidate source in
 * order and falling back to synthesis if none can play.
 *
 * mabhour ships as QuickTime, which only Safari reliably decodes, so the
 * sources list offers an MP4 of the same asset first.
 */
export function playCelebrationSound(reaction: Reaction): void {
  if (typeof window === 'undefined') return

  stopCelebrationSound()

  const sources = REACTION_BY_KEY[reaction]?.sources ?? []
  if (sources.length === 0) { playSynthesized(reaction); return }

  let index = 0
  const el = new Audio()
  current = el
  el.preload = 'auto'

  const tryNext = () => {
    if (index >= sources.length) { playSynthesized(reaction); return }
    el.src = sources[index++]
    el.play()
      .then(() => { stopTimer = setTimeout(stopCelebrationSound, MAX_DURATION_MS) })
      .catch(tryNext)
  }

  // A source that fetches but cannot decode fires 'error' rather than
  // rejecting play(), so both routes advance to the next candidate.
  el.addEventListener('error', tryNext)
  tryNext()
}
