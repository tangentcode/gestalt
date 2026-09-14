import { Anim, PropTrack, AnimTrack, AnimSegment, Easing, TrackCache, easingFunctionMap } from '../types/anim'
import { GsAnim } from './GsAnim'
import { bin, num } from '../sh';
import { GsSketch } from './GsSketch';
import { interpolateColor } from '../utils/colorUtils';

const linear: Easing = (a:any, z:any, t: number) => a + (z - a) * t;
const COLOR_PROPERTIES = new Set(['bg', 'sc', 'fc', 'fill', 'stroke']);

/** State for an active AnimTrack segment */
type AnimTrackState = {
  targetAnim: Anim;           // The animation being controlled
  activeSegmentIndex: number; // Which segment is currently active (-1 = none)
  segmentLocalTime: number;   // Current time within the segment (in target anim's time)
};

/**
 * GsDefs: Invisible container for GsAnim elements and other reusable definitions within a GsSketch.
 * Manages Anim data, handling both initial load and dynamic changes.
 * Can also serve as a container for reusable components, symbols, audio, and other resources.
 */
export class GsDefs extends HTMLElement {
  private _anims: Map<string, Anim> = new Map();
  private _sketch: GsSketch | null = null;
  private _activeAnim: Anim | null = null;
  private _playhead: number = -1;

  private _observer: MutationObserver | null = null;
  // No waiting set needed here, GsAnim manages its own readiness
  // and notifies via 'internal-anim-change' when ready/updated.

  // --- Playback State ---
  private _isPlaying: boolean = false;
  private _rafId: number | null = null;
  private _lastFrameTime: number = 0;
  private _playDirection: number = 1;
  // Map from track index to AnimTrack playback state
  private _animTrackStates: Map<number, AnimTrackState> = new Map();
  // ----------------------

  connectedCallback() {
    // Establish reference to parent GsSketch
    // Avoid `instanceof GsSketch` here due to circular dependency issues.
    // We assume the parent is GsSketch if it exists and has the correct tag name.
    // Type errors or runtime issues will occur later if the assumption is wrong.
    this._sketch = this.parentElement as GsSketch | null;
    if (!this._sketch || this._sketch.tagName !== 'GS-SKETCH') {
      console.error('GsDefs should be a direct child of a GsSketch element.', this);
      this._sketch = null; // Ensure it's null if parent is not a sketch
    }

    // Listen for updates from child GsAnim elements (covers ready & changes)
    this.addEventListener('internal-anim-change', this._onAnimUpdate);

    // Set up MutationObserver to watch for future GsAnim additions/removals
    this._observer = new MutationObserver(this._onChildMutation);
    this._observer.observe(this, { childList: true });

    // Process anims already present (they will send 'internal-anim-change' when ready)
    this.processExistingAnims();

    // Initial notification to parent (GsSketch)
    // GsSketch will be notified via 'anims-updated' as anims are processed.
    // We can send an initial empty state or wait for first anim.
    this.notifySketchOfUpdate(); // Send initial state (likely empty map)
  }

  disconnectedCallback() {
    this.stop(); // Stop playback if element is removed
    this._observer?.disconnect();
    this.removeEventListener('internal-anim-change', this._onAnimUpdate);
  }

  /** Scan and process GsAnim children that are already present on connection. */
  private processExistingAnims(): void {
    this.querySelectorAll<GsAnim>(':scope > gs-anim').forEach(animElement => {
      // GsAnim sends 'internal-anim-change' when its data is ready/updated.
      // We just need to make sure we are listening.
      // If the anim is *already* ready, process its current data.
      const animData = animElement.animData; // Access the getter
      if (animData && animData.name) { // Check if animData is valid (might be null initially)
         this._addOrUpdateAnimData(animData);
      }
    });
    // No need to notify here, _addOrUpdateAnimData handles notification.
  }

  /** Handles the 'internal-anim-change' event dispatched by GsAnim. */
  private readonly _onAnimUpdate = ((event: CustomEvent)=> {
    const animData = event.detail.animData as Anim;
    // Ensure the event came from a direct child GsAnim
    if (event.target instanceof GsAnim && event.target.parentElement === this) {
      this._addOrUpdateAnimData(animData);
      this.notifySketchOfUpdate()}}) as EventListener

