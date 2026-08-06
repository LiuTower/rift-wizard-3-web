/**
 * Procedural sound engine.
 *
 * Every effect is synthesised on the fly out of oscillators, one white-noise
 * buffer, envelopes and filters — the game ships no audio assets. Everything is
 * guarded: if WebAudio is missing, blocked or throws, the engine degrades to
 * silence rather than taking the game down with it.
 */

export type SfxName = 'move' | 'cast_sorcery' | 'cast_conjuration' | 'cast_enchantment'
  | 'hit_physical' | 'hit_fire' | 'hit_lightning' | 'hit_ice' | 'hit_dark' | 'hit_holy'
  | 'hit_arcane' | 'hit_poison' | 'death_small' | 'death_big' | 'block' | 'heal'
  | 'pickup' | 'portal' | 'levelup' | 'ui_click' | 'ui_open' | 'ui_error'
  | 'player_hurt' | 'win' | 'lose'

// ------------------------------------------------------------------ engine state

const MUTE_KEY = 'rw3web.muted'
/** hard ceiling on voices scheduled at once, so a big turn cannot melt the mix */
const MAX_VOICES = 24
/** identical sounds fired inside this window (seconds) collapse */
const DUP_WINDOW = 0.06
const DUP_MAX = 4
/** ring of recent triggers; 32 slots comfortably outlives a 60ms window */
const RECENT_SLOTS = 32

type AudioCtor = new () => AudioContext
interface Rig { c: AudioContext; out: GainNode; noise: AudioBuffer }

let rig: Rig | undefined
/** set once construction fails, so we stop retrying every single play */
let broken = false
let vol = 0.7
let mutedFlag = false
try { mutedFlag = localStorage.getItem(MUTE_KEY) === '1' } catch { /* no storage, start unmuted */ }

/** end times of scheduled voices; compacted in place, never reallocated */
const voiceEnds: number[] = []
const recentName = new Array<SfxName | undefined>(RECENT_SLOTS).fill(undefined)
const recentTime = new Float64Array(RECENT_SLOTS)
let recentHead = 0

function ensure(): Rig | undefined {
  if (rig) return rig
  if (broken) return undefined
  try {
    const host = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const Ctor = host.AudioContext ?? host.webkitAudioContext
    if (!Ctor) { broken = true; return undefined }
    const c = new Ctor()
    const out = c.createGain()
    out.gain.value = mutedFlag ? 0 : vol
    out.connect(c.destination)
    rig = { c, out, noise: makeNoise(c) }
    return rig
  } catch { broken = true; return undefined }
}

function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * 0.6))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Reserve a slot in the global voice budget. */
function claim(end: number, now: number): boolean {
  let n = 0
  for (let i = 0; i < voiceEnds.length; i++) if (voiceEnds[i] > now) voiceEnds[n++] = voiceEnds[i]
  voiceEnds.length = n
  if (n >= MAX_VOICES) return false
  voiceEnds.push(end)
  return true
}

/** Per-name rate limit: at most DUP_MAX copies inside DUP_WINDOW. */
function allow(name: SfxName, now: number): boolean {
  let dup = 0
  for (let i = 0; i < RECENT_SLOTS; i++) {
    if (recentName[i] === name && now - recentTime[i] < DUP_WINDOW) dup++
  }
  if (dup >= DUP_MAX) return false
  recentName[recentHead] = name
  recentTime[recentHead] = now
  recentHead = recentHead + 1 === RECENT_SLOTS ? 0 : recentHead + 1
  return true
}

// ------------------------------------------------------------------- primitives

interface FilterSpec {
  type: BiquadFilterType
  /** cutoff / centre at note start */
  f: number
  /** cutoff glide target, reached at the end of the note */
  f2?: number
  q?: number
}

