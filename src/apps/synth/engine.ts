// Engine de áudio do Synth Studio.
// Encapsula AudioContext, grafo de nós, vozes polifônicas, drums sintetizados
// e o sequenciador com agendamento lookahead (padrão Chris Wilson).

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle'

export interface SynthParams {
  osc1Wave: Waveform
  osc2Wave: Waveform
  /** Detune do osc2 em cents (−100..+100) */
  osc2Detune: number
  /** Mistura osc1/osc2 (0 = só osc1, 1 = só osc2) */
  osc2Mix: number
  attack: number
  decay: number
  sustain: number
  release: number
  /** Frequência de corte do lowpass em Hz */
  cutoff: number
  /** Ressonância (Q) do filtro */
  resonance: number
  delayTime: number
  delayFeedback: number
  /** Envio para o delay (0..1) */
  delayMix: number
  masterVolume: number
}

export const DEFAULT_PARAMS: SynthParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'square',
  osc2Detune: 7,
  osc2Mix: 0.35,
  attack: 0.01,
  decay: 0.18,
  sustain: 0.65,
  release: 0.35,
  cutoff: 5200,
  resonance: 1,
  delayTime: 0.28,
  delayFeedback: 0.35,
  delayMix: 0.2,
  masterVolume: 0.8,
}

export const NUM_STEPS = 16
export const NUM_TRACKS = 4
export const BASS_MIDI = 36 // C2

const MAX_VOICES = 16
const VOICE_PEAK = 0.4
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function createEmptyPattern(): boolean[][] {
  return Array.from({ length: NUM_TRACKS }, () => Array.from({ length: NUM_STEPS }, () => false))
}

export function createDemoPattern(): boolean[][] {
  const pattern = createEmptyPattern()
  const set = (track: number, steps: number[]): void => {
    const row = pattern[track]
    for (const s of steps) row[s] = true
  }
  set(0, [0, 4, 8, 12]) // bumbo: quatro no chão
  set(1, [4, 12]) // caixa: backbeat
  set(2, [2, 6, 10, 14, 15]) // chimbal: contratempos
  set(3, [0, 3, 6, 10, 12, 14]) // baixo sincopado
  return pattern
}

interface Voice {
  midi: number
  osc1: OscillatorNode
  osc2: OscillatorNode
  env: GainNode
  startedAt: number
  released: boolean
}

export class SynthEngine {
  private ctx: AudioContext | null = null
  private voiceBus!: GainNode
  private filter!: BiquadFilterNode
  private delay!: DelayNode
  private delayFeedback!: GainNode
  private delaySend!: GainNode
  private drumBus!: GainNode
  private master!: GainNode
  private limiter!: DynamicsCompressorNode
  private analyser: AnalyserNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private voices: Voice[] = []
  private params: SynthParams = { ...DEFAULT_PARAMS }

  private pattern: boolean[][] = createEmptyPattern()
  private bpm = 120
  private timer: number | null = null
  private nextNoteTime = 0
  private currentStep = 0
  private stepTimeouts = new Set<number>()

  /** Chamado quando o sequenciador entra em um passo (−1 = parado). */
  onStep: ((step: number) => void) | null = null

  get isActive(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  get playing(): boolean {
    return this.timer !== null
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  /**
   * Cria/resume o AudioContext. Deve ser chamado a partir de um gesto do
   * usuário. Retorna false se Web Audio não estiver disponível.
   */
  ensureContext(): boolean {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return false
      try {
        const ctx = new AudioContext()
        this.ctx = ctx
        this.buildGraph(ctx)
      } catch {
        this.ctx = null
        return false
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined)
    }
    return true
  }

  private buildGraph(ctx: AudioContext): void {
    const p = this.params
    this.voiceBus = ctx.createGain()
    this.voiceBus.gain.value = 0.5

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = p.cutoff
    this.filter.Q.value = p.resonance

    this.delay = ctx.createDelay(1)
    this.delay.delayTime.value = p.delayTime
    this.delayFeedback = ctx.createGain()
    this.delayFeedback.gain.value = p.delayFeedback
    this.delaySend = ctx.createGain()
    this.delaySend.gain.value = p.delayMix

    this.drumBus = ctx.createGain()
    this.drumBus.gain.value = 0.9

    this.master = ctx.createGain()
    this.master.gain.value = p.masterVolume

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -6
    this.limiter.knee.value = 4
    this.limiter.ratio.value = 8
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048

    this.voiceBus.connect(this.filter)
    this.filter.connect(this.master)
    this.filter.connect(this.delaySend)
    this.delaySend.connect(this.delay)
    this.delay.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delay)
    this.delay.connect(this.master)
    this.drumBus.connect(this.master)
    this.master.connect(this.analyser)
    this.analyser.connect(this.limiter)
    this.limiter.connect(ctx.destination)
  }

