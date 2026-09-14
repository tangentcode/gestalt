import { Track, PropTrack, AnimTrack, AnimSegment, Keyframe, Easing } from '../types/anim'
import { num, und } from '../sh'

// Basic linear interpolation, easing functions can be added later
const linear: Easing = (a, z, t) => a + (z - a) * t

/**
 * GsTrack: Invisible element representing a single animation track within a GsAnim.
 * Parses its attributes and content to build a Track data object.
 *
 * Supports two track types:
 * - PropTrack (default): Animates a property with keyframes
 *   <gs-track for="element" prop="x">0: 0; 1: 100</gs-track>
 *
 * - AnimTrack (type="anim"): Schedules segments of a named animation
 *   <gs-track type="anim" for="piece-movement">
 *     0: setup→capture @0.5x
 *     3: capture→checkmate
 *   </gs-track>
 */
export class GsTrack extends HTMLElement {
  private _trackData: PropTrack | AnimTrack = { target: '', keyframes: [] };
  private _trackType: 'prop' | 'anim' = 'prop';

  connectedCallback() {
    this.parseContent()
    this.dispatchEvent(new CustomEvent('gs-track-ready', {
      detail: { trackData: this._trackData },
      bubbles: true}))
  }

  get trackData(): PropTrack | AnimTrack {
    return this._trackData
  }

  get trackType(): 'prop' | 'anim' {
    return this._trackType
  }

  /**
   * Serializes keyframes/segments to the text format expected by gs-track elements.
   * PropTrack format: "0.0: 100; 0.5: 200; 1.0: 300"
   * AnimTrack format: "0.0: marker1→marker2 @0.5x; 1.0: marker2→marker3"
   */
  public serializeKeyframes(): string {
    if (this._trackType === 'anim' && 'segments' in this._trackData) {
      const animTrack = this._trackData as AnimTrack;
      animTrack.segments.sort((a, b) => a.t - b.t);
      return animTrack.segments.map(seg => {
        const time = seg.t.toFixed(3);
        let value = '';
        if (seg.from !== undefined || seg.to !== undefined) {
          const from = seg.from ?? '';
          const to = seg.to ?? '';
          value = `${from}→${to}`;
        }
        if (seg.speed !== undefined && seg.speed !== 1.0) {
          value += ` @${seg.speed}x`;
        }
        return value ? `${time}: ${value}` : time;
      }).join('; ');
    }

    // PropTrack
    const propTrack = this._trackData as PropTrack;
    const keyframes = propTrack.keyframes;
    keyframes.sort((a, b) => a.t - b.t);
    return keyframes.map(kf => {
      const time = typeof kf.t === 'number' ? kf.t.toFixed(3) : kf.t;
      return `${time}: ${kf.v}`}).join('; ')}

  /**
   * Updates the internal keyframe data, updates textContent, and dispatches an event.
   * This is the primary method for external components (like the timeline) to update the track.
   * @param newKeyframes The new array of keyframes. */
  public setKeyframesAndUpdate(newKeyframes: Keyframe[]): void {
    this._trackData.keyframes = [...newKeyframes];
    const serialized = this.serializeKeyframes();
    this.textContent = serialized;
    this.dispatchEvent(new CustomEvent('track-data-changed', {
      detail: { trackData: this._trackData },
      bubbles: true}))}

  /**
   * Adds a new keyframe with the specified time and value.
   * If a keyframe already exists at the given time, it will be updated with the new value.
   * @param time The time position for the keyframe
   * @param value The value of the keyframe
   * @returns The index of the added or updated keyframe
   */
  public addKeyframe(time: number, value: any): number {
    const existingIndex = this._trackData.keyframes.findIndex(kf => kf.t === time);

    if (existingIndex >= 0) {
      // Update existing keyframe
      const updatedKeyframe = { ...this._trackData.keyframes[existingIndex], v: value };
      return this.updateKeyframe(existingIndex, updatedKeyframe);
    } else {
      // Add new keyframe with default linear easing
      const newKeyframe: Keyframe = { t: time, v: value, e: 'linear' };

      // Create a new keyframes array with the new keyframe
      const updatedKeyframes = [...this._trackData.keyframes, newKeyframe];

      // Sort keyframes by time
      updatedKeyframes.sort((a, b) => a.t - b.t);

      // Update using the existing method
      this.setKeyframesAndUpdate(updatedKeyframes);

      // Return the index of the newly added keyframe
      return updatedKeyframes.findIndex(kf => kf.t === time && kf.v === value);
    }
  }