/** Fields every voice shares: when it starts, how loud, and its A/H/D shape. */
interface EnvSpec {
  /** start offset from the sound's origin, seconds */
  at?: number
  attack?: number
  hold?: number
  decay?: number
  gain?: number
  filter?: FilterSpec
}

interface ToneSpec extends EnvSpec {
  type?: OscillatorType
  f: number
  /** pitch glide target, reached as the voice dies */
  f2?: number
  /** fixed detune in cents, on top of the caller's detune */
  detune?: number
  /** ring-modulator frequency; omitted = dry */
  ring?: number
}

interface NoiseSpec extends EnvSpec {
  /** playback rate multiplier, tilts the noise colour */
  rate?: number
}

/** Attack / hold / exponential decay. Never starts or ends on a discontinuity. */
function shape(p: AudioParam, t: number, peak: number, a: number, h: number, d: number): void {
  const top = Math.max(0.0005, peak)
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(top, t + a)
  if (h > 0) p.setValueAtTime(top, t + a + h)
  p.exponentialRampToValueAtTime(top * 0.001, t + a + h + d)
  p.setValueAtTime(0, t + a + h + d + 0.002)
}

function filterNode(r: Rig, spec: FilterSpec, t: number, end: number): BiquadFilterNode {
  const bq = r.c.createBiquadFilter()
  bq.type = spec.type
  bq.Q.value = spec.q ?? 1
  bq.frequency.setValueAtTime(Math.max(20, spec.f), t)
  if (spec.f2 !== undefined) bq.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), end)
  return bq
}

/** carrier * sine(freq): the metallic, "not quite of this world" arcane texture. */
function ringMod(r: Rig, src: AudioNode, freq: number, t: number, end: number): AudioNode {
  const cell = r.c.createGain()
  cell.gain.value = 0
  const mod = r.c.createOscillator()
  mod.type = 'sine'
  mod.frequency.setValueAtTime(freq, t)
  mod.connect(cell.gain)
  mod.start(t)
  mod.stop(end + 0.01)
  src.connect(cell)
  return cell
}

function tone(r: Rig, s: ToneSpec, t0: number, v: number, det: number): void {
  const a = s.attack ?? 0.004, h = s.hold ?? 0, d = s.decay ?? 0.1
  const t = t0 + (s.at ?? 0)
  const end = t + a + h + d
  if (!claim(end, r.c.currentTime)) return
  const osc = r.c.createOscillator()
  osc.type = s.type ?? 'sine'
  osc.detune.value = (s.detune ?? 0) + det
  osc.frequency.setValueAtTime(Math.max(20, s.f), t)
  if (s.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.f2), end)
  const g = r.c.createGain()
  shape(g.gain, t, (s.gain ?? 0.16) * v, a, h, d)
  const head: AudioNode = s.ring === undefined ? osc : ringMod(r, osc, s.ring, t, end)
  if (s.filter) { const bq = filterNode(r, s.filter, t, end); head.connect(bq); bq.connect(g) } else head.connect(g)
  g.connect(r.out)
  osc.start(t)
  osc.stop(end + 0.02)
}

function hiss(r: Rig, s: NoiseSpec, t0: number, v: number, det: number): void {
  const a = s.attack ?? 0.003, h = s.hold ?? 0, d = s.decay ?? 0.1
  const t = t0 + (s.at ?? 0)
  const end = t + a + h + d
  if (!claim(end, r.c.currentTime)) return
  const src = r.c.createBufferSource()
  src.buffer = r.noise
  src.loop = true
  src.playbackRate.value = (s.rate ?? 1) * Math.pow(2, det / 1200)
  const g = r.c.createGain()
  shape(g.gain, t, (s.gain ?? 0.12) * v, a, h, d)
  if (s.filter) { const bq = filterNode(r, s.filter, t, end); src.connect(bq); bq.connect(g) } else src.connect(g)
  g.connect(r.out)
  src.start(t, Math.random() * 0.4)
  src.stop(end + 0.02)
}

