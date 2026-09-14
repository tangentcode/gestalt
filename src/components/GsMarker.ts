import { Marker } from '../types/anim'
import { num } from '../sh'

/**
 * GsMarker: Invisible element representing a named time marker within a GsAnim.
 * Markers allow referencing specific points in an animation by name,
 * useful for scheduling segments in AnimTracks.
 *
 * Usage:
 *   <gs-anim name="piece-movement" dur="5">
 *     <gs-marker name="setup" t="0"/>
 *     <gs-marker name="capture" t="1.5"/>
 *     <gs-marker name="checkmate" t="3.2"/>
 *     ...tracks...
 *   </gs-anim>
 */
export class GsMarker extends HTMLElement {
  private _markerData: Marker = { name: '', t: 0 };

  connectedCallback() {
    this.parseAttributes()
    this.dispatchEvent(new CustomEvent('gs-marker-ready', {
      detail: { markerData: this._markerData },
      bubbles: true
    }))
  }

  get markerData(): Marker {
    return this._markerData
  }

  get name(): string {
    return this._markerData.name
  }

  get t(): number {
    return this._markerData.t
  }

  private parseAttributes() {
    const name = this.getAttribute('name') || ''
    const t = num(this.getAttribute('t') || '0')

    if (!name) {
      console.warn('[GsMarker] Missing required "name" attribute.')
    }

    this._markerData = { name, t }
  }
}

customElements.define('gs-marker', GsMarker)