  /** Handles mutations (add/remove) to the direct children of this gs-defs. */
  private readonly _onChildMutation = (mutationsList: MutationRecord[])=> {
    let changed = false;
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // Process added GsAnim nodes
        Array.from(mutation.addedNodes).forEach(node => {
          if (node instanceof GsAnim) {
            // Anim will send 'internal-anim-change' when ready.
            // If it's already ready (has valid animData), process now.
             const animData = node.animData;
             if (animData && animData.name) {
                this._addOrUpdateAnimData(animData);
                changed = true;
             }
          }
        });

        // Process removed GsAnim nodes
        Array.from(mutation.removedNodes).forEach(node => {
          if (node instanceof GsAnim) {
            this._removeAnimData(node);
            changed = true;
          }
        });
      }
    }
    // Notify sketch if a structural change occurred
    if (changed) {
      this.notifySketchOfUpdate();
    }
  }

  /** Adds or updates anim data in the internal map. */
  private _addOrUpdateAnimData(animData: Anim): void {
    if (!animData || !animData.name) {
      console.warn('[GsDefs] Received invalid anim data.', animData);
      return;
    }
    this._anims.set(animData.name, animData);

    // If the updated anim is the currently active one, update the active reference
    // and rebuild its cache.
    if (this._activeAnim && this._activeAnim.name === animData.name) {
      this._activeAnim = animData;
      this._buildActiveAnimCache();
    }
  }

  /** Removes anim data from the internal map. */
  private _removeAnimData(animElement: GsAnim): void {
    const animName = animElement.getAttribute('name'); // Get name from attribute as animData might be gone
    if (animName && this._anims.has(animName)) {
      this._anims.delete(animName);
      // If the removed anim was active, deactivate it
      if (this._activeAnim && this._activeAnim.name === animName) {
        this.activateAnim(null); // Deactivate
      }
    }
  }

  /** Notifies the parent GsSketch that the anims collection has potentially changed. */
  private notifySketchOfUpdate(): void {
     if (this._sketch) { // Ensure sketch exists before dispatching
        this.dispatchEvent(new CustomEvent('anims-updated', {
            detail: { anims: new Map(this._anims) }, // Send a copy of the map
            bubbles: true,
            composed: true
        }));
     }
  }

  // This method is now effectively replaced by _addOrUpdateAnimData and _removeAnimData
  // public parseAnims() { ... }

  // Public method called by GsSketch when 'internal-anim-change' bubbles up
  // This is now handled by the handleAnimUpdateEvent listener directly.
  // public handleAnimUpdate(animData: Anim): void { ... }

  // #region Public API (Activation, Playback Control, Accessors)

  public activateAnim(name: string | null): boolean {
    if (!name) {
      if (this._activeAnim) {
        this._activeAnim = null;
        this._playhead = -1;
      }
      return true;
    }

    const anim = this.anims.get(name);
    if (!anim) {
      console.warn(`[GsDefs ${this.id}] Anim "${name}" not found.`);
      return false;
    }

    if (this._activeAnim === anim) {
      return true;
    }

    this._activeAnim = anim;
    this._buildActiveAnimCache();
    this.playhead = 0;

    return true;
  }

  private _buildActiveAnimCache(): void {
    if (!this._activeAnim) {
      console.warn(`[GsDefs ${this.id}] buildActiveAnimCache called with no active anim.`);
      return;
    }
    if (!this._sketch) {
       console.error(`[GsDefs ${this.id}] Cannot build cache, sketch reference is missing.`);
       return;
    }

    this._activeAnim.cache = [];
    this._animTrackStates.clear(); // Clear previous AnimTrack states

    this._activeAnim.tracks.forEach((track, trackIndex) => {
      // --- Handle AnimTrack ---
      if ('segments' in track) {
        const animTrack = track as AnimTrack;
        const targetAnim = this._anims.get(animTrack.target);
        if (!targetAnim) {
          console.warn(`[GsDefs] AnimTrack references unknown animation "${animTrack.target}"`);
          this._activeAnim!.cache[trackIndex] = { idx: { ts: [] }, val: undefined, dst: () => {} };
          return;
        }

        // Store AnimTrack state for playback
        this._animTrackStates.set(trackIndex, {
          targetAnim,
          activeSegmentIndex: -1,
          segmentLocalTime: 0
        });

        // Build segment start times for the cache index
        const segmentTimes = animTrack.segments.map(s => s.t);

        this._activeAnim!.cache[trackIndex] = {
          idx: { ts: segmentTimes },
          val: undefined,
          dst: () => {} // AnimTrack doesn't use dst directly
        };
        return;
      }

      // --- Handle PropTrack ---
      if ('keyframes' in track) {
        const propTrack = track as PropTrack;
        const targetPath = propTrack.target.split('.')[0];

        // Handle environment variables (targets starting with ':')
        if (targetPath.startsWith(':')) {
            const keyframeTimes = propTrack.keyframes.map(kf => kf.t);
            if (targetPath === ':camera') {
                // Special handling for :camera - sets active camera on sketch
                const dstFunc = (value: any) => {
                    this.sketch.setActiveCamera(value);
                };
                this._activeAnim!.cache[trackIndex] = {
                    idx: { ts: keyframeTimes },
                    val: undefined,
                    dst: dstFunc
                };
            } else if (targetPath === ':anims') {
                // Compiler writes <gs-track for=":anims">t: *item-N</gs-track>
                // as a PropTrack. Playhead applies the named item anim at local time.
                this._activeAnim!.cache[trackIndex] = {
                    idx: { ts: keyframeTimes },
                    val: undefined,
                    dst: () => {}
                };
            } else {
                // :audio and other env vars — mixed by /rs ffmpeg, not applied here
                this._activeAnim!.cache[trackIndex] = { idx: { ts: keyframeTimes }, val: undefined, dst: () => {} };
            }
            return;
        }

        const propName = propTrack.target.split('.')[1];

        // Lazy resolve so gs-clone inflation after cache-build still receives keys
        // (scene/caption, scene/chess.step, …).
        const keyframeTimes = propTrack.keyframes.map(kf => kf.t);

        const dstFunc = (value: any) => {
          const el: Element | null = (targetPath === this.sketch.id)
            ? this.sketch
            : this.sketch.getShapeByPath(targetPath);
          if (el) {
            el.setAttribute(propName, value == null ? '' : String(value));
          }
        };

        const cacheEntry: TrackCache = {
          idx: { ts: keyframeTimes },
          val: undefined,
          dst: dstFunc
        };
        this._activeAnim!.cache[trackIndex] = cacheEntry;
      } else {
        this._activeAnim!.cache[trackIndex] = { idx: { ts: [] }, val: undefined, dst: () => {} };
      }
    });
  }

  /** True only for a whole-token number. parseFloat("02|+Qxh6+")===2 and parseFloat("5r1k/...")===5. */
  private _isPlainNumber(v: any): boolean {
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v !== 'string') return false;
      return /^-?\d+(\.\d+)?$/.test(v.trim());
  }

  private _interpolateTrackValue(track: PropTrack, time: number): any {
      if (track.keyframes.length === 0) return undefined;
      if (track.keyframes.length === 1) return track.keyframes[0].v;

      // i = last keyframe with t <= time (do not include the end with <= on the next).
      let i = -1;
      for (let k = 0; k < track.keyframes.length; k++) {
          if (time >= track.keyframes[k].t) i = k;
          else break;
      }
      if (i === -1) return track.keyframes[0].v;
      if (i === track.keyframes.length - 1) return track.keyframes[i].v;

      const kfStart = track.keyframes[i];
      const kfEnd = track.keyframes[i + 1];
      const segmentDuration = kfEnd.t - kfStart.t;
      if (segmentDuration === 0) return kfStart.v;

      const timeRatio = (time - kfStart.t) / segmentDuration;
      const easeFnName = kfStart.e;
      const propName = track.target.split('.')[1];

      if (easeFnName === 'discrete') return kfStart.v;

      if (propName && COLOR_PROPERTIES.has(propName) && typeof kfStart.v === 'string' && typeof kfEnd.v === 'string') {
          return interpolateColor(kfStart.v, kfEnd.v, timeRatio);
      }
      if (this._isPlainNumber(kfStart.v) && this._isPlainNumber(kfEnd.v)) {
          let easeFn: Easing = linear;
          if (easeFnName && easingFunctionMap[easeFnName]) easeFn = easingFunctionMap[easeFnName];
          return easeFn(num(kfStart.v), num(kfEnd.v), timeRatio);
      }
      // FEN, menu state ("02|+Qxh6+"), captions: hold until the next key.
      return kfStart.v;
  }

  public getAnim(name: string): Anim | undefined {
      return this.anims.get(name);
  }

  public getAnimNames(): string[] {
      return Array.from(this.anims.keys());
  }

  /**
   * Returns the parsed animation anims.
   * Relies on the component being fully initialized via connectedCallback.
   */