/** Staggered notes sharing one voice shape — arpeggios and chords. */
function arp(r: Rig, freqs: readonly number[], step: number, s: Omit<ToneSpec, 'f'>, t0: number, v: number, det: number): void {
  const base = s.at ?? 0
  for (let i = 0; i < freqs.length; i++) tone(r, { ...s, f: freqs[i], at: base + i * step }, t0, v, det)
}

// ----------------------------------------------------------------- sound design

function render(r: Rig, name: SfxName, t: number, v: number, det: number): void {
  switch (name) {
    case 'move':
      tone(r, { f: 190, f2: 120, decay: 0.06, gain: 0.13 }, t, v, det)
      hiss(r, { decay: 0.04, gain: 0.05, filter: { type: 'lowpass', f: 700 } }, t, v, det)
      return
    case 'cast_sorcery':
      tone(r, { type: 'sawtooth', f: 320, f2: 980, decay: 0.22, gain: 0.16, filter: { type: 'lowpass', f: 700, f2: 4200, q: 5 } }, t, v, det)
      tone(r, { f: 1200, f2: 2400, at: 0.02, decay: 0.18, gain: 0.06 }, t, v, det)
      return
    case 'cast_conjuration':
      tone(r, { type: 'triangle', f: 165, f2: 330, attack: 0.03, decay: 0.3, gain: 0.14 }, t, v, det)
      tone(r, { type: 'triangle', f: 247, f2: 494, at: 0.03, attack: 0.03, decay: 0.3, gain: 0.1 }, t, v, det)
      hiss(r, { decay: 0.25, gain: 0.05, filter: { type: 'lowpass', f: 600 } }, t, v, det)
      return
    case 'cast_enchantment':
      // two near-unison sines beat against each other: a shimmer, not a note
      tone(r, { f: 880, attack: 0.02, hold: 0.05, decay: 0.24, gain: 0.1 }, t, v, det)
      tone(r, { f: 894, attack: 0.02, hold: 0.05, decay: 0.24, gain: 0.09 }, t, v, det)
      tone(r, { f: 1760, at: 0.04, decay: 0.2, gain: 0.05 }, t, v, det)
      return
    case 'hit_physical':
      hiss(r, { decay: 0.09, gain: 0.2, filter: { type: 'bandpass', f: 1200, q: 1.5 } }, t, v, det)
      tone(r, { f: 130, f2: 65, decay: 0.12, gain: 0.18 }, t, v, det)
      return
    case 'hit_fire':
      hiss(r, { decay: 0.3, gain: 0.22, filter: { type: 'lowpass', f: 2400, f2: 320 } }, t, v, det)
      hiss(r, { at: 0.05, decay: 0.07, gain: 0.08, filter: { type: 'highpass', f: 3000 } }, t, v, det)
      tone(r, { f: 92, f2: 60, decay: 0.2, gain: 0.08 }, t, v, det)
      return
    case 'hit_lightning':
      tone(r, { type: 'sawtooth', f: 2600, f2: 260, decay: 0.13, gain: 0.16, filter: { type: 'highpass', f: 700 } }, t, v, det)
      hiss(r, { decay: 0.05, gain: 0.12, filter: { type: 'highpass', f: 4000 } }, t, v, det)
      tone(r, { type: 'square', f: 1300, f2: 200, at: 0.01, decay: 0.1, gain: 0.05 }, t, v, det)
      return
    case 'hit_ice':
      tone(r, { f: 2640, decay: 0.26, gain: 0.12 }, t, v, det)
      tone(r, { f: 3960, decay: 0.18, gain: 0.06 }, t, v, det)
      hiss(r, { decay: 0.07, gain: 0.09, filter: { type: 'bandpass', f: 5200, q: 10 } }, t, v, det)
      return
    case 'hit_dark':
      tone(r, { type: 'sawtooth', f: 92, detune: -14, decay: 0.32, gain: 0.16, filter: { type: 'lowpass', f: 480 } }, t, v, det)
      tone(r, { type: 'sawtooth', f: 97, detune: 16, decay: 0.3, gain: 0.13, filter: { type: 'lowpass', f: 520 } }, t, v, det)
      tone(r, { f: 184, decay: 0.18, gain: 0.06 }, t, v, det)
      return
    case 'hit_holy':
      // inharmonic partials, struck-bell style
      tone(r, { f: 660, decay: 0.34, gain: 0.12 }, t, v, det)
      tone(r, { f: 1330, decay: 0.26, gain: 0.07 }, t, v, det)
      tone(r, { f: 1980, decay: 0.2, gain: 0.05 }, t, v, det)
      tone(r, { f: 2660, at: 0.01, decay: 0.14, gain: 0.03 }, t, v, det)
      return
    case 'hit_arcane':
      tone(r, { f: 520, f2: 920, ring: 145, decay: 0.28, gain: 0.18 }, t, v, det)
      tone(r, { f: 260, decay: 0.2, gain: 0.06 }, t, v, det)
      return
    case 'hit_poison':
      hiss(r, { decay: 0.3, gain: 0.14, filter: { type: 'lowpass', f: 420 } }, t, v, det)
      tone(r, { f: 150, f2: 260, decay: 0.09, gain: 0.1 }, t, v, det)
      tone(r, { f: 120, f2: 210, at: 0.11, decay: 0.09, gain: 0.09 }, t, v, det)
      tone(r, { f: 175, f2: 300, at: 0.21, decay: 0.09, gain: 0.07 }, t, v, det)
      return
    case 'death_small':
      tone(r, { type: 'sawtooth', f: 420, f2: 90, decay: 0.24, gain: 0.16, filter: { type: 'lowpass', f: 1800, f2: 400 } }, t, v, det)
      hiss(r, { decay: 0.18, gain: 0.1, filter: { type: 'lowpass', f: 900 } }, t, v, det)
      return
    case 'death_big':
      tone(r, { f: 90, f2: 34, attack: 0.008, decay: 0.7, gain: 0.24 }, t, v, det)
      hiss(r, { decay: 0.85, gain: 0.16, filter: { type: 'lowpass', f: 500, f2: 80 } }, t, v, det)
      arp(r, [220, 165, 110], 0.13, { type: 'sawtooth', at: 0.04, decay: 0.4, gain: 0.11, filter: { type: 'lowpass', f: 1100, f2: 300 } }, t, v, det)
      return
    case 'block':
      hiss(r, { decay: 0.09, gain: 0.18, filter: { type: 'bandpass', f: 3200, q: 8 } }, t, v, det)
      tone(r, { type: 'square', f: 1720, decay: 0.07, gain: 0.07 }, t, v, det)
      tone(r, { type: 'square', f: 2590, decay: 0.05, gain: 0.04 }, t, v, det)
      return
    case 'heal':
      arp(r, [523, 784, 1046], 0.07, { attack: 0.02, decay: 0.22, gain: 0.12 }, t, v, det)
      return
    case 'pickup':
      tone(r, { type: 'triangle', f: 880, decay: 0.06, gain: 0.14 }, t, v, det)
      tone(r, { type: 'triangle', f: 1320, at: 0.05, decay: 0.09, gain: 0.11 }, t, v, det)
      return
    case 'portal':
      tone(r, { f: 120, f2: 760, ring: 90, attack: 0.05, decay: 0.7, gain: 0.14 }, t, v, det)
      arp(r, [659, 880, 1109, 1319], 0.13, { at: 0.06, attack: 0.02, decay: 0.3, gain: 0.08 }, t, v, det)
      hiss(r, { decay: 0.75, gain: 0.07, filter: { type: 'bandpass', f: 600, f2: 4000, q: 3 } }, t, v, det)
      return
    case 'levelup':
      arp(r, [523, 659, 784, 1046], 0.09, { type: 'triangle', attack: 0.01, decay: 0.36, gain: 0.14 }, t, v, det)
      hiss(r, { at: 0.3, decay: 0.4, gain: 0.06, filter: { type: 'highpass', f: 4200 } }, t, v, det)
      return
    case 'ui_click':
      tone(r, { type: 'square', f: 780, decay: 0.035, gain: 0.09, filter: { type: 'highpass', f: 400 } }, t, v, det)
      return
    case 'ui_open':
      tone(r, { f: 300, f2: 640, decay: 0.16, gain: 0.11 }, t, v, det)
      hiss(r, { decay: 0.12, gain: 0.05, filter: { type: 'lowpass', f: 1200 } }, t, v, det)
      return
    case 'ui_error':
      tone(r, { type: 'square', f: 220, decay: 0.09, gain: 0.11, filter: { type: 'lowpass', f: 1200 } }, t, v, det)
      tone(r, { type: 'square', f: 233, at: 0.11, decay: 0.13, gain: 0.11, filter: { type: 'lowpass', f: 1100 } }, t, v, det)
      return
    case 'player_hurt':
      hiss(r, { decay: 0.22, gain: 0.2, filter: { type: 'lowpass', f: 1600, f2: 300 } }, t, v, det)
      tone(r, { f: 260, f2: 90, decay: 0.28, gain: 0.22 }, t, v, det)
      tone(r, { type: 'sawtooth', f: 180, f2: 120, decay: 0.2, gain: 0.09, filter: { type: 'lowpass', f: 700 } }, t, v, det)
      return
    case 'win':
      arp(r, [523, 659, 784, 1046], 0.11, { type: 'triangle', attack: 0.01, decay: 0.5, gain: 0.14 }, t, v, det)
      tone(r, { f: 262, attack: 0.08, hold: 0.3, decay: 0.5, gain: 0.11 }, t, v, det)
      hiss(r, { at: 0.44, decay: 0.5, gain: 0.05, filter: { type: 'highpass', f: 3800 } }, t, v, det)
      return
    case 'lose':
      arp(r, [349, 294, 233, 175], 0.19, { type: 'sawtooth', attack: 0.02, decay: 0.42, gain: 0.13, filter: { type: 'lowpass', f: 900, f2: 380 } }, t, v, det)
      tone(r, { f: 87, attack: 0.05, decay: 0.9, gain: 0.12 }, t, v, det)
      return
  }
}

