import type { GsAnim } from './GsAnim'
import type { GsTrack } from './GsTrack'

/**
 * GsAnimator: Builder class for constructing animations with proper timing control.
 *
 * Features:
 * - Tracks current playhead time
 * - Time stack for parallel animations (push/revert/pop)
 * - Simple keyframe interface (setProp, initProp)
 * - Track management (getTrack)
 * - Value interpolation (getAnimatedValue)
 */
export class GsAnimator {
  private readonly _anim: GsAnim
  private _time: number
  private readonly _step: number
  private _timeStack: { time: number; maxTime: number }[] = []
  private _maxTime: number

  constructor(anim: GsAnim, step: number = 1/20) {
    this._anim = anim
    this._time = step  // Start at first step, not 0
    this._step = step
    this._maxTime = this._time
  }

  // ========== Time Management ==========

  get time(): number { return this._time }
  get step(): number { return this._step }

  get anim(): GsAnim | null { return this._anim }

  /** Advance time by n steps (default: 1 step) */
  advance(steps: number = 1): void {
    this._time += steps * this._step
    if (this._time > this._maxTime) this._maxTime = this._time
  }

  // ========== Parallel Animation Support ==========

  /** Push current time onto stack for parallel animations */
  push(): void {
    this._timeStack.push({ time: this._time, maxTime: this._maxTime })
    this._maxTime = this._time  // Reset max tracker for this parallel block
  }

  /** Revert to pushed time (stay in parallel block for next animation) */
  revert(): void {
    if (this._timeStack.length === 0) return
    const top = this._timeStack[this._timeStack.length - 1]
    this._time = top.time
    // Keep tracking maxTime across reverts
  }

  /** Pop stack, advance time to max reached during parallel block */
  pop(): void {
    if (this._timeStack.length === 0) return
    const frame = this._timeStack.pop()!
    // Advance to the maximum time reached in this parallel block
    this._time = this._maxTime
    // Restore outer maxTime tracking, taking into account what we reached
    if (this._timeStack.length > 0) {
      const outer = this._timeStack[this._timeStack.length - 1]
      if (this._maxTime > outer.maxTime) outer.maxTime = this._maxTime
    }
    this._maxTime = Math.max(frame.maxTime, this._maxTime)
  }

