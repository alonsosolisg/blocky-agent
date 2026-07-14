/**
 * Simple game-like Web Audio system for the 3D Builder.
 * Nostalgic LEGO plastic "clack" and interaction sounds.
 * Tasteful, not overwhelming. Slight variation for life.
 *
 * References:
 * - https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
 * - Classic toy/plastic click sound design techniques (noise + tone + fast envelope)
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioCtx
}

/**
 * Play a satisfying plastic clack (place sound).
 * Short burst of filtered noise + a quick pitched click.
 */
export function playPlaceSound() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Main body: short noise burst (plastic impact)
    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    noise.buffer = buffer

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 1400 + Math.random() * 400
    noiseFilter.Q.value = 1.8

    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.0

    // Fast envelope for the noise
    noiseGain.gain.setValueAtTime(0.45, now)
    noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.13)

    // Add a subtle pitched "stud click" tone
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 920 + Math.random() * 120

    const oscGain = ctx.createGain()
    oscGain.gain.value = 0.0
    oscGain.gain.setValueAtTime(0.22, now)
    oscGain.gain.linearRampToValueAtTime(0.001, now + 0.09)

    const oscFilter = ctx.createBiquadFilter()
    oscFilter.type = 'lowpass'
    oscFilter.frequency.value = 1800

    // Master gain + slight lowpass for naturalness
    const master = ctx.createGain()
    master.gain.value = 0.7

    const finalFilter = ctx.createBiquadFilter()
    finalFilter.type = 'lowpass'
    finalFilter.frequency.value = 3200

    // Connect
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(finalFilter)

    osc.connect(oscFilter)
    oscFilter.connect(oscGain)
    oscGain.connect(finalFilter)

    finalFilter.connect(master)
    master.connect(ctx.destination)

    noise.start(now)
    osc.start(now)
    osc.stop(now + 0.12)
  } catch (e) {
    // Silent fail if audio blocked
  }
}

/** Soft pick / select sound (lighter) */
export function playSelectSound() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 680

    const gain = ctx.createGain()
    gain.gain.value = 0.18

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1400

    gain.gain.setValueAtTime(0.18, now)
    gain.gain.linearRampToValueAtTime(0.001, now + 0.06)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.08)
  } catch {}
}

/** Delete / remove sound (slightly lower, woodier pop) */
export function playDeleteSound() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900

    const gain = ctx.createGain()
    gain.gain.value = 0.0
    gain.gain.setValueAtTime(0.35, now)
    gain.gain.linearRampToValueAtTime(0.001, now + 0.11)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
  } catch {}
}

/** Very subtle layer change tick */
export function playLayerTick() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 520

    const g = ctx.createGain()
    g.gain.value = 0.09
    g.gain.linearRampToValueAtTime(0.001, now + 0.04)

    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.05)
  } catch {}
}

/** Play a rewarding "level complete" sound effect when Blocky completes a build */
export function playAgentCompleteSound() {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Two rising notes (chime)
    const notes = [587.33, 880] // D5 -> A5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + idx * 0.12)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0, now)
      gain.gain.setValueAtTime(0.18, now + idx * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + idx * 0.12)
      osc.stop(now + idx * 0.12 + 0.4)
    })
  } catch {}
}

// Initialize on first user gesture (good practice)
export function initAudioOnGesture() {
  const init = () => {
    getAudioContext()
    window.removeEventListener('pointerdown', init)
    window.removeEventListener('keydown', init)
  }
  window.addEventListener('pointerdown', init, { once: true })
  window.addEventListener('keydown', init, { once: true })
}
