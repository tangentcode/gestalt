import { Anim, Track, Marker } from '../types/anim'
import { GsTrack } from './GsTrack'
import { GsMarker } from './GsMarker'
import { num } from '../sh'

/**
 * GsAnim: Invisible container for GsTrack and GsMarker elements within a GsDefs.
 * Parses its attributes and children dynamically to build an Anim data object.
 * Handles both initial loading via events and dynamic changes via MutationObserver.
 */
export class GsAnim extends HTMLElement {
  private _animData: Anim;
  private _observer: MutationObserver | null = null;
  private _waitingTracks: Set<GsTrack> = new Set();
  private _waitingMarkers: Set<GsMarker> = new Set();

  static get observedAttributes() {
    return ['dur', 'rep', 'name'];
  }

  constructor() {
    super();
    const name = this.getAttribute('name') || '';
    const duration = num(this.getAttribute('dur') || '1');
    const repAttr = this.getAttribute('rep');
    let repeat = 0;
    if (repAttr === '1') repeat = 1;
    else if (repAttr === '-1') repeat = -1;

    this._animData = {
      name: name,
      dur: duration,
      rep: repeat,
      tracks: [],
      markers: [],
      cache: []
    };
  }

  // #region lifecycle
  connectedCallback() {
    this.parseAnimData();

    // Add all tracks to waiting set initially - they'll be removed when they dispatch 'gs-track-ready'
    this.querySelectorAll<GsTrack>(':scope > gs-track').forEach(track => {
      this._waitingTracks.add(track);
    });

    // Add all markers to waiting set initially
    this.querySelectorAll<GsMarker>(':scope > gs-marker').forEach(marker => {
      this._waitingMarkers.add(marker);
    });

    this.addEventListener('gs-track-ready', this.handleTrackReady as EventListener);
    this.addEventListener('gs-marker-ready', this.handleMarkerReady as EventListener);

    this._observer = new MutationObserver(this._onChildMutation);
    this._observer.observe(this, { childList: true });

    this.addEventListener('track-data-changed', this._onTrackDataChanged as EventListener);

    // Only notify parent if there are no tracks or markers waiting
    if (this._waitingTracks.size === 0 && this._waitingMarkers.size === 0) {
      this.notifyParentOfUpdate();
    }
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this.removeEventListener('gs-track-ready', this.handleTrackReady as EventListener);
    this.removeEventListener('gs-marker-ready', this.handleMarkerReady as EventListener);
    this.removeEventListener('track-data-changed', this._onTrackDataChanged as EventListener);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    let needsUpdate = false;
    switch (name) {
      case 'dur':
        const newDur = num(newValue || '1');
        if (this._animData.dur !== newDur) {
          this._animData.dur = newDur;
          needsUpdate = true;
        }
        break;
      case 'rep':
        const newRep = (newValue === '1' || newValue === '-1') ? parseInt(newValue, 10) : 0;
        if (this._animData.rep !== newRep) {
          this._animData.rep = newRep;
          needsUpdate = true;
        }
        break;
      case 'name':
        if (this._animData.name !== (newValue || '')) {
            this._animData.name = newValue || '';
            needsUpdate = true;
        }
        break;
    }

    if (needsUpdate && this._waitingTracks.size === 0 && this._waitingMarkers.size === 0) {
      this.notifyParentOfUpdate();
    }
  }
  // #endregion

  // #region Track and Marker Processing Logic

  /** Handle the 'gs-track-ready' event from a child track. */
  private handleTrackReady(event: CustomEvent): void {
    const trackElement = event.target as GsTrack;
    if (this.contains(trackElement)) {
      this._waitingTracks.delete(trackElement);
      this._addOrUpdateTrackData(trackElement);
      if (this._waitingTracks.size === 0 && this._waitingMarkers.size === 0) {
        this.notifyParentOfUpdate();
      }
    }
  }

  /** Handle the 'gs-marker-ready' event from a child marker. */
  private handleMarkerReady(event: CustomEvent): void {
    const markerElement = event.target as GsMarker;
    if (this.contains(markerElement)) {
      this._waitingMarkers.delete(markerElement);
      this._addOrUpdateMarkerData(markerElement);
      if (this._waitingTracks.size === 0 && this._waitingMarkers.size === 0) {
        this.notifyParentOfUpdate();
      }
    }
  }