  /**
   * Updates a specific keyframe at the given index and dispatches an event.
   * @param index The index of the keyframe to update
   * @param updatedKeyframe The new keyframe data
   * @returns The index of the keyframe after update (may change due to sorting)
   */
  public updateKeyframe(index: number, updatedKeyframe: Keyframe): number {
    if (index < 0 || index >= this._trackData.keyframes.length) return -1;

    // Create a new keyframes array with the updated keyframe
    const updatedKeyframes = [...this._trackData.keyframes];
    updatedKeyframes[index] = updatedKeyframe;

    // Sort keyframes by time
    updatedKeyframes.sort((a, b) => a.t - b.t);

    // Update using the existing method
    this.setKeyframesAndUpdate(updatedKeyframes);

    // Return the new index of the updated keyframe
    return updatedKeyframes.findIndex(kf => kf.t === updatedKeyframe.t && kf.v === updatedKeyframe.v);
  }

  /**
   * Deletes a keyframe at the given index and dispatches an event.
   * @param index The index of the keyframe to delete
   */
  public deleteKeyframe(index: number): void {
    if (index < 0 || index >= this._trackData.keyframes.length) return;

    // Create a new keyframes array without the deleted keyframe
    const updatedKeyframes = this._trackData.keyframes.filter((_, i) => i !== index);

    // Update using the existing method
    this.setKeyframesAndUpdate(updatedKeyframes);
  }

  /** Loads the track data from the element's textContent. */
  private parseContent() {
    const targetId = this.getAttribute('for');
    const trackType = this.getAttribute('type');
    let content = this.textContent?.trim() || '';

    if (!targetId) {
      console.warn(`[GsTrack] Missing 'for' attribute. Cannot determine target.`);
      this._trackData = { target: '', keyframes: [] };
      return;
    }

    // Check if this is an AnimTrack
    if (trackType === 'anim') {
      this._trackType = 'anim';
      this._parseAnimTrack(targetId, content);
    } else {
      this._trackType = 'prop';
      this._parsePropTrack(targetId, content);
    }
  }

  /** Parse PropTrack format */
  private _parsePropTrack(targetId: string, content: string) {
    const propName = this.getAttribute('prop');

    // Determine the final target string
    const target = (!propName) ? targetId : `${targetId}.${propName}`;

    // Replace all semicolons with newlines to support both delimiters
    content = content.replace(/;/g, '\n');

    const keyframes: Keyframe[] = [];
    const lines = content.split(/\r?\n/);
    let parseError = false;

    lines.forEach(line => {
      const pair = line.trim();
      if (pair === '') return;

      // Split on the first ':' only so FEN / captions can contain colons.
      const colon = pair.indexOf(':');
      if (colon < 0) { parseError = true; return; }
      const time = num(pair.slice(0, colon).trim());
      const raw = pair.slice(colon + 1).trim();
      // parseFloat("5r1k/...") === 5 — only coerce a whole-token number.
      const value: any = /^-?\d+(\.\d+)?$/.test(raw) ? num(raw) : raw;

      if (!isNaN(time)) keyframes.push({ t: time, v: value, e: 'linear' });
      else { parseError = true; }
    });

    if (parseError) {
      console.warn(`[GsTrack ${target}] Error parsing keyframes. Content:`, content);
    }

    keyframes.sort((a, b) => a.t - b.t);
    this._trackData = { target, keyframes };
  }

  /**
   * Parse AnimTrack format.
   * Format: "0.0: marker1→marker2 @0.5x; 3.0: marker2→marker3"
   * - Time before colon
   * - After colon: from→to (markers or times, optional)
   * - @speed (optional, defaults to 1.0)
   */
  private _parseAnimTrack(targetId: string, content: string) {
    // Replace semicolons with newlines
    content = content.replace(/;/g, '\n');

    const segments: AnimSegment[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed === '') return;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        // Just a time, play full animation at that time
        const time = num(trimmed);
        if (!isNaN(time)) {
          segments.push({ t: time });
        }
        return;
      }

      const time = num(trimmed.substring(0, colonIdx).trim());
      if (isNaN(time)) return;

      let rest = trimmed.substring(colonIdx + 1).trim();
      const segment: AnimSegment = { t: time };

      // Parse speed modifier (@0.5x)
      const speedMatch = rest.match(/@([\d.]+)x?\s*$/);
      if (speedMatch) {
        segment.speed = parseFloat(speedMatch[1]);
        rest = rest.substring(0, rest.lastIndexOf('@')).trim();
      }

      // Parse from→to (supports both → and ->)
      if (rest) {
        const arrowMatch = rest.match(/^([^→\->]*)(?:→|->)(.*)$/);
        if (arrowMatch) {
          const from = arrowMatch[1].trim();
          const to = arrowMatch[2].trim();
          if (from) segment.from = isNaN(num(from)) ? from : num(from);
          if (to) segment.to = isNaN(num(to)) ? to : num(to);
        } else {
          // No arrow, treat as "from" marker only (play from this point to end)
          const marker = rest.trim();
          if (marker) segment.from = isNaN(num(marker)) ? marker : num(marker);
        }
      }

      segments.push(segment);
    });

    segments.sort((a, b) => a.t - b.t);
    this._trackData = { target: targetId, segments };
  }
}

customElements.define('gs-track', GsTrack)