get anims(): Map<string, Anim> { return this._anims }

  /** Provides asserted access to the parent GsSketch */
  get sketch(): GsSketch { return this._sketch! }

  get activeAnim(): Anim | null { return this._activeAnim; }
  get playhead(): number { return this._playhead; }
  set playhead(time: number) {
    // Store the raw time requested
    this._playhead = time;

    // Apply updates based on the active anim
    const activeAnim = this._activeAnim; // Use internal reference
    if (!activeAnim || !activeAnim.cache) { // Need cache to apply updates
        console.error('no active anim or cache')
        return;
    }

    // Clamp time to the animation's stated duration
    const clampedTime = Math.max(0, Math.min(time, activeAnim.dur));

    // Iterate through the cache and apply updates
    activeAnim.cache.forEach((trackCache, index) => {
        const track = activeAnim.tracks[index];
        // --- Handle PropTrack ---
        if ('keyframes' in track) { // Type guard for PropTrack
            const propTrack = track as PropTrack;
            const keyframes = propTrack.keyframes;
            const times = trackCache.idx.ts; // Access times from cache index
            const animTarget = propTrack.target.split('.')[0];

            // Nested item anims: 0.000: *item-10 / 0.001: *item-8 / …
            if (animTarget === ':anims') {
                if (!times || times.length === 0) return;
                let idx = bin(times, clampedTime);
                if (idx < 0) idx = 0;
                const itemName = String(keyframes[idx].v);
                const itemAnim = this._anims.get(itemName);
                if (itemAnim) {
                    const localTime = Math.max(0, clampedTime - times[idx]);
                    this._applyAnimAtTime(itemAnim, localTime);
                }
                return;
            }

            if (!times || times.length === 0) {
                return; // No keyframes
            }

            // --- Special case: Single Keyframe ---
            if (times.length === 1) {
                const newValue = keyframes[0].v;
                // Always apply the value if it's the only keyframe
                trackCache.dst(newValue);
                trackCache.val = newValue; // Keep cache consistent
                return; // Handled single keyframe case
            }

            // --- Original logic for multiple keyframes ---
            const i = bin(times, clampedTime); // Find index of keyframe at or before current time

            if (i === -1) { // Before first keyframe
               // Apply first keyframe's value
               const newValue = keyframes[0].v;
               if (trackCache.val !== newValue) {
                   trackCache.dst(newValue);
                   trackCache.val = newValue;
               }
               // No longer need the check for clampedTime >= times[0] here,
               // as the single keyframe case is handled above. This block
               // now correctly handles time < t0 for multi-keyframe tracks.
               // Removed the early return here as well.
            } else if (i === times.length - 1) { // At or after last keyframe
                const newValue = keyframes[i].v;
                if (trackCache.val !== newValue) {
                    trackCache.dst(newValue);
                    trackCache.val = newValue;
                }
            } else { // Between keyframes i and i+1
                const k0 = keyframes[i];
                const k1 = keyframes[i + 1];
                const t0 = k0.t;
                const t1 = k1.t;
                const v0 = k0.v;
                const v1 = k1.v;

                // Calculate interpolation factor (0 to 1)
                const factor = (t1 - t0 > 0) ? (clampedTime - t0) / (t1 - t0) : 0;

                // Use easing function if available, otherwise linear
                const easeFnName = k0.e; // Name is correctly a string
                let easeFn: Easing = linear; // Default to linear
                if (easeFnName && easingFunctionMap[easeFnName]) {
                    easeFn = easingFunctionMap[easeFnName]; // Update if valid name found
                }

                let interpolatedValue: any;
                const propName = propTrack.target.split('.')[1]; // Get property name

                try {
                    // Discrete easing: hold start value until next keyframe
                    if (easeFnName === 'discrete') {
                        interpolatedValue = v0;
                    // Check if it's a color property and values are strings
                    } else if (propName && COLOR_PROPERTIES.has(propName) && typeof v0 === 'string' && typeof v1 === 'string') {
                        interpolatedValue = interpolateColor(v0, v1, factor);
                    // Check if values are numbers for standard interpolation
                    } else if (typeof v0 === 'number' && typeof v1 === 'number') {
                        interpolatedValue = easeFn(v0, v1, factor);
                    // Otherwise, snap (no interpolation for other types)
                    } else {
                        interpolatedValue = factor < 0.5 ? v0 : v1; // Snap
                    }
                } catch (e) {
                    console.error(`[GsDefs] Track ${index} (Prop: ${propName}) - Error during easing/interpolation:`, e, k0, k1, factor);
                    interpolatedValue = v0; // Fallback to start value on error
                }

                if (trackCache.val !== interpolatedValue) {
                    trackCache.dst(interpolatedValue);
                    trackCache.val = interpolatedValue;
                }
            }
        }
        // --- Handle AnimTrack ---
        else if ('segments' in track) {
          this._updateAnimTrack(track as AnimTrack, index, clampedTime);
        }
        // --- TODO: Handle other track types (CallTrack, etc.) ---
    });
  }

  /** Update an AnimTrack at the given time */
  private _updateAnimTrack(track: AnimTrack, trackIndex: number, time: number): void {
    const state = this._animTrackStates.get(trackIndex);
    if (!state) return;

    const segments = track.segments;
    if (segments.length === 0) return;

    // Find which segment is active at this time
    let activeSegment: AnimSegment | null = null;
    let segmentIndex = -1;

    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segEnd = this._getSegmentEndTime(seg, state.targetAnim);
      if (time >= seg.t && time < segEnd) {
        activeSegment = seg;
        segmentIndex = i;
        break;
      }
    }

    if (!activeSegment) {
      state.activeSegmentIndex = -1;
      return;
    }

    state.activeSegmentIndex = segmentIndex;

    // Calculate local time within the target animation
    const localTime = this._calculateSegmentLocalTime(activeSegment, state.targetAnim, time);
    state.segmentLocalTime = localTime;

    // Apply the target animation at this local time
    this._applyAnimAtTime(state.targetAnim, localTime);
  }

  /** Calculate when a segment ends in parent timeline time */
  private _getSegmentEndTime(segment: AnimSegment, targetAnim: Anim): number {
    const fromTime = this._resolveMarkerOrTime(segment.from, targetAnim, 0);
    const toTime = this._resolveSegmentEnd(segment, targetAnim, fromTime);
    const speed = segment.speed ?? 1.0;
    const segmentDuration = (toTime - fromTime) / speed;
    return segment.t + segmentDuration;
  }

  /** Calculate local time within target animation for a segment */
  private _calculateSegmentLocalTime(segment: AnimSegment, targetAnim: Anim, parentTime: number): number {
    const fromTime = this._resolveMarkerOrTime(segment.from, targetAnim, 0);
    const toTime = this._resolveSegmentEnd(segment, targetAnim, fromTime);
    const speed = segment.speed ?? 1.0;

    // Time elapsed since segment start
    const elapsed = parentTime - segment.t;
    // Apply speed to get local time offset
    const localOffset = elapsed * speed;
    // Add to segment's from time
    const localTime = fromTime + localOffset;

    // Clamp to segment bounds
    return Math.max(fromTime, Math.min(toTime, localTime));
  }

  /** Resolve segment end time - if 'to' is undefined, use next marker after 'from' */
  private _resolveSegmentEnd(segment: AnimSegment, anim: Anim, fromTime: number): number {
    // If 'to' is explicitly specified, use it
    if (segment.to !== undefined) {
      return this._resolveMarkerOrTime(segment.to, anim, anim.dur);
    }

    // Otherwise, find the next marker after fromTime
    const nextMarkerTime = this._getNextMarkerTime(anim, fromTime);
    return nextMarkerTime ?? anim.dur;
  }

  /** Get the time of the next marker after a given time */
  private _getNextMarkerTime(anim: Anim, afterTime: number): number | null {
    if (!anim.markers || anim.markers.length === 0) return null;

    // Markers are already sorted by time in GsAnim
    for (const marker of anim.markers) {
      if (marker.t > afterTime) {
        return marker.t;
      }
    }
    return null; // No marker after this time
  }

  /** Resolve a marker name or time value to a numeric time */
  private _resolveMarkerOrTime(value: string | number | undefined, anim: Anim, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    if (typeof value === 'number') return value;

    // It's a marker name - look it up
    const marker = anim.markers?.find(m => m.name === value);
    if (marker) return marker.t;

    console.warn(`[GsDefs] Marker "${value}" not found in animation "${anim.name}"`);
    return defaultValue;
  }

  /** Apply an animation's properties at a specific time (for nested animation playback) */
  private _applyAnimAtTime(anim: Anim, time: number): void {
    if (!this._sketch) return;

    // Iterate through the animation's PropTracks and apply values
    anim.tracks.forEach(track => {
      if (!('keyframes' in track)) return; // Only handle PropTracks for now

      const propTrack = track as PropTrack;
      const targetPath = propTrack.target.split('.')[0];
      const propName = propTrack.target.split('.')[1];

      // Skip environment variables in nested animations
      if (targetPath.startsWith(':')) return;

      const targetElement = (targetPath === this.sketch.id)
        ? this.sketch
        : this.sketch.getShapeByPath(targetPath);

      if (!targetElement) return;

      const value = this._interpolateTrackValue(propTrack, time);
      if (value !== undefined) {
        targetElement.setAttribute(propName, value == null ? '' : String(value));
      }
    });
  }

  /** Stop any active animation loop */
  public stop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
    }
    this._isPlaying = false;
    this._rafId = null;
  }

  /** Activate a anim and start the animation loop */
  public play(animName: string): boolean {
    // Stop any previous playback first
    this.stop();

    // Activate the requested anim (sets _activeAnim, builds cache)
    const activated = this.activateAnim(animName);
    if (!activated) {
      // activateAnim already warns if anim not found
      return false; // Indicate failure
    }
    // Now this._activeAnim is guaranteed to be set

    if (this._isPlaying) {
      return true; // Already playing is considered success
    }

    // If playhead is at the end and playing forward, restart from beginning
    // If playhead is at the beginning and playing backward, restart from end
    // This handles restarting after finishing a non-looping animation
    if (this._playDirection === 1 && this._playhead >= this._activeAnim!.dur) {
        this._playhead = 0;
    } else if (this._playDirection === -1 && this._playhead <= 0) {
        this._playhead = this._activeAnim!.dur;
    }

    this._isPlaying = true;
    // Reset direction? Or keep it for resuming ping-pong?
    // Let's reset to forward for simplicity on calling play()
    // this._playDirection = 1;
    this._lastFrameTime = performance.now();
    this._rafId = requestAnimationFrame(this._step);
    return true; // Indicate success
  }

  /** The core animation loop */
  private readonly _step = (timestamp: number)=> {
    if (!this._isPlaying || !this._activeAnim) {
      this._rafId = null;
      return}

    const delta = (timestamp - this._lastFrameTime) / 1000;
    this._lastFrameTime = timestamp;

    let nextPlayhead = this.playhead + delta * this._playDirection;
    const duration = this._activeAnim.dur;
    let shouldStop = false;

    // Handle repeat modes
    if (this._playDirection === 1 && nextPlayhead >= duration) {
      switch (this._activeAnim.rep) {
        case 1: // Loop
          nextPlayhead = nextPlayhead % duration;
          break;
        case -1: // Ping-pong
          nextPlayhead = duration - (nextPlayhead - duration);
          this._playDirection = -1;
          break;
        default: // Play once
          nextPlayhead = duration;
          shouldStop = true;
          break;
      }
    } else if (this._playDirection === -1 && nextPlayhead <= 0) {
      switch (this._activeAnim.rep) {
        case -1: // Ping-pong
          nextPlayhead = -nextPlayhead;
          this._playDirection = 1;
          break;
        default: // Should only happen in ping-pong
          nextPlayhead = 0;
          shouldStop = true; // Stop if reaching start while reversing (non-ping-pong edge case)
          break;
      }
    }

    // Update internal playhead via setter
    this.playhead = nextPlayhead;

    // Directly update the sketch's playhead to trigger visual updates
    // REMOVED: this.sketch.playhead = this.playhead;
    // Setting this.playhead now directly triggers the update logic within the setter.

    if (shouldStop) {
      this.stop();
    } else {
      this._rafId = requestAnimationFrame(this._step);
    }
  }
}

customElements.define('gs-defs', GsDefs)