  // ── Parâmetros ────────────────────────────────────────────────────────────

  updateParams(p: SynthParams): void {
    this.params = p
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    this.filter.frequency.setTargetAtTime(p.cutoff, now, 0.02)
    this.filter.Q.setTargetAtTime(p.resonance, now, 0.02)
    this.delay.delayTime.setTargetAtTime(p.delayTime, now, 0.05)
    this.delayFeedback.gain.setTargetAtTime(p.delayFeedback, now, 0.02)
    this.delaySend.gain.setTargetAtTime(p.delayMix, now, 0.02)
    this.master.gain.setTargetAtTime(p.masterVolume, now, 0.02)
  }

  // ── Vozes do sintetizador ─────────────────────────────────────────────────

  noteOn(midi: number): void {
    if (!this.ensureContext() || !this.ctx) return
    this.startVoice(midi, this.ctx.currentTime)
  }

  noteOff(midi: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (const v of this.voices) {
      if (v.midi === midi && !v.released) this.releaseVoice(v, now)
    }
  }

  releaseAll(): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (const v of this.voices) {
      if (!v.released) this.releaseVoice(v, now)
    }
  }

  private startVoice(midi: number, time: number, gateDur?: number): void {
    const ctx = this.ctx
    if (!ctx) return
    this.stealOldestIfNeeded(ctx.currentTime)
    const p = this.params
    const freq = midiToFreq(midi)

    const osc1 = ctx.createOscillator()
    osc1.type = p.osc1Wave
    osc1.frequency.value = freq

    const osc2 = ctx.createOscillator()
    osc2.type = p.osc2Wave
    osc2.frequency.value = freq
    osc2.detune.value = p.osc2Detune

    const g1 = ctx.createGain()
    g1.gain.value = 1 - p.osc2Mix
    const g2 = ctx.createGain()
    g2.gain.value = p.osc2Mix

    const env = ctx.createGain()
    env.gain.value = 0

    osc1.connect(g1)
    g1.connect(env)
    osc2.connect(g2)
    g2.connect(env)
    env.connect(this.voiceBus)

    const attack = Math.max(0.003, p.attack)
    const decay = Math.max(0.01, p.decay)
    const sustainLevel = Math.max(0.0001, p.sustain * VOICE_PEAK)
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(VOICE_PEAK, time + attack)
    env.gain.setTargetAtTime(sustainLevel, time + attack, decay / 3)

    osc1.start(time)
    osc2.start(time)

    const voice: Voice = { midi, osc1, osc2, env, startedAt: time, released: false }
    osc1.onended = () => {
      this.voices = this.voices.filter(v => v !== voice)
      try {
        osc1.disconnect()
        osc2.disconnect()
        g1.disconnect()
        g2.disconnect()
        env.disconnect()
      } catch {
        // nós já desconectados
      }
    }
    this.voices.push(voice)

    if (gateDur !== undefined) {
      // Nota agendada (sequenciador): release determinístico no futuro.
      voice.released = true
      const release = Math.max(0.02, p.release)
      const offTime = time + gateDur
      env.gain.setTargetAtTime(0.0001, offTime, release / 4)
      osc1.stop(offTime + release + 0.15)
      osc2.stop(offTime + release + 0.15)
    }
  }

  private releaseVoice(voice: Voice, now: number): void {
    voice.released = true
    const release = Math.max(0.02, this.params.release)
    try {
      const g = voice.env.gain
      g.cancelScheduledValues(now)
      g.setValueAtTime(Math.max(g.value, 0.0001), now)
      g.exponentialRampToValueAtTime(0.0001, now + release)
      voice.osc1.stop(now + release + 0.1)
      voice.osc2.stop(now + release + 0.1)
    } catch {
      // voz já encerrada
    }
  }

  private stealOldestIfNeeded(now: number): void {
    if (this.voices.length < MAX_VOICES) return
    let oldest: Voice | null = null
    for (const v of this.voices) {
      if (oldest === null || v.startedAt < oldest.startedAt) oldest = v
    }
    if (!oldest) return
    oldest.released = true
    try {
      const g = oldest.env.gain
      g.cancelScheduledValues(now)
      g.setValueAtTime(Math.max(g.value, 0.0001), now)
      g.exponentialRampToValueAtTime(0.0001, now + 0.02)
      oldest.osc1.stop(now + 0.06)
      oldest.osc2.stop(now + 0.06)
    } catch {
      // voz já encerrada
    }
  }

  // ── Drums sintetizados ────────────────────────────────────────────────────

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5)
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    return this.noiseBuffer
  }

  private playKick(time: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(1, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35)
    osc.connect(gain)
    gain.connect(this.drumBus)
    osc.start(time)
    osc.stop(time + 0.4)
    osc.onended = () => {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        // já desconectado
      }
    }
  }

  private playNoiseHit(time: number, filterType: BiquadFilterType, freq: number, peak: number, decay: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const source = ctx.createBufferSource()
    source.buffer = this.getNoiseBuffer(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = freq
    filter.Q.value = filterType === 'bandpass' ? 0.9 : 0.7
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(peak, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.drumBus)
    source.start(time)
    source.stop(time + decay + 0.05)
    source.onended = () => {
      try {
        source.disconnect()
        filter.disconnect()
        gain.disconnect()
      } catch {
        // já desconectado
      }
    }
  }

  private playSnare(time: number): void {
    this.playNoiseHit(time, 'bandpass', 1800, 0.7, 0.18)
  }

  private playHat(time: number): void {
    this.playNoiseHit(time, 'highpass', 7500, 0.4, 0.05)
  }

  // ── Sequenciador (lookahead scheduling) ───────────────────────────────────

  setPattern(pattern: boolean[][]): void {
    this.pattern = pattern
  }

  setBpm(bpm: number): void {
    this.bpm = Math.min(180, Math.max(60, bpm))
  }

  startSequencer(): boolean {
    if (this.timer !== null) return true
    if (!this.ensureContext() || !this.ctx) return false
    this.currentStep = 0
    this.nextNoteTime = this.ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS)
    return true
  }

  stopSequencer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    for (const handle of this.stepTimeouts) window.clearTimeout(handle)
    this.stepTimeouts.clear()
    if (this.onStep) this.onStep(-1)
  }

  private scheduler(): void {
    const ctx = this.ctx
    if (!ctx) return
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleStep(this.currentStep, this.nextNoteTime)
      this.nextNoteTime += 60 / this.bpm / 4
      this.currentStep = (this.currentStep + 1) % NUM_STEPS
    }
  }

  private scheduleStep(step: number, time: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const isOn = (track: number): boolean => this.pattern[track]?.[step] === true
    if (isOn(0)) this.playKick(time)
    if (isOn(1)) this.playSnare(time)
    if (isOn(2)) this.playHat(time)
    if (isOn(3)) this.startVoice(BASS_MIDI, time, (60 / this.bpm / 4) * 0.85)

    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000)
    const handle = window.setTimeout(() => {
      this.stepTimeouts.delete(handle)
      if (this.onStep) this.onStep(step)
    }, delayMs)
    this.stepTimeouts.add(handle)
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  dispose(): void {
    this.stopSequencer()
    this.onStep = null
    const ctx = this.ctx
    if (ctx) {
      for (const v of [...this.voices]) {
        try {
          v.osc1.stop()
          v.osc2.stop()
        } catch {
          // voz já encerrada
        }
      }
      this.voices = []
      void ctx.close().catch(() => undefined)
    }
    this.ctx = null
    this.analyser = null
    this.noiseBuffer = null
  }
}