// ------------------------------------------------------------------ public face

export const audio = {
  play(name: SfxName, opts?: { volume?: number; detune?: number }): void {
    if (mutedFlag) return
    const r = ensure()
    if (!r) return
    try {
      if (r.c.state === 'suspended') r.c.resume().catch(() => { /* still needs a gesture */ })
      const now = r.c.currentTime
      if (!allow(name, now)) return
      const v = Math.max(0, Math.min(4, opts?.volume ?? 1))
      if (v === 0) return
      const det = Math.max(-2400, Math.min(2400, opts?.detune ?? 0))
      render(r, name, now + 0.002, v, det)
    } catch { /* a bad schedule must never break a turn */ }
  },

  setMuted(muted: boolean): void {
    mutedFlag = muted
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
    if (!rig) return
    try { rig.out.gain.setTargetAtTime(muted ? 0 : vol, rig.c.currentTime, 0.01) } catch { /* ignore */ }
  },

  get muted(): boolean { return mutedFlag },

  setVolume(v: number): void {
    vol = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
    if (!rig || mutedFlag) return
    try { rig.out.gain.setTargetAtTime(vol, rig.c.currentTime, 0.01) } catch { /* ignore */ }
  },

  resume(): void {
    const r = ensure()
    if (!r) return
    try {
      if (r.c.state === 'suspended') r.c.resume().catch(() => { /* still needs a gesture */ })
    } catch { /* ignore */ }
  },
}
