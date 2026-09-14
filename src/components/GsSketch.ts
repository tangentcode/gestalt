import { Point } from '../types'
import { GsShape, generateUUID } from '../shapes/GsShape'
import { GsGroup } from '../shapes/GsGroup'
import { GsCameraShape } from '../shapes/GsCameraShape'
import { Anim, TrackCache, PropTrack, Keyframe, Easing, easingFunctionMap } from '../types/anim'
import { GsDefs } from './GsDefs'
import { bin, num, qsa, und } from '../sh'
import { interpolateColor } from '../utils/colorUtils' // Import color interpolation
import { GsAxes } from './GsAxes'

// List of property names that should be interpolated as colors
const COLOR_PROPERTIES = new Set(['bg', 'sc', 'fc', 'fill', 'stroke'])

// Define linear easing locally or ensure it's imported/available
const linear: Easing = (a:any, z:any, t: number) => a + (z - a) * t // Assuming numeric interpolation

/**
 * GsSketch component that serves as a container for all shapes
 * Wraps an SVG element
 */
export class GsSketch extends HTMLElement {
    private _svg: SVGSVGElement;
    private _bgRect: SVGRectElement; // Background rect that animates on noclip
    private _cameraGroup: SVGGElement; // Wrapper group for camera transform
    public shapesGroup: SVGGElement; // Made public to allow direct access
    private _width: number = 800;
    private _height: number = 600;
    private _bg: string = '#ffffff';
    private _noclip: boolean = false;
    private _x: number = 0;
    private _y: number = 0;
    private _scale: number = 1.0
    private shapes: GsShape[] = []
    private _defs: GsDefs | null = null;
    private _mutationObserver: MutationObserver | null = null;
    private _isRedispatchingAnims: boolean = false; // Re-entry guard
    private _autoPlayAnimName: string | null = null; // Store initial anim name to play
    private _activeCamera: GsCameraShape | null = null; // Currently active camera
    private _bgRectManagedExternally: boolean = false; // When true, noclip changes don't auto-update bgRect
    private _axes: GsAxes = new GsAxes();
    private _geom: boolean = false;
    private _geomGroup!: SVGGElement;

    // #region lifecycle
    static get observedAttributes() {
        // Add 'play' to observed attributes
        return ['width', 'height', 'bg', 'noclip', 'x', 'y', 'scale', 'play', 'geom'];
    }

    constructor() {
        super();

        // Create shadow DOM
        const shadow = this.attachShadow({ mode: 'open' });

        // Create SVG element
        this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._svg.setAttribute('width', `${this._width}px`);
        this._svg.setAttribute('height', `${this._height}px`);
        this._svg.setAttribute('viewBox', `0 0 ${this._width} ${this._height}`);

        // Create background rect (behind everything, animates on noclip)
        this._bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this._bgRect.setAttribute('x', '0');
        this._bgRect.setAttribute('y', '0');
        this._bgRect.setAttribute('width', `${this._width}`);
        this._bgRect.setAttribute('height', `${this._height}`);
        this._bgRect.setAttribute('fill', this._bg);
        // Use CSS transform for animation (SVG attributes can't be animated with CSS transitions)
        this._bgRect.style.transformOrigin = 'center center';
        this._bgRect.style.transformBox = 'fill-box';
        this._bgRect.style.transition = 'transform 300ms ease-in-out';
        this._svg.appendChild(this._bgRect);

        // Create camera group (applies camera transform)
        this._cameraGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this._cameraGroup.setAttribute('id', 'camera-transform');
        this._svg.appendChild(this._cameraGroup);

        // Axes layer (behind shapes, inside camera group so it pans/zooms with content)
        // Axes stay OUTSIDE geomGroup so they can manage their own label orientation
        this._cameraGroup.appendChild(this._axes.element);

        // Geom group: applies translate(W/2,H/2) scale(1,-1) when geom attr is set
        this._geomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this._geomGroup.setAttribute('id', 'geom-transform');
        this._cameraGroup.appendChild(this._geomGroup);

        // Create a group for all shapes (inside geom group)
        this.shapesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.shapesGroup.setAttribute('id', 'shapes-container');
        this._geomGroup.appendChild(this.shapesGroup);

        // Set up shadow DOM
        shadow.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    overflow: hidden;
                    background: ${this._noclip ? this._bg : 'transparent'};
                }

                .sketch-container {
                    position: absolute;
                    transform-origin: top left;
                }

                svg {
                    display: block;
                    border: ${this._noclip ? 'none' : '1px solid #ddd'};
                    background-color: ${this._bg};
                    box-shadow: ${this._noclip ? 'none' : '0 2px 5px rgba(0, 0, 0, 0.1)'};
                    overflow: ${this._noclip ? 'visible' : 'hidden'};
                }

                /* Counter-flip text inside geom-active group so it stays readable */
                .geom-active text {
                    transform-box: fill-box;
                    transform-origin: center;
                    transform: scaleY(-1);
                }
                .geom-active foreignObject > * {
                    transform: scaleY(-1);
                    transform-origin: center;
                }