  /** Functional wrapper for parallel animations */
  parallel(callbacks: (() => void)[]): void {
    if (callbacks.length === 0) return
    this.push()
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i]()
      if (i < callbacks.length - 1) this.revert()  // Revert between callbacks, not after last
    }
    this.pop()
  }

  // ========== Marker Management ==========

  /** Add a named marker at the current time */
  addMarker(name: string): void {
    const marker = document.createElement('gs-marker')
    marker.setAttribute('name', name)
    marker.setAttribute('t', this._time.toString())
    this._anim.appendChild(marker)
  }

  // ========== Track Management ==========

  /** Get or create a track for an element property */
  getTrack(elementId: string, prop: string): GsTrack {
    const selector = `gs-track[for="${elementId}"][prop="${prop}"]`
    let track = this._anim.querySelector(selector) as GsTrack | null
    if (!track) {
      track = document.createElement('gs-track') as GsTrack
      track.setAttribute('for', elementId)
      track.setAttribute('prop', prop)
      this._anim.appendChild(track)
    }
    return track
  }

  // ========== Keyframe Setting ==========

  /** Add a single keyframe at current time (or specified time) */
  setProp(elementId: string, prop: string, value: any, opts?: {
    easing?: 'discrete' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
    at?: number
  }): void {
    const track = this.getTrack(elementId, prop)

    const time = opts?.at ?? this._time
    const easing = opts?.easing ?? 'linear'

    // Get existing keyframes and add new one
    const keyframes = [...track.trackData.keyframes]

    // Remove any existing keyframe at the same time
    const existingIdx = keyframes.findIndex(kf => kf.t === time)
    if (existingIdx >= 0) {
      keyframes.splice(existingIdx, 1)
    }

    keyframes.push({ t: time, v: value, e: easing })
    keyframes.sort((a, b) => a.t - b.t)

    track.setKeyframesAndUpdate(keyframes)
  }

  /** Initialize a property at t=0 */
  initProp(elementId: string, prop: string, value: any): void {
    this.setProp(elementId, prop, value, { at: 0, easing: 'discrete' })
  }

  /** Initialize multiple properties at t=0 */
  initProps(elementId: string, props: Record<string, any>): void {
    for (const [prop, value] of Object.entries(props)) {
      this.initProp(elementId, prop, value)
    }
  }

  /** Set multiple properties at current time */
  setProps(elementId: string, props: Record<string, any>, opts?: {
    easing?: 'discrete' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  }): void {
    for (const [prop, value] of Object.entries(props)) {
      this.setProp(elementId, prop, value, opts)
    }
  }

  // ========== Tweening ==========

  /** Copy current animated value to current time (if no keyframe already there) */
  keepProp(elementId: string, prop: string, opts?: {
    easing?: 'discrete' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  }): void {
    const track = this.getTrack(elementId, prop)
    const keyframes = track.trackData.keyframes

    // Skip if there's already a keyframe at current time
    if (keyframes.some(kf => kf.t === this._time)) return

    // Get current animated value and set it at current time
    const currentValue = this.getAnimatedValue(elementId, prop)
    if (currentValue != null) {
      this.setProp(elementId, prop, currentValue, { easing: opts?.easing })
    }
  }

  /** Tween a property from current value to target over n steps */
  tweenProp(elementId: string, prop: string, targetValue: any, opts?: {
    steps?: number
    easing?: 'discrete' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  }): void {
    // Copy current value at current time (anchors the start of the tween)
    this.keepProp(elementId, prop)
    // Advance time
    this.advance(opts?.steps ?? 1)
    // Set target value at new time
    this.setProp(elementId, prop, targetValue, { easing: opts?.easing })
  }

  /** Tween multiple properties in parallel from current values to targets */
  tweenProps(elementId: string, props: Record<string, any>, opts?: {
    steps?: number
    easing?: 'discrete' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  }): void {
    const entries = Object.entries(props)
    if (entries.length === 0) return

    this.push()
    for (let i = 0; i < entries.length; i++) {
      const [prop, value] = entries[i]
      this.tweenProp(elementId, prop, value, opts)
      if (i < entries.length - 1) this.revert()
    }
    this.pop()
  }

  // ========== Value Interpolation ==========

  /** Get the animated value at a specific time (default: current time) */
  getAnimatedValue(elementId: string, prop: string, time?: number): any {
    const track = this.getTrack(elementId, prop)

    const t = time ?? this._time
    const keyframes = track.trackData.keyframes
    if (keyframes.length === 0) return null

    // Sort keyframes by time
    const sorted = [...keyframes].sort((a, b) => a.t - b.t)

    // Before first keyframe
    if (t <= sorted[0].t) return sorted[0].v

    // After last keyframe
    if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v

    // Find bracketing keyframes
    for (let i = 0; i < sorted.length - 1; i++) {
      const kf1 = sorted[i]
      const kf2 = sorted[i + 1]
      if (t >= kf1.t && t < kf2.t) {
        // Handle discrete easing
        if (kf1.e === 'discrete') return kf1.v

        // Interpolate for numeric values
        const v1 = kf1.v
        const v2 = kf2.v
        if (typeof v1 === 'number' && typeof v2 === 'number') {
          const progress = (t - kf1.t) / (kf2.t - kf1.t)
          return v1 + (v2 - v1) * this._applyEasing(progress, kf1.e)
        }

        // Non-numeric: return first value
        return v1
      }
    }

    return sorted[sorted.length - 1].v
  }

  /** Get animated value as number (or null if not numeric) */
  getAnimatedNumeric(elementId: string, prop: string, time?: number): number | null {
    const value = this.getAnimatedValue(elementId, prop, time)
    return typeof value === 'number' ? value : null
  }

  /** Get animated value as string (or null) */
  getAnimatedString(elementId: string, prop: string, time?: number): string | null {
    const value = this.getAnimatedValue(elementId, prop, time)
    return value != null ? String(value) : null
  }

  // ========== Private Helpers ==========

  private _applyEasing(t: number, easing?: string): number {
    switch (easing) {
      case 'easeIn':
        return t * t
      case 'easeOut':
        return t * (2 - t)
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      case 'linear':
      default:
        return t
    }
  }
}