  /** Handles mutations (add/remove) to the direct children of this gs-anim. */
  private readonly _onChildMutation = (mutationsList: MutationRecord[])=> {
    let changed = false;
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        Array.from(mutation.addedNodes).forEach(node => {
          if (node instanceof GsTrack) {
            if (node.trackData) {
               this._addOrUpdateTrackData(node);
               changed = true;
            } else {
                this._waitingTracks.add(node);
            }
          } else if (node instanceof GsMarker) {
            if (node.markerData) {
              this._addOrUpdateMarkerData(node);
              changed = true;
            } else {
              this._waitingMarkers.add(node);
            }
          }
        });

        Array.from(mutation.removedNodes).forEach(node => {
          if (node instanceof GsTrack) {
            this._removeTrackData(node);
            this._waitingTracks.delete(node);
            changed = true;
          } else if (node instanceof GsMarker) {
            this._removeMarkerData(node);
            this._waitingMarkers.delete(node);
            changed = true;
          }
        });
      }
    }
    if (changed && this._waitingTracks.size === 0 && this._waitingMarkers.size === 0) {
      this.notifyParentOfUpdate();
    }
  }

  /** Adds or updates the track data in the internal _animData. */
  private _addOrUpdateTrackData(trackElement: GsTrack): void {
    const trackData = trackElement.trackData;

    if (!trackData || !trackData.target) {
        if (trackElement.getAttribute('for')?.startsWith(':')) {
            const target = trackElement.getAttribute('for')!;
            const partialTrackData = { target: target, keyframes: [] };
            const existingIndex = this._animData.tracks.findIndex(t => 'target' in t && t.target === target);
            if (existingIndex > -1) {
                this._animData.tracks[existingIndex] = partialTrackData;
            } else {
                this._animData.tracks.push(partialTrackData);
            }
            return;
        }
        console.warn(`[GsAnim ${this.animData.name}] Received track data without target or invalid 'for' attribute.`, trackElement);
        return;
    }

    const existingIndex = this._animData.tracks.findIndex(t => 'target' in t && t.target === trackData.target);

    if (existingIndex > -1) {
      // Check if this is an AnimTrack (has segments) or PropTrack (has keyframes)
      if ('segments' in trackData) {
        // AnimTrack - replace segments entirely (no merging for now)
        this._animData.tracks[existingIndex] = trackData;
      } else if ('keyframes' in trackData) {
        // PropTrack - merge keyframes
        const existing = this._animData.tracks[existingIndex] as { keyframes?: any[] };
        const existingKfs = existing.keyframes || [];
        const newKfs = trackData.keyframes || [];

        // Combine and sort by time, keeping later keyframes for duplicate times
        const merged = [...existingKfs, ...newKfs];
        merged.sort((a, b) => a.t - b.t);

        // Deduplicate by time (keep last occurrence)
        const deduped: any[] = [];
        for (let i = 0; i < merged.length; i++) {
          if (i === merged.length - 1 || merged[i].t !== merged[i + 1].t) {
            deduped.push(merged[i]);
          }
        }

        this._animData.tracks[existingIndex] = { ...trackData, keyframes: deduped };
      }
    } else {
      this._animData.tracks.push(trackData);
    }
  }

  /** Removes the track data from the internal _animData. */
  private _removeTrackData(trackElement: GsTrack): void {
    const targetId = trackElement.trackData?.target;
    if (!targetId) return;

    this._animData.tracks = this._animData.tracks.filter(t => {
        return !('target' in t && t.target === targetId);
    });
  }

  /** Adds or updates a marker in the internal _animData. */
  private _addOrUpdateMarkerData(markerElement: GsMarker): void {
    const markerData = markerElement.markerData;
    if (!markerData || !markerData.name) {
      console.warn(`[GsAnim ${this.animData.name}] Received marker without name.`, markerElement);
      return;
    }

    const existingIndex = this._animData.markers.findIndex(m => m.name === markerData.name);
    if (existingIndex > -1) {
      this._animData.markers[existingIndex] = markerData;
    } else {
      this._animData.markers.push(markerData);
      // Sort markers by time
      this._animData.markers.sort((a, b) => a.t - b.t);
    }
  }

  /** Removes a marker from the internal _animData. */
  private _removeMarkerData(markerElement: GsMarker): void {
    const markerName = markerElement.markerData?.name;
    if (!markerName) return;

    this._animData.markers = this._animData.markers.filter(m => m.name !== markerName);
  }

  /** Ensure dur covers all keyframe times */
  private _ensureDurCoversKeyframes(): void {
    let maxT = this._animData.dur
    for (const t of this._animData.tracks) {
      if ('keyframes' in t && t.keyframes) {
        for (const kf of t.keyframes) {
          if (kf.t > maxT) maxT = kf.t
        }
      }
    }
    if (maxT > this._animData.dur) this._animData.dur = maxT
  }

  /** Notifies the parent (GsDefs) that the anim data has potentially changed. */
  private notifyParentOfUpdate(): void {
    this._ensureDurCoversKeyframes()
    this.dispatchEvent(new CustomEvent('internal-anim-change', {
      detail: { animData: this._animData },
      bubbles: true,
      composed: true
    }));
  }
  // #endregion

  // #region accessors
  /** Returns the parsed anim data object. */
  get animData(): Anim { return this._animData! }
  get rep(): number { return this._animData.rep }

  set rep(value: number) {
    const newRepStr = (value === 1) ? '1' : (value === -1) ? '-1' : '0';
    if (this.getAttribute('rep') !== newRepStr) {
        if (newRepStr === '0') this.removeAttribute('rep');
        else this.setAttribute('rep', newRepStr);
    }
  }

  get dur(): number { return this._animData.dur; }

  set dur(value: number) {
    const newDurStr = value.toString();
    if (this.getAttribute('dur') !== newDurStr) {
        this.setAttribute('dur', newDurStr);
    }
  }
  // #endregion

  /** Handles 'track-data-changed' event from a GsTrack (e.g., keyframe edits) */
  private readonly _onTrackDataChanged = (event: CustomEvent)=> {
    if (!event.detail) {
      console.warn(`GsAnim (${this.animData.name}): Received track-data-changed event with no detail.`);
      return;
    }
    const changedTrackData = event.detail.trackData as Track;
    if (!changedTrackData || !('target' in changedTrackData)) return;

    const trackIndex = this._animData.tracks.findIndex(t => 'target' in t && t.target === changedTrackData.target);

    if (trackIndex !== -1) {
      this._animData.tracks[trackIndex] = changedTrackData;
      this.notifyParentOfUpdate();
    } else {
      console.warn(`GsAnim (${this.animData.name}): Received track-data-changed for an unknown track.`, changedTrackData);
    }
  }

  /** Recalculates the anim data based on current attributes and children. */
  public parseAnimData() {
    const name = this.getAttribute('name') || '';
    const duration = num(this.getAttribute('dur') || '1');
    const repAttr = this.getAttribute('rep');
    let repeat = 0;
    if (repAttr === '1') repeat = 1;
    else if (repAttr === '-1') repeat = -1;

    this._animData = {
      name: name,
      dur: duration,
      rep: repeat,
      tracks: this._animData?.tracks || [],
      markers: this._animData?.markers || [],
      cache: []
    };

    this._animData.tracks = [];
    this.querySelectorAll<GsTrack>(':scope > gs-track').forEach(trackElement => {
      const trackData = trackElement.trackData;
      if (trackData) {
        this._animData.tracks.push(trackData);
      }
    });

    this._animData.markers = [];
    this.querySelectorAll<GsMarker>(':scope > gs-marker').forEach(markerElement => {
      const markerData = markerElement.markerData;
      if (markerData && markerData.name) {
        this._animData.markers.push(markerData);
      }
    });
    // Sort markers by time
    this._animData.markers.sort((a, b) => a.t - b.t);
  }

  /** Get a marker's time by name. Returns undefined if not found. */
  public getMarkerTime(name: string): number | undefined {
    const marker = this._animData.markers.find(m => m.name === name);
    return marker?.t;
  }
}

customElements.define('gs-anim', GsAnim)