                /* For debug */
                #debug-overlay {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(0,0,0,0.5);
                    color: white;
                    padding: 5px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 1000;
                }
            </style>
            <div class="sketch-container">
            </div>
        `;

        const container = this.shadowRoot!.querySelector('.sketch-container') as HTMLDivElement;
        container.appendChild(this._svg);
        this.updateTransform();
    }

    connectedCallback() {
        // Ensure nid (node ID / UUID) exists
        if (!this.hasAttribute('nid')) {
            this.setAttribute('nid', generateUUID());
        }

        // Set ID attribute if not already present, derived from nid
        if (!this.hasAttribute('id')) {
            const shortHash = this.nid.replace(/-/g, '').substring(0, 6);
            this.setAttribute('id', `sketch-${shortHash}`);
        }

        // Initial attribute setup
        this._width = parseInt(this.getAttribute('width') ?? '800', 10);
        this._height = parseInt(this.getAttribute('height') ?? '600', 10);
        this._bg = this.getAttribute('bg') ?? '#ffffff';
        this._noclip = this.hasAttribute('noclip');
        this._x = parseFloat(this.getAttribute('x') ?? '0');
        this._y = parseFloat(this.getAttribute('y') ?? '0');
        this._scale = parseFloat(this.getAttribute('scale') ?? '1.0');
        this._geom = this.hasAttribute('geom');
        this._autoPlayAnimName = this.getAttribute('play'); // Read the play attribute

        // Apply initial styles/dimensions
        this.updateSvgDimensions();
        this.updateBackgroundColor();
        this.updateClipping();
        this.updateGeomTransform();
        this.updateTransform();
        this.render();

        // Find initial GsDefs element immediately
        this._defs = this.querySelector<GsDefs>(':scope > gs-defs');
        if (this._defs) {
            this.listenToAnimEvents();
            // GsDefs will dispatch 'anims-updated' when ready, no need to dispatch here
        } else {
            // Dispatch initial empty state if needed by listeners
            this.dispatchAnimsUpdated();
        }

        // Defer shape processing and mutation observer setup
        requestAnimationFrame(() => {
            this.processChildren(); // Process shapes
            this.setupMutationObserver(); // Observe DOM changes

            // Re-check for gs-defs that may have been added before observer was set up
            if (!this._defs) {
                this._defs = this.querySelector<GsDefs>(':scope > gs-defs');
                if (this._defs) this.listenToAnimEvents();
            }

            // Notify children that sketch is ready
            this.querySelectorAll('*').forEach(element => {
                if (typeof (element as any).sketchReadyCallback === 'function') {
                    (element as any).sketchReadyCallback();
                }
            });

            // --- Auto-play logic ---
            if (this._autoPlayAnimName) {
                this.play(this._autoPlayAnimName);
            }
            // --- End Auto-play logic ---

            this.addEventListener('refresh-svg', () => { this.processChildren() })
        })
    }

    disconnectedCallback() {
        this._mutationObserver?.disconnect();
        this.stopListeningToAnimEvents();
        this.removeEventListener('refresh-svg', () => { this.processChildren() });
    }

    /** Start listening for 'anims-updated' from the GsDefs element */
    private listenToAnimEvents(): void {
        if (this._defs) {
            this._defs.addEventListener('anims-updated', this.handleAnimsUpdatedFromAnim as EventListener);
        }
    }

    /** Stop listening for 'anims-updated' from the GsDefs element */
    private stopListeningToAnimEvents(): void {
        if (this._defs) {
            this._defs.removeEventListener('anims-updated', this.handleAnimsUpdatedFromAnim as EventListener);
        }
    }

    /** Handle 'anims-updated' event from GsDefs and re-dispatch from sketch */
    private handleAnimsUpdatedFromAnim = (event: CustomEvent): void => {
        // Prevent recursive dispatch if we're already handling this event
        if (this._isRedispatchingAnims) {
            return;
        }
        this._isRedispatchingAnims = true;

        // Re-dispatch the event from the sketch itself so external listeners can react
        try {
            this.dispatchEvent(new CustomEvent('anims-updated', {
                detail: { anims: event.detail.anims },
                bubbles: true,
                composed: true // Allow crossing shadow DOM boundaries if needed
            }));
        } finally {
             // Ensure the flag is cleared even if an error occurs during dispatch
            this._isRedispatchingAnims = false;
        }
    }

    /** Dispatch a anims-updated event, usually with current state */
    private dispatchAnimsUpdated(): void {
        this.dispatchEvent(new CustomEvent('anims-updated', {
            detail: { anims: this.anims }, // Use the getter which delegates to _defs
            bubbles: true,
            composed: true
        }));
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return;

        switch (name) {
            case 'width':
                this._width = parseInt(newValue, 10) || 800;
                this.updateSvgDimensions();
                break;
            case 'height':
                this._height = parseInt(newValue, 10) || 600;
                this.updateSvgDimensions();
                break;
            case 'bg':
                this._bg = newValue || '#ffffff';
                this.updateBackgroundColor();
                break;
            case 'noclip':
                this._noclip = newValue !== null;
                this.updateClipping();
                break;
            case 'x':
                this._x = parseFloat(newValue) || 0;
                this.updateTransform();
                break;
            case 'y':
                this._y = parseFloat(newValue) || 0;
                this.updateTransform();
                break;
            case 'scale':
                this._scale = parseFloat(newValue) || 1.0;
                this.updateTransform();
                break;
            case 'play':
                // Decide if changing the 'play' attribute dynamically should trigger something.
                // For now, we only handle the initial value in connectedCallback.
                // We could potentially store the new value:
                // this._autoPlayAnimName = newValue;
                // Or even stop the current and play the new one:
                // if (newValue) { this.play(newValue); } else { this.stop(); }
                break;
            case 'geom':
                this._geom = newValue !== null;
                this.updateGeomTransform();
                break;
        }
    }

    // #endregion lifecycle

    // #region Playback Control (Delegation)

    /** Stop the currently playing animation */
    public stop(): void {
        this._defs?.stop();
    }

    /** Play a specific animation anim */
    public play(animName: string): void {
        if (!this._defs) {
            console.warn('[GsSketch] Cannot play, GsDefs child not found.');
            return;
        }
        // Stop any previous playback/listener first
        this.stop();

        // Tell GsDefs to activate the anim and start its internal RAF loop
        const success = this._defs.play(animName);

        if (!success) {
            console.warn(`[GsSketch] Failed to activate/play anim "${animName}".`);
        }
    }

    // #endregion Playback Control

    // #region Animation Playback & Control
    /** Get the current playhead time in seconds */
    get playhead(): number {
        return this._defs?.playhead ?? 0; // Delegate
    }

    /** Set the current playhead time and update shape properties accordingly */
    set playhead(time: number) {
        // Delegate the actual update logic to GsDefs
        if (this._defs) {
            this._defs.playhead = time;
        }
    }

    /** Activate a anim by name, build its cache, and set playhead to 0. Pass null to deactivate. */
    activateAnim(name: string | null): boolean {
        const result = this._defs?.activateAnim(name) ?? false;
        if (result) {
            // Dispatch event from sketch after successful activation in defs
            this.dispatchEvent(new CustomEvent('active-anim-changed', {
                detail: { anim: this.activeAnim },
                bubbles: true,
                composed: true
            }));
        }
        return result;
    }

    /** Get the currently active animation anim (delegated) */
    get activeAnim(): Anim | null {
        return this._defs?.activeAnim ?? null;
    }

    /** Get the map of all available animation anims (delegated) */
    get anims(): Map<string, Anim> {
        return this._defs?.anims ?? new Map();
    }

    /** Get a specific animation anim by name (delegated) */
    getAnim(name: string): Anim | undefined {
        return this._defs?.getAnim(name);
    }

    /** Get the names of all available animation anims (delegated) */
    get animNames(): string[] {
        return this._defs?.getAnimNames() ?? [];
    }
    // #endregion

    // #region accessors
    get svg() : SVGSVGElement {
        return this._svg
    }

    /**
     * Node ID (nid) - a globally unique UUID for this sketch.
     * Used as the primary identifier for database storage.
     */
    get nid(): string {
        return this.getAttribute('nid') || '';
    }
    set nid(value: string) {
        this.setAttribute('nid', value);
    }

    get width(): number {
        return this._width;
    }

    set width(value: number) {
        if (value > 0 && value !== this._width) {
            this._width = value;
            this.updateSvgDimensions();
        }
    }

    get height(): number {
        return this._height;
    }

    set height(value: number) {
        if (value > 0 && value !== this._height) {
            this._height = value;
            this.updateSvgDimensions();
        }
    }

    get bg(): string {
        return this._bg;
    }

    set bg(value: string) {
        if (value !== this._bg) {
            this._bg = value;
            this.setAttribute('bg', value);
            this.updateBackgroundColor();
        }
    }

    get noclip(): boolean {
        return this._noclip;
    }

    set noclip(value: boolean) {
        if (value !== this._noclip) {
            this._noclip = value;
            this.updateClipping();
        }
    }

    get x(): number {
        return this._x;
    }

    set x(value: number) {
        if (this._x !== value) {
            this._x = value;
            this.updateTransform();
        }
    }

    get y(): number {
        return this._y;
    }

    set y(value: number) {
        if (this._y !== value) {
            this._y = value;
            this.updateTransform();
        }
    }

    get scale(): number {
        return this._scale;
    }

    set scale(value: number) {
        // Prevent scaling to zero or negative
        if (value > 0.1 && this._scale !== value) {
            this._scale = value;
            this.updateTransform();
        }
    }

    /**
     * When true, noclip changes won't automatically update bgRect fill.
     * The managing component (e.g., GsToolApp) should call setBgRectFill() at appropriate times.
     */
    get manageBgRectExternally(): boolean {
        return this._bgRectManagedExternally;
    }

    set manageBgRectExternally(value: boolean) {
        this._bgRectManagedExternally = value;
    }

    /**
     * Set the background rectangle fill color directly.
     * Used by GsToolApp to coordinate bgRect visibility with app background transitions.
     */
    public setBgRectFill(fill: string): void {
        if (this._bgRect) {
            this._bgRect.setAttribute('fill', fill);
        }
    }

    get axes(): GsAxes { return this._axes; }
    get axesVisible(): boolean { return this._axes.visible; }
    set axesVisible(v: boolean) {
        this._axes.visible = v;
        if (v) this.updateAxes();
    }

    get geom(): boolean { return this._geom; }
    set geom(value: boolean) {
        if (value === this._geom) return;
        this._geom = value;
        if (value) this.setAttribute('geom', '');
        else this.removeAttribute('geom');
        this.updateGeomTransform();
    }

    /** Convert math-space coordinates to SVG coordinates */
    toSvg(mathX: number, mathY: number): { x: number, y: number } {
        if (!this._geom) return { x: mathX, y: mathY };
        return { x: mathX + this._width / 2, y: this._height / 2 - mathY };
    }

    /** Convert SVG coordinates to math-space coordinates */
    toMath(svgX: number, svgY: number): { x: number, y: number } {
        if (!this._geom) return { x: svgX, y: svgY };
        return { x: svgX - this._width / 2, y: this._height / 2 - svgY };
    }
    // #endregion

    /**
     * Update CSS transform based on x, y, and scale properties
     */
    private updateTransform(): void {
        const container = this.shadowRoot?.querySelector('.sketch-container') as HTMLElement;
        if (container) {
            // Create the CSS transform
            const transform = `translate(${this._x}px, ${this._y}px) scale(${this._scale})`;
            container.style.transform = transform;
        }
        // Emit unified viewport event
        this.dispatchEvent(new CustomEvent('viewport-changed', {
            detail: { x: this._x, y: this._y, scale: this._scale, zoom: Math.round(this._scale * 100) },
            bubbles: true,
            composed: true
        }));
        this.updateAxes();
    }

    /**
     * Apply or remove the geom coordinate transform on the shapes group.
     * When active: origin at center, y-up (math convention).
     */
    private updateGeomTransform(): void {
        if (this._geom) {
            this._geomGroup.setAttribute('transform',
                `translate(${this._width / 2}, ${this._height / 2}) scale(1, -1)`);
            this._geomGroup.classList.add('geom-active');
        } else {
            this._geomGroup.removeAttribute('transform');
            this._geomGroup.classList.remove('geom-active');
        }
        this.updateAxes();
    }

    /**
     * Update axes overlay for the current viewport.
     */
    updateAxes(): void {
        if (!this._axes.visible) return;
        const container = this.shadowRoot?.querySelector('.sketch-container') as HTMLElement;
        if (!container) return;
        const host = this as HTMLElement;
        const viewportW = host.clientWidth || this._width;
        const viewportH = host.clientHeight || this._height;
        this._axes.update(this._scale, viewportW, viewportH, this._x, this._y,
            this._geom ? this._width / 2 : 0,
            this._geom ? this._height / 2 : 0,
            this._geom);
    }

    /**
     * Update background color of the SVG and background rect
     */
    private updateBackgroundColor(): void {
        if (this._svg) {
            this._svg.style.backgroundColor = 'transparent'; // Use rect for background
        }
        if (this._bgRect && !this._bgRectManagedExternally) {
            // When noclip is on, main-content handles the background, so hide bgRect
            this._bgRect.setAttribute('fill', this._noclip ? 'transparent' : this._bg);
        }
    }

    /**
     * Update SVG clipping based on noclip attribute
     */
    private updateClipping(): void {
        // Update host overflow to allow content to extend beyond bounds when noclip
        const host = this as HTMLElement;
        host.style.overflow = this._noclip ? 'visible' : 'hidden';

        // Also update sketch-container overflow
        const container = this.shadowRoot?.querySelector('.sketch-container') as HTMLElement;
        if (container) {
            container.style.overflow = this._noclip ? 'visible' : 'hidden';
        }

        if (this._svg) {
            this._svg.style.overflow = this._noclip ? 'visible' : 'hidden';
            this._svg.style.border = this._noclip ? 'none' : '1px solid #ddd';
            this._svg.style.boxShadow = this._noclip ? 'none' : '0 2px 5px rgba(0, 0, 0, 0.1)';
        }
        // When noclip is on, main-content handles the background, so hide bgRect
        // Skip if managed externally (GsToolApp coordinates the timing to prevent flash)
        if (this._bgRect && !this._bgRectManagedExternally) {
            this._bgRect.setAttribute('fill', this._noclip ? 'transparent' : this._bg);
        }
    }

    /**
     * Update SVG dimensions
     */
    private updateSvgDimensions(): void {
        const widthAttr = this.getAttribute('width');
        const heightAttr = this.getAttribute('height');
        const width = widthAttr ? parseInt(widthAttr, 10) : this._width;
        const height = heightAttr ? parseInt(heightAttr, 10) : this._height;
        this._width = width;
        this._height = height;
        this._svg.setAttribute('width', `${width}px`);
        this._svg.setAttribute('height', `${height}px`);
        // Always initialize the viewBox from the current width and height
        this._svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        // Update background rect size
        this._bgRect.setAttribute('width', `${width}`);
        this._bgRect.setAttribute('height', `${height}`);
        this.updateClipping();
        this.updateGeomTransform();
        const container = this.shadowRoot?.querySelector('.sketch-container') as HTMLElement;
        if (container) {
            container.style.width = `${width}px`;
            container.style.height = `${height}px`;
            this.updateTransform();
        }
    }

    /**
     * Set up mutation observer to monitor changes to child elements (Shapes and GsDefs)
     */
    private setupMutationObserver(): void {
        this._mutationObserver = new MutationObserver((mutations) => {
            let needsShapeUpdate = false;

            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    // Check for GsDefs changes
                    Array.from(mutation.addedNodes).forEach(node => {
                        if (node instanceof GsDefs) {
                            if (this._defs === null) {
                                this._defs = node;
                                this.listenToAnimEvents();
                                // GsDefs will dispatch 'anims-updated' when ready
                            } else {
                                console.error('[GsSketch] Attempted to add a second GsDefs element. Only one is allowed.', node);
                                // Optional: Remove the extra GsDefs?
                            }
                        }
                    });

                    Array.from(mutation.removedNodes).forEach(node => {
                        if (node instanceof GsDefs && node === this._defs) {
                            this.stopListeningToAnimEvents();
                            this._defs = null;
                            this.dispatchAnimsUpdated(); // Dispatch empty anims map
                        }
                    });

                    // Notify newly added shapes so they can finish initialization
                    Array.from(mutation.addedNodes).forEach(node => {
                        if (node instanceof GsShape && typeof (node as any).sketchReadyCallback === 'function') {
                            (node as any).sketchReadyCallback();
                        }
                    });

                    // Check if any added/removed nodes affect shapes
                    const shapeNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
                    if (shapeNodes.some(node => node instanceof GsShape)) {
                         needsShapeUpdate = true;
                    }

                } else if (mutation.type === 'attributes' && mutation.target instanceof GsShape) {
                    // Update the SVG representation for the changed shape attribute
                    this.updateShapeSvg(mutation.target as GsShape);
                }
            });

            if (needsShapeUpdate) {
                this.processChildren(); // Re-process shapes if shape list changed
            }
        });

        // Observe direct children for additions/removals (GsDefs, GsShape, GsGroup)
        // Observe subtree for attribute changes *on shapes* specifically
        this._mutationObserver.observe(this, {
            childList: true,
            attributes: true, // Still need this for shape attributes
            subtree: true,   // Still need this for shape attributes
            attributeFilter: ['x', 'y', 'w', 'h', 'cx', 'cy', 'r', 'width', 'height', 'sc', 'fc', 'text', 'size', 'transform'] // Keep shape attributes
        });
    }

    /**
     * Process child elements - this method needs to preserve the group structure
     */
    private processChildren(): void {
        // Clear existing shapes array while preserving children
        this.shapes = [];

        // Important: Don't completely clear shapesGroup - instead track and update
        const existingSvgElements = new Map<string, SVGElement>();

        // Store existing elements by their shape ID
        Array.from(this.shapesGroup.children).forEach(child => {
            const shapeId = child.getAttribute('data-shape-id');
            if (shapeId) {
                existingSvgElements.set(shapeId, child as SVGElement);
            }
        });

        // Clear only elements that don't have corresponding shapes
        const childIds = new Set<string>();
        Array.from(this.children).forEach(child => {
            if (child instanceof GsShape && child.id) {
                childIds.add(child.id);
            }
        });

        // Remove elements that don't have corresponding shapes
        Array.from(existingSvgElements.entries()).forEach(([id, element]) => {
            if (!childIds.has(id) && element.parentElement === this.shapesGroup) {
                this.shapesGroup.removeChild(element);
            }
        });

        // Track which IDs we've already processed (handles duplicate-ID children)
        const processedIds = new Set<string>();

        // Process each direct child element and update or create SVG elements
        Array.from(this.children).forEach(child => {
            if (child instanceof GsShape) {
                // Add shape to internal array
                this.shapes.push(child);

                // Skip duplicate-ID shapes (only process first instance)
                if (child.id && processedIds.has(child.id)) return;
                if (child.id) processedIds.add(child.id);

                const existingWrapper = child.id ? existingSvgElements.get(child.id) : null;
                const shapeSvg = child.getSvgElement();

                // We must check shape INSTANCE, not just ID. When shapes are removed
                // and new shapes with the same IDs are created (e.g., re-running a
                // script), the wrapper still exists but contains SVG from the old
                // shape instance. Matching by ID alone would call updateShapeSvg()
                // which only re-renders - it doesn't replace the stale SVG element.
                if (existingWrapper && shapeSvg && existingWrapper.contains(shapeSvg)) {
                    // Same shape instance - just update
                    this.updateShapeSvg(child);
                } else {
                    // Either no wrapper, or wrapper contains stale SVG from old shape
                    if (existingWrapper && existingWrapper.parentElement === this.shapesGroup) {
                        this.shapesGroup.removeChild(existingWrapper);
                    }
                    this.createShapeSvg(child);
                }
            }
        });
    }

    /**
     * Create SVG representation for a shape
     */
    private createShapeSvg(shape: GsShape): void {
        try {
            shape.render();
            const svgElement = shape.getSvgElement();
            if (svgElement) {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.setAttribute('data-shape-id', shape.id);
                if (shape instanceof GsGroup) {
                    group.classList.add('shape-group', 'gs-group-container');
                }
                group.appendChild(svgElement);
                this.shapesGroup.appendChild(group);
            } else {
                // create a "fallback" shape if it's not a proper GsShape for some reason
                const x = shape.hasAttribute('x') ? parseFloat(shape.getAttribute('x') || '0') : 100;
                const y = shape.hasAttribute('y') ? parseFloat(shape.getAttribute('y') || '0') : 100;
                const fallbackCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                fallbackCircle.setAttribute('cx', x.toString());
                fallbackCircle.setAttribute('cy', y.toString());
                fallbackCircle.setAttribute('r', '8');
                fallbackCircle.setAttribute('fill', '#ff5722');
                fallbackCircle.setAttribute('stroke', '#ffffff');
                fallbackCircle.setAttribute('stroke-width', '2');
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.setAttribute('data-shape-id', shape.id);
                group.appendChild(fallbackCircle);
                this.shapesGroup.appendChild(group);
            }
        } catch (error) {
            console.error('Error adding shape to SVG:', error);
        }
    }

    /**
     * Update SVG representation for a shape
     */
    private updateShapeSvg(shape: GsShape): void {
        try {
            if (shape instanceof GsGroup) {
                const shapeGroup = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`);
                if (shapeGroup) {
                    const transformVal = shape.getAttribute('transform');
                    if (transformVal) {
                        shapeGroup.setAttribute('transform', transformVal);
                    }
                } else {
                    const groupElement = shape.getSvgElement();
                    groupElement.setAttribute('data-shape-id', shape.id);
                    this.shapesGroup.appendChild(groupElement);
                }
                return;
            }
            const shapeGroup = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`);
            if (shapeGroup) {
                shape.render();
            } else {
                this.createShapeSvg(shape);
            }
        } catch (error) {
            console.error(`Error updating SVG for shape ${shape.id}:`, error);
        }
    }

    /**
     * Convert client coordinates to SVG coordinates, taking into account the
     * current transform (translation and scale)
     */
    clientToSvgCoordinates(clientX: number, clientY: number): { x: number, y: number } {
        const svgPoint = this._svg.createSVGPoint();
        svgPoint.x = clientX;
        svgPoint.y = clientY;
        // Use geomGroup CTM so coords include the geom transform (center + y-flip)
        const ctm = this._geomGroup.getScreenCTM();
        if (!ctm) return { x: clientX, y: clientY };
        const inverse = ctm.inverse();
        const transformed = svgPoint.matrixTransform(inverse);
        return { x: transformed.x, y: transformed.y };
    }

    /**
     * Convert SVG coordinates to client coordinates, accounting for transform
     */
    svgToClientCoordinates(svgX: number, svgY: number): { x: number, y: number } {
        const svgPoint = this._svg.createSVGPoint();
        svgPoint.x = svgX;
        svgPoint.y = svgY;
        // Use geomGroup CTM so coords include the geom transform (center + y-flip)
        const ctm = this._geomGroup.getScreenCTM();
        if (!ctm) return { x: svgX, y: svgY };
        const transformed = svgPoint.matrixTransform(ctm);
        return { x: transformed.x, y: transformed.y };
    }

    /**
     * Center the sketch in its container
     */
    centerContent(): void {
        const containerRect = this.getBoundingClientRect();

        // Calculate center position
        this.x = (containerRect.width - this._width * this._scale) / 2;
        this.y = (containerRect.height - this._height * this._scale) / 2;
    }

    /**
     * Add a shape to the sketch
     */
    addShape(shape: GsShape): void {
        try {
            if (!this.contains(shape)) {
                this.appendChild(shape);
            }
            if (this.shapes.indexOf(shape) === -1) {
                this.shapes.push(shape);
                this.createShapeSvg(shape);
            }
        } catch (error) {
            console.error('Error adding shape to sketch:', error);
        }
    }

    /**
     * Remove a shape from the sketch
     */
    removeShape(shape: GsShape): void {
        try {
            if (this.contains(shape)) {
                this.removeChild(shape);
            }
            const index = this.shapes.indexOf(shape);
            if (index !== -1) {
                this.shapes.splice(index, 1);
            }
            const shapeGroup = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`);
            if (shapeGroup) {
                this.shapesGroup.removeChild(shapeGroup);
            }
        } catch (error) {
            console.error('[GsSketch] Error removing shape:', error);
        }
    }

    /**
     * Get all shapes in the sketch
     */
    getShapes(): GsShape[] {
        // Return our internal array instead of searching DOM
        return this.shapes;
    }

    /**
     * Fetch a shape by its ID
     * @param id
     * @returns GsShape or null if not found
     */
    getShapeById(id: string): GsShape | null {
        return this.querySelector('#'+id) as GsShape;
    }

    /**
     * Fetch a shape by path, drilling down into clones
     * @param path Path like "x/y/z" where segments are shape IDs
     * @returns GsShape or null if not found
     */
    getShapeByPath(path: string): GsShape | null {
        if (!path) return null;

        const segments = path.split('/').filter(segment => segment.length > 0);
        if (segments.length === 0) return null;

        // Start with the first segment in this sketch
        const firstId = segments[0];
        const firstShape = this.getShapeById(firstId);

        if (!firstShape) return null;

        // If this is the only segment, return the shape
        if (segments.length === 1) {
            return firstShape;
        }

        // If there are more segments, check if this shape supports path resolution
        // This handles both GsClone and any future shape types that support nested shapes
        if (typeof (firstShape as any).getShapeByPath === 'function') {
            const remainingPath = segments.slice(1).join('/');
            return (firstShape as any).getShapeByPath(remainingPath);
        }

        // If it doesn't support path resolution but we have more segments, the path is invalid
        return null;
    }

    /**
     * Find a shape at the given position
     * @param point The point to check (should be in SVG coordinates)
     * @param excludeShapes Optional array of shapes to exclude from the search
     * @returns The first shape found at the position, or null
     */
    findShapeAt(point: Point, excludeShapes: GsShape[] = []): GsShape | null {
        try {
            let svgPoint = point;
            if (point.clientX !== undefined && point.clientY !== undefined) {
                svgPoint = this.clientToSvgCoordinates(point.clientX, point.clientY);
            }
            const excludeIds = new Set(excludeShapes.map(s => s.id));
            const shapes = [...this.getShapes()].reverse();
            for (const shape of shapes) {
                if (excludeIds.has(shape.id)) continue;
                if (shape.locked) continue; // Skip locked shapes
                // Skip shapes that are nested inside other nodes (they'll be found via findNestedShapeAt)
                if (shape.parentElement && shape.parentElement !== this) continue;
                if (typeof shape.hitTest !== 'function') continue;
                if (shape.hitTest(svgPoint)) {
                    if (typeof (shape as any).findNestedShapeAt === 'function') {
                        const nested = (shape as any).findNestedShapeAt(svgPoint, excludeIds);
                        if (nested) return nested;
                    }
                    return shape;
                }
            }
            return null;
        } catch (error) {
            console.error('[GsSketch] Error in findShapeAt:', error);
            return null;
        }
    }
    /**
     * Render the sketch
     */
    render(): void {
        // Update the SVG background color
        this._svg.style.backgroundColor = this._bg;
        this._svg.style.overflow = this._noclip ? 'visible' : 'hidden';
        this._svg.style.position = 'relative'; // Ensure proper stacking context

        // Ensure all shape groups are visible
        const shapeGroups = this.shapesGroup.querySelectorAll('.shape-group');
        shapeGroups.forEach(group => {
            (group as HTMLElement).style.visibility = 'visible';
            (group as HTMLElement).style.overflow = 'visible';
            (group as HTMLElement).style.pointerEvents = 'all';
        });
    }

    // #region shape order
    public bringToFront(shape: GsShape): void {
        if (!this.contains(shape)) return;
        const index = this.shapes.indexOf(shape);
        if (index > -1) {
            this.shapes.splice(index, 1);
            this.shapes.push(shape);
        }
        this.removeChild(shape);
        this.appendChild(shape);
        const group = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`) || shape;
        this.shapesGroup.appendChild(group);
    }

    public sendToBack(shape: GsShape): void {
        if (!this.contains(shape)) return;
        const index = this.shapes.indexOf(shape);
        if (index > -1) {
            this.shapes.splice(index, 1);
            this.shapes.unshift(shape);
        }
        this.removeChild(shape);
        this.insertBefore(shape, this.firstChild);
        const group = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`) || shape;
        this.shapesGroup.prepend(group);
    }

    public sendForward(shape: GsShape): void {
        if (!this.contains(shape)) return;
        const index = this.shapes.indexOf(shape);
        if (index === -1 || index === this.shapes.length - 1) return;

        // Move in shapes array
        this.shapes.splice(index, 1);
        this.shapes.splice(index + 1, 0, shape);

        // Move in DOM
        const nextShape = this.shapes[index + 1];
        if (nextShape) {
            this.removeChild(shape);
            this.insertBefore(shape, nextShape.nextSibling);
        }

        // Move in SVG
        const group = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`);
        if (group) {
            const nextGroup = this.shapesGroup.querySelector(`g[data-shape-id="${nextShape.id}"]`);
            if (nextGroup && nextGroup.nextSibling) {
                this.shapesGroup.insertBefore(group, nextGroup.nextSibling);
            } else {
                this.shapesGroup.appendChild(group);
            }
        }
    }

    public sendBackward(shape: GsShape): void {
        if (!this.contains(shape)) return;
        const index = this.shapes.indexOf(shape);
        if (index <= 0) return;

        // Move in shapes array
        this.shapes.splice(index, 1);
        this.shapes.splice(index - 1, 0, shape);

        // Move in DOM
        const prevShape = this.shapes[index - 2]; // -2 because we already moved the shape
        if (prevShape) {
            this.removeChild(shape);
            this.insertBefore(shape, prevShape.nextSibling);
        } else {
            this.removeChild(shape);
            this.insertBefore(shape, this.firstChild);
        }

        // Move in SVG
        const group = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`);
        if (group) {
            const prevGroup = this.shapesGroup.querySelector(`g[data-shape-id="${prevShape?.id}"]`);
            if (prevGroup) {
                this.shapesGroup.insertBefore(group, prevGroup.nextSibling);
            } else {
                this.shapesGroup.insertBefore(group, this.shapesGroup.firstChild);
            }
        }
    }

    /**
     * Get the z-index (position in shapes array) of a shape
     */
    public getShapeZIndex(shape: GsShape): number {
        return this.shapes.indexOf(shape);
    }

    /**
     * Set the z-index (position in shapes array) of a shape
     */
    public setShapeZIndex(shape: GsShape, zIndex: number): void {
        if (!this.contains(shape)) return;
        const currentIndex = this.shapes.indexOf(shape);
        if (currentIndex === -1) return;

        // Remove from current position
        this.shapes.splice(currentIndex, 1);

        // Insert at new position (clamped)
        const newIndex = Math.max(0, Math.min(zIndex, this.shapes.length));
        this.shapes.splice(newIndex, 0, shape);

        // Update DOM
        this.removeChild(shape);
        if (newIndex === 0) {
            this.insertBefore(shape, this.firstChild);
        } else if (newIndex >= this.shapes.length - 1) {
            this.appendChild(shape);
        } else {
            const refShape = this.shapes[newIndex + 1];
            if (refShape) {
                this.insertBefore(shape, refShape);
            } else {
                this.appendChild(shape);
            }
        }

        // Update SVG
        const group = this.shapesGroup.querySelector(`g[data-shape-id="${shape.id}"]`) || shape;
        if (newIndex === 0) {
            this.shapesGroup.insertBefore(group, this.shapesGroup.firstChild);
        } else if (newIndex >= this.shapes.length - 1) {
            this.shapesGroup.appendChild(group);
        } else {
            const refShape = this.shapes[newIndex + 1];
            const refGroup = this.shapesGroup.querySelector(`g[data-shape-id="${refShape.id}"]`);
            if (refGroup) {
                this.shapesGroup.insertBefore(group, refGroup);
            } else {
                this.shapesGroup.appendChild(group);
            }
        }
    }
    // #endregion

    /**
     * Export the sketch as a PNG image
     * @returns Promise that resolves with the data URL of the PNG image
     */
    public exportAsPNG(): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // Create a new canvas element
                const canvas = document.createElement('canvas');
                canvas.width = this._width;
                canvas.height = this._height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Set background color
                ctx.fillStyle = this._bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Convert SVG to data URL
                const svgData = new XMLSerializer().serializeToString(this._svg);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                // Create image from SVG
                const img = new Image();
                img.onload = () => {
                    // Draw the image onto the canvas
                    ctx.drawImage(img, 0, 0);

                    // Convert canvas to data URL
                    const dataURL = canvas.toDataURL('image/png');

                    // Clean up
                    URL.revokeObjectURL(url);

                    // Resolve with data URL
                    resolve(dataURL);
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to load SVG as image'));
                };

                img.src = url;
            } catch (error) {
                reject(error);
            }
        });
    }

    // #region camera
    /**
     * Set the active camera by id.
     * Pass null to disable camera transform.
     */
    setActiveCamera(cameraId: string | null): void {
        if (!cameraId) {
            this._activeCamera = null;
            this.updateCameraTransform();
            return;
        }

        // Find camera element by id
        const camera = this.querySelector(`gs-camera#${cameraId}`) as GsCameraShape | null;
        if (camera) {
            this._activeCamera = camera;
            this.updateCameraTransform();
        } else {
            console.warn(`[GsSketch] Camera "${cameraId}" not found`);
        }
    }

    /**
     * Get the currently active camera, if any.
     */
    get activeCamera(): GsCameraShape | null {
        return this._activeCamera;
    }

    /**
     * Update the camera group transform based on the active camera.
     * Called when camera properties change or active camera changes.
     */
    updateCameraTransform(): void {
        if (!this._activeCamera) {
            this._cameraGroup.removeAttribute('transform');
            return;
        }

        const transform = this._activeCamera.getTransformString(this._width, this._height);
        this._cameraGroup.setAttribute('transform', transform);
    }
    // #endregion
}

customElements.define('gs-sketch', GsSketch);
