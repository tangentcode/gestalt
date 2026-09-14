import { GsSketch } from "../components/GsSketch";

/**
 * GsApp component that provides a base container for sketches
 * Serves as the foundation for more specialized app types
 */
export class GsApp extends HTMLElement {
    protected _sketch: GsSketch | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        this.render();
    }

    /**
     * Initialize when element is added to DOM
     */
    connectedCallback() {
        this.updateSketchReference();
    }

    // #region  accessors
    get sketch(): GsSketch {
        return this._sketch!;
    }
    // #endregion

    /**
     * Update the reference to the sketch element
     */
    protected updateSketchReference(): void {
        const content = this.shadowRoot?.querySelector('slot');
        if (content) {
            const elements = content.assignedElements();

            // Try to find a sketch element in the assigned elements
            for (const element of elements) {
                if (element.tagName.toLowerCase() === 'gs-sketch') {
                    this._sketch = element as GsSketch;
                    break;
                }

                // Check if there's a sketch inside the element
                const nestedSketch = element.querySelector('gs-sketch');
                if (nestedSketch) {
                    this._sketch = nestedSketch as GsSketch;
                    break;
                }
            }
        }
    }

    /**
     * Render the app
     * Basic app just contains a slot for a sketch
     */
    render(): void {
        if (this.shadowRoot) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: block;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                    }
                </style>
                <slot></slot>
            `;
        }
    }
}

customElements.define('gs-app', GsApp);