import { GsShape } from './GsShape';
import { GsEdgeShape } from './GsEdgeShape';
import { HandleSpec, Point } from '../types';
import { GsRectShape } from './GsRectShape';
import { GsEllipseShape } from './GsEllipseShape';
import { GsChevronShape } from './GsChevronShape';
import { GsRhombusShape } from './GsRhombusShape';
import { GsTextShape } from './GsTextShape';

export type NodeShapeType = 'rectangle' | 'ellipse' | 'chevron' | 'rhombus' | 'roundRect';

type BackingShapeType = GsRectShape | GsEllipseShape | GsChevronShape | GsRhombusShape;

/**
GsNodeShape is a graph component.

- Appears as a rectangle or ellipse, possibly with rounded corners.
- Nodes have edges, which are arrows pointing to other nodes.
- Dragging a node redraws the edges so they remain connected.
- It has a sc (stroke-color) and fc (fill-color), which can be set to any valid CSS color.
- It may have a label
- Other nodes may be dropped into the node.
*/

export class GsNodeShape extends GsShape {
    private _backingShape: BackingShapeType;
    private _shapeType: NodeShapeType = 'rectangle';
    private _textShape: GsTextShape;
    private _padH: number = 4;
    private _padW: number = 4;
    private _childG: SVGGElement | null = null;
    private _br: number = 2;
    private _incomingEdges: GsEdgeShape[] = [];
    private _outgoingEdges: GsEdgeShape[] = [];
    private _strokeWidth: number = 1;
    private _gapSize = 5;
    private _childTreeChanged: boolean = false;
    private _mutationObserver: MutationObserver | null = null;
    // Cache bounding box for ellipse mode
    private _x: number = 0;
    private _y: number = 0;
    private _w: number = 100;
    private _h: number = 40;

    // Deferred dimensions for load-time attribute ordering
    private _deferredW: number | null = null;
    private _deferredH: number | null = null;
    private _isReady: boolean = false;
    private _hasExplicitSize: boolean = false;

    // #region lifecycle
    static get observedAttributes() {
        return [...super.observedAttributes, 'x', 'y', 'w', 'h', 'text', 'br', 'shape-type', 'stroke-style', 'stroke-width', 'tc', 'font', 'font-size', 'bold', 'italic', 'underline', 'strike'];
    }

    constructor() {
        super();

        this._backingShape = new GsRectShape();

        this._backingShape.sc = this._sc;
        this._backingShape.fc = this._fc;

        this._textShape = new GsTextShape();
        this._textShape.text = '';
        this._textShape.sc = this._sc;
        this._textShape.textAnchor = 'middle';
        this._textShape.dominantBaseline = 'central';

        this._el = this.createSvgElement<SVGGElement>('g');
        this._childG = this.createSvgElement<SVGGElement>('g');
        this._childG.setAttribute('class', 'gs-node-children');
        this._textShape.render();
        const textEl = this._textShape.getSvgElement();
        if (textEl) {
            this._childG.appendChild(textEl);
        }

        this._el = this._el;
        // Avoid setAttribute during construction (custom elements spec)
        this._br = 2;

        // Don't call updateLayoutAndRender here - let attribute processing happen first
        // updateLayoutAndRender();

        // Set up mutation observer with more specific targeting to avoid infinite loops
        this._setupMutationObserver();
    }

    private _setupMutationObserver(): void {
        this._mutationObserver = new MutationObserver((mutations) => {
            // Only react to child node additions/removals, not to DOM manipulation during rendering
            const hasRelevantChanges = mutations.some(mutation => {
                if (mutation.type === 'childList') {
                    // Check if added/removed nodes are GsShape instances (any shape type)
                    const relevantNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
                        .filter(node => node instanceof GsShape);
                    return relevantNodes.length > 0;
                }
                return false;
            });

            if (hasRelevantChanges) {
                this._childTreeChanged = true;
                // Use requestAnimationFrame to debounce layout updates
                requestAnimationFrame(() => {
                    if (this._childTreeChanged) {
                        this.updateLayout();
                        this._childTreeChanged = false;
                    }
                });
            }
        });

        // Only observe child node changes, not the entire subtree
        this._mutationObserver.observe(this, {
            childList: true,
            subtree: false, // Don't observe subtree to avoid SVG manipulation events
            attributes: false
        });
    }

    private _disconnectObserver(): void {
        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
        }
    }

    private _reconnectObserver(): void {
        if (this._mutationObserver) {
            this._disconnectObserver();
            this._setupMutationObserver();
        }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue) return;

        switch (name) {
            case 'x':
                this.x = parseFloat(newValue);
                break;
            case 'y':
                this.y = parseFloat(newValue);
                break;
            case 'w':
                if (this._isReady) {
                    this.w = parseFloat(newValue);
                } else {
                    this._deferredW = parseFloat(newValue);
                }
                break;
            case 'h':
                if (this._isReady) {
                    this.h = parseFloat(newValue);
                } else {
                    this._deferredH = parseFloat(newValue);
                }
                break;
            case 'text':
                this._textShape.text = newValue;
                this.render();
                break;
            case 'br':
                this.br = parseFloat(newValue);
                break;
            case 'fc':
                this.fc = newValue;
                break;
            case 'shape-type':
                this.shapeType = newValue as NodeShapeType;
                break;
            case 'data-drop-target':
                if (newValue === 'true') {
                    this._backingShape.setAttribute('stroke-dasharray', '4 2');
                    this._backingShape.setAttribute('stroke-width', '2');
                } else {
                    this._backingShape.removeAttribute('stroke-dasharray');
                    this._backingShape.removeAttribute('stroke-width');
                }
                break;
            case 'stroke-style':
                // VUE stroke styles: 0=solid, 1=dashed, 2=dotted
                const style = parseInt(newValue || '0', 10);
                const el = this._backingShape.getSvgElement();
                if (el) {
                    if (style === 1) {
                        el.setAttribute('stroke-dasharray', '6 3');
                    } else if (style === 2) {
                        el.setAttribute('stroke-dasharray', '2 2');
                    } else {
                        el.removeAttribute('stroke-dasharray');
                    }
                }
                break;
            case 'stroke-width':
                this._strokeWidth = parseFloat(newValue) || 0;
                this.render();
                break;
            case 'tc':
                // Text color (separate from stroke color)
                this._textShape.sc = newValue;
                break;
            case 'font':
                this._textShape.font = newValue;
                this.render();
                break;
            case 'font-size':
                this._textShape.setAttribute('size', newValue);
                this.render();
                break;
            case 'bold':
                this._textShape.bold = newValue !== null;
                this.render();
                break;
            case 'italic':
                this._textShape.italic = newValue !== null;
                this.render();
                break;
            case 'underline':
                this._textShape.underline = newValue !== null;
                this.render();
                break;
            case 'strike':
                this._textShape.strike = newValue !== null;
                this.render();
                break;
        }
    }

    sketchReadyCallback(): void {
        super.sketchReadyCallback();

        // Initialize child shapes (any GsShape type, not just nodes)
        Array.from(this.children).forEach(child => {
            if (child instanceof GsShape) {
                child.sketchReadyCallback();
            }
        });

        // Mark as ready before applying deferred dimensions
        this._isReady = true;

        // Apply deferred w/h AFTER text has been processed
        // This ensures explicit dimensions override text-based auto-sizing
        const hadDeferredSize = this._deferredW !== null || this._deferredH !== null;
        if (this._deferredW !== null) {
            this._w = this._deferredW;
            this._deferredW = null;
        }
        if (this._deferredH !== null) {
            this._h = this._deferredH;
            this._deferredH = null;
        }
        // Mark as having explicit size so arrangeChildNodes won't enforce minimums
        if (hadDeferredSize) {
            this._hasExplicitSize = true;
        }

        this._syncBackingShape();

        // When loaded from file with explicit dimensions, skip child repositioning
        // (children already have correct positions from their saved attributes)
        if (hadDeferredSize) {
            this.arrangeText();
            this.render();
        } else {
            this.updateLayoutAndRender();
        }
    }

    disconnectedCallback(): void {
        // Clean up the mutation observer when the element is removed
        this._disconnectObserver();
        this._mutationObserver = null;
    }
    // #endregion lifecycle

    // #region handles
    // Handle accessors compute from cached x, y, w, h for compatibility with both shape types

    get pt_nw(): Point { return { x: this._x, y: this._y }; }
    set pt_nw(point: Point) {
        const fixed = this.pt_se;
        this._x = Math.min(point.x, fixed.x);
        this._y = Math.min(point.y, fixed.y);
        this._w = Math.abs(fixed.x - point.x);
        this._h = Math.abs(fixed.y - point.y);
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_ne(): Point { return { x: this._x + this._w, y: this._y }; }
    set pt_ne(point: Point) {
        const fixed = this.pt_sw;
        this._x = Math.min(point.x, fixed.x);
        this._y = Math.min(point.y, fixed.y);
        this._w = Math.abs(point.x - fixed.x);
        this._h = Math.abs(fixed.y - point.y);
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_se(): Point { return { x: this._x + this._w, y: this._y + this._h }; }
    set pt_se(point: Point) {
        const fixed = this.pt_nw;
        this._x = Math.min(point.x, fixed.x);
        this._y = Math.min(point.y, fixed.y);
        this._w = Math.abs(point.x - fixed.x);
        this._h = Math.abs(point.y - fixed.y);
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_sw(): Point { return { x: this._x, y: this._y + this._h }; }
    set pt_sw(point: Point) {
        const fixed = this.pt_ne;
        this._x = Math.min(point.x, fixed.x);
        this._y = Math.min(point.y, fixed.y);
        this._w = Math.abs(fixed.x - point.x);
        this._h = Math.abs(point.y - fixed.y);
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_n(): Point { return { x: this._x + this._w / 2, y: this._y }; }
    set pt_n(point: Point) {
        const oldBottom = this._y + this._h;
        this._y = point.y;
        this._h = oldBottom - point.y;
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_s(): Point { return { x: this._x + this._w / 2, y: this._y + this._h }; }
    set pt_s(point: Point) {
        this._h = point.y - this._y;
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_e(): Point { return { x: this._x + this._w, y: this._y + this._h / 2 }; }
    set pt_e(point: Point) {
        this._w = point.x - this._x;
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    get pt_w(): Point { return { x: this._x, y: this._y + this._h / 2 }; }
    set pt_w(point: Point) {
        const oldRight = this._x + this._w;
        this._x = point.x;
        this._w = oldRight - point.x;
        this._syncBackingShape();
        this._persistBounds();
        this.updateLayoutAndRender();
    }

    /** Persist x, y, w, h to DOM attributes for serialization */
    private _persistBounds(): void {
        this.setAttribute('x', this._x.toFixed(2));
        this.setAttribute('y', this._y.toFixed(2));
        this.setAttribute('w', this._w.toFixed(2));
        this.setAttribute('h', this._h.toFixed(2));
        // Mark as explicit size so arrangeChildNodes won't enforce text-based minimums
        this._hasExplicitSize = true;
    }
    // #endregion handles

    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement<SVGGElement>('g');
            this._childG = this.createSvgElement<SVGGElement>('g');
            this._childG.setAttribute('class', 'gs-node-children');
            this._el = this._el;
        }

        // Clear existing content
        while (this._el.firstChild) {
            this._el.removeChild(this._el.firstChild);
        }
        // Render rectangle background
        this._backingShape.render();
        const rectEl = this._backingShape.getSvgElement();
        if (rectEl) {
            // Apply stroke width (0 disables stroke)
            if (this._strokeWidth === 0) {
                rectEl.setAttribute('stroke', 'none');
            } else {
                rectEl.setAttribute('stroke-width', this._strokeWidth.toString());
            }
            this._el.appendChild(rectEl);
        }
        this._textShape.render();
        const textEl = this._textShape.getSvgElement();
        if (textEl) {
            this._el.appendChild(textEl);
        }

        // Add child group container
        this._el.appendChild(this._childG!);

        // Populate _childG with child shapes' SVG
        while (this._childG!.firstChild) {
            this._childG!.removeChild(this._childG!.firstChild);
        }
        const childShapes = this.getChildShapes();
        for (const child of childShapes) {
            const childSvg = child.getSvgElement();
            if (childSvg) {
                this._childG!.appendChild(childSvg.cloneNode(true));
            }
        }
        // Nested children appear slightly smaller with alternating brightness
        // Even depth (0, 2, 4...): children darker, Odd depth (1, 3, 5...): children lighter
        if (childShapes.length > 0) {
            const cx = this._x + this._w / 2;
            const cy = this._y + this._h / 2;
            const s = 0.8;
            const nudge = this._h * 0.08;

            // Compute nesting depth by counting GsNodeShape ancestors
            let depth = 0;
            let ancestor: Element | null = this.parentElement;
            while (ancestor) {
                if (ancestor instanceof GsNodeShape) depth++;
                ancestor = ancestor.parentElement;
            }
            // Alternate brightness: even depth → darker children, odd → lighter
            const brightness = depth % 2 === 0 ? 0.92 : 1.08;
            (this._childG as any).style.filter = `brightness(${brightness})`;

            this._childG!.setAttribute('transform',
                `translate(${cx}, ${cy - nudge}) scale(${s}) translate(${-cx}, ${-cy})`);
        } else {
            (this._childG as any).style.filter = '';
            this._childG!.removeAttribute('transform');
        }

        // Update the group's shape-id attribute for easier lookup
        this._el.setAttribute('data-shape-id', this.id);
        this._el.setAttribute('class', 'gs-node-container');

        // Strip stale 'visibility:visible' from inline style (left by text editing mixin)
        if (this.style.visibility === 'visible') this.style.removeProperty('visibility')

        // NOTE: We do NOT append this._el to light DOM.
        // SVG is returned via getSvgElement() and managed by GsSketch in shadow DOM.
        // This prevents SVG from being serialized along with nested custom elements.
    }

    getSvgElement(): SVGGElement | null {
        this.render();
        return this._el as SVGGElement;
    }

    // #region accessors

    get shapeType(): NodeShapeType { return this._shapeType; }
    set shapeType(value: NodeShapeType) {
        if (value === this._shapeType) return;

        // Save current state
        const oldX = this.x;
        const oldY = this.y;
        const oldW = this.w;
        const oldH = this.h;
        const oldSc = this._sc;
        const oldFc = this._fc;

        this._shapeType = value;

        // Create new backing shape
        switch (value) {
            case 'ellipse':
                this._backingShape = new GsEllipseShape();
                break;
            case 'chevron':
                this._backingShape = new GsChevronShape();
                break;
            case 'rhombus':
                this._backingShape = new GsRhombusShape();
                break;
            case 'roundRect':
                this._backingShape = new GsRectShape();
                (this._backingShape as GsRectShape).br = 8; // Rounded corners
                break;
            case 'rectangle':
            default:
                this._backingShape = new GsRectShape();
                break;
        }

        // Restore state to new shape
        this._backingShape.sc = oldSc;
        this._backingShape.fc = oldFc;
        this._x = oldX;
        this._y = oldY;
        this._w = oldW;
        this._h = oldH;
        this._syncBackingShape();

        this.setAttribute('shape-type', value);
        this.updateLayoutAndRender();
    }

    /** Sync the backing shape coordinates from cached x, y, w, h */
    private _syncBackingShape(): void {
        if (this._backingShape instanceof GsEllipseShape) {
            // Ellipse uses center + radii
            const ellipse = this._backingShape as GsEllipseShape;
            ellipse._cx = this._x + this._w / 2;
            ellipse._cy = this._y + this._h / 2;
            ellipse._rx = this._w / 2;
            ellipse._ry = this._h / 2;
        } else if (this._backingShape instanceof GsChevronShape) {
            // Chevron uses x, y, width, height
            const chevron = this._backingShape as GsChevronShape;
            chevron.x = this._x;
            chevron.y = this._y;
            chevron.width = this._w;
            chevron.height = this._h;
        } else if (this._backingShape instanceof GsRhombusShape) {
            // Rhombus uses x, y, width, height
            const rhombus = this._backingShape as GsRhombusShape;
            rhombus.x = this._x;
            rhombus.y = this._y;
            rhombus.width = this._w;
            rhombus.height = this._h;
        } else {
            // Rectangle uses x, y, width, height
            const rect = this._backingShape as GsRectShape;
            rect.setAttribute('x', this._x.toString());
            rect.setAttribute('y', this._y.toString());
            rect.setAttribute('width', this._w.toString());
            rect.setAttribute('height', this._h.toString());
        }
    }

    get x(): number { return this._x; }
    set x(value: number) {
        this._x = value;
        this._syncBackingShape();
        this.setAttribute('x', value.toFixed(2));
        this.updateLayoutAndRender();
    }

    get y(): number { return this._y; }
    set y(value: number) {
        this._y = value;
        this._syncBackingShape();
        this.setAttribute('y', value.toFixed(2));
        this.updateLayoutAndRender();
    }

    get w(): number { return this._w; }
    set w(value: number) {
        const minWidth = this.getMinimumWidth();
        const finalWidth = Math.max(value, minWidth);
        this._w = finalWidth;
        this._syncBackingShape();
        this.setAttribute('w', finalWidth.toFixed(2));
        this.updateLayoutAndRender();
    }

    get h(): number { return this._h; }
    set h(value: number) {
        const minHeight = this.getMinimumHeight();
        const finalHeight = Math.max(value, minHeight);
        this._h = finalHeight;
        this._syncBackingShape();
        this.setAttribute('h', finalHeight.toFixed(2));
        this.updateLayoutAndRender();
    }

    get text(): string { return this._textShape.text; }
    set text(value: string) {
        this._textShape.text = value;
        this.setAttribute('text', value);
        // Clear explicit size flag so node can resize to fit new text
        this._hasExplicitSize = false;
        // Resize to fit if we're in the DOM (text can be measured)
        const textEl = this._textShape.getSvgElement();
        if (textEl && textEl.parentNode) {
            this.sizeToFit();
        }
    }

    get br(): number { return this._br; }
    set br(value: number) {
        this._br = value;
        // Only rectangles support border-radius
        if (this._backingShape instanceof GsRectShape) {
            (this._backingShape as GsRectShape).br = value;
        }
        this.setAttribute('br', value.toString());
    }

    get fc(): string { return this._fc; }
    set fc(value: string) {
        this._fc = value;
        this._backingShape.fc = value;
        // Only persist non-default fill color
        if (value !== 'transparent') {
            this.setAttribute('fc', value);
        } else {
            this.removeAttribute('fc');
        }
        this.render();
        this._notifyAncestorsToRender();
    }

    get sc(): string { return this._sc; }
    set sc(value: string) {
        this._sc = value;
        this._backingShape.sc = value;
        // Only persist non-default stroke color
        if (value !== '#000000') {
            this.setAttribute('sc', value);
        } else {
            this.removeAttribute('sc');
        }
        // Note: text color is set separately via 'tc' attribute
        this.render();
        this._notifyAncestorsToRender();
    }

    set tc(value: string) {
        this._textShape.sc = value;
        if (value !== '#000000') {
            this.setAttribute('tc', value);
        } else {
            this.removeAttribute('tc');
        }
        this.render();
        this._notifyAncestorsToRender();
    }

    /**
     * Notify ancestor GsNodeShape elements to re-render.
     * This is needed because parent nodes clone child SVG elements,
     * so changes to a nested node's appearance require parents to re-render
     * to pick up the updated SVG.
     */
    private _notifyAncestorsToRender(): void {
        let parent = this.parentElement;
        while (parent) {
            if (parent instanceof GsNodeShape) {
                parent.render();
            }
            parent = parent.parentElement;
        }
    }

    get tc(): string {
        return this._textShape.sc;
    }

    get font(): string {
        return this._textShape.font;
    }
    set font(value: string) {
        this._textShape.font = value;
        this.setAttribute('font', value);
        this.render();
        this._notifyAncestorsToRender();
    }

    get fontSize(): number {
        return parseFloat(this._textShape.getSvgElement()?.getAttribute('font-size') || '16');
    }
    set fontSize(value: number) {
        const textEl = this._textShape.getSvgElement();
        if (textEl) {
            textEl.setAttribute('font-size', value.toString());
        }
        this._textShape.setAttribute('size', value.toString());
        this.setAttribute('font-size', value.toString());
        this.render();
        this._notifyAncestorsToRender();
    }

    get strokeWidth(): number {
        return this._strokeWidth;
    }
    set strokeWidth(value: number) {
        this._strokeWidth = value;
        if (value !== 1) {
            this.setAttribute('stroke-width', value.toString());
        } else {
            this.removeAttribute('stroke-width');
        }
        this.render();
        this._notifyAncestorsToRender();
    }

    get bold(): boolean { return this._textShape.bold; }
    set bold(value: boolean) {
        this._textShape.bold = value;
        if (value) this.setAttribute('bold', ''); else this.removeAttribute('bold');
        this.render();
        this._notifyAncestorsToRender();
    }

    get italic(): boolean { return this._textShape.italic; }
    set italic(value: boolean) {
        this._textShape.italic = value;
        if (value) this.setAttribute('italic', ''); else this.removeAttribute('italic');
        this.render();
        this._notifyAncestorsToRender();
    }

    get underline(): boolean { return this._textShape.underline; }
    set underline(value: boolean) {
        this._textShape.underline = value;
        if (value) this.setAttribute('underline', ''); else this.removeAttribute('underline');
        this.render();
        this._notifyAncestorsToRender();
    }

    get strike(): boolean { return this._textShape.strike; }
    set strike(value: boolean) {
        this._textShape.strike = value;
        if (value) this.setAttribute('strike', ''); else this.removeAttribute('strike');
        this.render();
        this._notifyAncestorsToRender();
    }
    // #endregion

    getHandles(): { [key: string]: HandleSpec } {
        // Return unified handles based on bounding box
        return {
            nw: { p: this.pt_nw },
            ne: { p: this.pt_ne },
            se: { p: this.pt_se },
            sw: { p: this.pt_sw },
            n: { p: this.pt_n },
            s: { p: this.pt_s },
            e: { p: this.pt_e },
            w: { p: this.pt_w }
        };
    }

    hitTest(point: Point, threshold: number = 0): boolean {
        return this._backingShape.hitTest(point, threshold);
    }

    translateBy(dx: number, dy: number): void {
        // Update node position using cached values
        this._x += dx;
        this._y += dy;
        this._syncBackingShape();

        this.setAttribute('x', this._x.toFixed(2));
        this.setAttribute('y', this._y.toFixed(2));

        this.updateLayoutAndRender();
    }

    getCenter(): Point {
        return {
            x: this.x + this.w / 2,
            y: this.y + this.h / 2
        };
    }

    getBoundingBox(): { x: number, y: number, width: number, height: number } {
        return {
            x: this.x,
            y: this.y,
            width: this.w,
            height: this.h
        };
    }

    // #region edges
    addIncomingEdge(edge: GsEdgeShape): void {
        if (!this._incomingEdges.includes(edge)) {
            this._incomingEdges.push(edge);
        }
    }

    removeIncomingEdge(edge: GsEdgeShape): void {
        const index = this._incomingEdges.indexOf(edge);
        if (index !== -1) {
            this._incomingEdges.splice(index, 1);
        }
    }

    addOutgoingEdge(edge: GsEdgeShape): void {
        if (!this._outgoingEdges.includes(edge)) {
            this._outgoingEdges.push(edge);
        }
    }

    removeOutgoingEdge(edge: GsEdgeShape): void {
        const index = this._outgoingEdges.indexOf(edge);
        if (index !== -1) {
            this._outgoingEdges.splice(index, 1);
        }
    }

    notifyEdges(): void {
        this._incomingEdges.forEach(edge => {
            edge.dstMoved();
        });
        this._outgoingEdges.forEach(edge => {
            edge.srcMoved();
        });
    }
    // #endregion edges


    // #region nesting
    acceptsDrop(shapes: GsShape[]): boolean {
        // Accept any GsShape that isn't an ancestor of this node
        return shapes.every(shape => {
            // Check if this shape is an ancestor of the current node (prevent circular references)
            if (this.isDescendantOf(shape)) {
                return false;
            }
            // Accept any GsShape
            return shape instanceof GsShape;
        });
    }

    // Check if this node is a descendant of the given shape
    private isDescendantOf(shape: GsShape): boolean {
        let parent = this.parentElement;
        while (parent) {
            if (parent === shape) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    onDrop(shapes: GsShape[]): void {
        // Filter shapes to avoid circular references
        const safeShapes = shapes.filter(shape => !this.isDescendantOf(shape));

        safeShapes.forEach(shape => {
            if (shape.tagName.toLowerCase() === 'gs-group') {
                // For groups, add the group's child shapes individually
                const groupShapes = Array.from(shape.children).filter(
                    child => child instanceof GsShape && !this.isDescendantOf(child)
                ) as GsShape[];
                groupShapes.forEach(child => this.addChildShape(child));
            } else {
                // Add any GsShape
                this.addChildShape(shape);
            }
        });
    }

    /**
     * Add a child shape to this node.
     * Accepts any GsShape type. The shape is added to light DOM only.
     * SVG rendering is handled by getSvgElement() when the sketch renders.
     */
    addChildShape(shape: GsShape): void {
        if (shape === this || this.isDescendantOf(shape)) {
            return;
        }
        // Remove from current parent
        const currentParent = shape.parentElement;
        if (currentParent && currentParent instanceof GsNodeShape) {
            currentParent.removeChildShape(shape);
        } else if (currentParent) {
            currentParent.removeChild(shape);
        }
        // Add to light DOM only - SVG will be added via getSvgElement() when sketch renders
        this.appendChild(shape);
        // Mark the dropped child as having explicit size so it keeps its dimensions
        // (don't recalculate text metrics on drop)
        if (shape instanceof GsNodeShape) {
            shape._hasExplicitSize = true;
        }
        // Clear explicit size flag so parent grows to accommodate new child
        // (even if parent had explicit dimensions from save/resize)
        this._hasExplicitSize = false;
        // Propagate layout update to all ancestors
        this.propagateLayoutToAncestors();
    }

    /** @deprecated Use addChildShape instead */
    addChildNode(node: GsNodeShape): void {
        this.addChildShape(node);
    }

    /**
     * Propagate layout recalculation up the ancestor chain.
     * Call this when a node's size changes to ensure parents resize.
     * Clears _hasExplicitSize on all ancestors so they grow to fit.
     */
    private propagateLayoutToAncestors(): void {
        let current: Element | null = this;
        while (current) {
            if (current instanceof GsNodeShape) {
                // Clear explicit size flag so ancestor grows to accommodate child changes
                current._hasExplicitSize = false;
                current.recalculateLayout();
            }
            current = current.parentElement;
        }
    }

    /**
     * Remove a child shape from this node.
     * SVG cleanup happens automatically on next render.
     */
    removeChildShape(shape: GsShape): void {
        if (shape.parentElement === this) {
            // Mark the removed child as having explicit size so it keeps its dimensions
            if (shape instanceof GsNodeShape) {
                shape._hasExplicitSize = true;
            }
            this.removeChild(shape);
            // Trigger parent and ancestors to shrink to fit remaining children
            this._childTreeChanged = true;
            this.propagateLayoutToAncestors();
        }
    }

    /** @deprecated Use removeChildShape instead */
    removeChildNode(node: GsNodeShape): void {
        this.removeChildShape(node);
    }

    /**
     * Returns all child shapes (any GsShape type, not just GsNodeShape).
     * These are stored in the light DOM and serialized as custom elements.
     */
    getChildShapes(): GsShape[] {
        return Array.from(this.children).filter(child => child instanceof GsShape) as GsShape[];
    }

    /**
     * Recursively find a nested shape at the given point.
     * Returns the deepest nested shape that passes the hit test.
     */
    findNestedShapeAt(point: Point, excludeIds?: Set<string>): GsShape | null {
        const childShapes = this.getChildShapes();
        for (let i = childShapes.length - 1; i >= 0; i--) {
            const child = childShapes[i];
            if (excludeIds && excludeIds.has(child.id)) continue;
            if (child.hitTest(point)) {
                // Recursively check if child has nested shapes (for GsNodeShape children)
                if (child instanceof GsNodeShape) {
                    const nested = child.findNestedShapeAt(point, excludeIds);
                    return nested || child;
                }
                return child;
            }
        }
        return null;
    }
    // #endregion nesting

    // #region layout
    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    arrangeText(): number {
        let currentY = this.y + this._padH;
        const xCenter = this.x + this.w / 2;
        const txt = this._textShape.getSvgElement() as SVGTextElement;
        let txtH = txt.getBBox().height;
        // Fallback: if getBBox returns 0 (element not in DOM), estimate from font size
        if (txtH <= 0 && this._textShape.text) {
            const fontSize = parseFloat(txt.getAttribute('font-size') || '16');
            txtH = fontSize * 1.2; // Approximate line height
        }
        // Check for child shapes in light DOM, not the SVG group
        if (this.getChildShapes().length === 0) {
            this._textShape.pt_xy = { x: xCenter, y: this.y + this.h / 2 };
            currentY += txtH;
        } else {
            this._textShape.pt_xy = { x: xCenter, y: this.y + this._padH + txtH/2};
            // Use estimated height directly instead of getBBox which may return 0
            currentY = this.y + this._padH + txtH + this._gapSize;
        }
        return currentY;
    }

    arrangeChildNodes(): void {
        let currentY = this.arrangeText();
        let maxWidth = this.getMinimumWidth();
        const childShapes = this.getChildShapes();
        childShapes.forEach(child => {
            // Use translateBy to position any GsShape type
            const bbox = child.getBoundingBox();
            const targetX = this.x + this._padW;
            const targetY = currentY;
            child.translateBy(targetX - bbox.x, targetY - bbox.y);
            currentY += bbox.height + this._gapSize;
            maxWidth = Math.max(maxWidth, bbox.width);
        });
        const requiredHeight = currentY + (this._padH - this._gapSize) - this.y;
        const requiredWidth = maxWidth + 2 * this._padW;

        // Only resize in these cases:
        // 1. Element isn't ready yet - skip entirely
        // 2. Children changed (_childTreeChanged) - allow both shrink and grow
        // 3. No explicit size - allow grow to fit text
        // Otherwise, keep the explicit dimensions

        if (!this._isReady) {
            // Not ready yet - deferred dimensions will be applied later
            return;
        }

        const ccc = this._childTreeChanged;
        if (ccc) {
            // Children changed - allow resize (both shrink and grow)
            this._childTreeChanged = false;
            if (this.w > requiredWidth) { this.w = requiredWidth; }
            if (this.h > requiredHeight) { this.h = requiredHeight; }
            if (this.w < requiredWidth) { this.w = requiredWidth; }
            if (this.h < requiredHeight) { this.h = requiredHeight; }
        } else if (!this._hasExplicitSize) {
            // No explicit size - enforce minimums (grow to fit text)
            if (this.w < requiredWidth) { this.w = requiredWidth; }
            if (this.h < requiredHeight) { this.h = requiredHeight; }
        }
        // If _hasExplicitSize is true and no children changed, keep current dimensions
        // re-center text in case w/h changed
        this.arrangeText();
    }

    private getMinimumWidth(): number {
        const baseMin = 12 + 2 * this._padW;
        if (!this.text) return baseMin;

        try {
            const textEl = this._textShape.getSvgElement() as SVGTextElement;
            if (!textEl) {
                return baseMin;
            }

            const bbox = textEl.getBBox();
            let textWidth = bbox.width;

            // If getBBox returns 0 (element not in DOM), estimate from text length and font size
            if (textWidth <= 0) {
                const fontSize = parseFloat(textEl.getAttribute('font-size') || '16');
                // Rough estimate: average character width is ~0.6 of font size
                textWidth = this.text.length * fontSize * 0.6;
            }

            return Math.max(baseMin, textWidth + 2 * this._padW);
        } catch (error) {
            console.warn('GsNodeShape: Error measuring text width, using default:', error);
            return baseMin;
        }
    }

    private getMinimumHeight(): number {
        const baseMin = 12 + 2 * this._padH;
        if (!this.text) return baseMin;

        try {
            const textEl = this._textShape.getSvgElement() as SVGTextElement;
            if (!textEl) {
                return baseMin;
            }

            const bbox = textEl.getBBox();
            let textHeight = bbox.height;

            // If getBBox returns 0 (element not in DOM), estimate from font size
            if (textHeight <= 0) {
                const fontSize = parseFloat(textEl.getAttribute('font-size') || '16');
                textHeight = fontSize * 1.2; // Approximate line height
            }

            return Math.max(baseMin, textHeight + 2 * this._padH);
        } catch (error) {
            console.warn('GsNodeShape: Error measuring text height, using default:', error);
            return baseMin;
        }
    }

    /**
     * Resize the node to fit its text content with padding.
     * Call after setting text to auto-size the node.
     */
    sizeToFit(): void {
        this._w = this.getMinimumWidth();
        this._h = this.getMinimumHeight();
        this._syncBackingShape();
        this.setAttribute('w', this._w.toFixed(2));
        this.setAttribute('h', this._h.toFixed(2));
        this.updateLayoutAndRender();
    }

    private _inLayout = false;
    private updateLayout(): void {
        if (this._inLayout) return;
        this._inLayout = true;

        // Temporarily disconnect observer to prevent infinite loops during layout
        this._disconnectObserver();

        try {
            this.arrangeChildNodes();
            this.notifyEdges();
        } finally {
            // Always reconnect observer even if there's an error
            this._reconnectObserver();
            this._inLayout = false;
        }
    }

    private updateLayoutAndRender(): void {
        if (this._inLayout) return;
        this.updateLayout();
        this.render();
    }

    /**
     * Force a full layout recalculation, including shrinking to fit children.
     * Call this after removing a child to make the parent shrink.
     */
    recalculateLayout(): void {
        this._childTreeChanged = true;
        this.updateLayoutAndRender();
    }

    // #endregion layout

}

customElements.define('gs-node', GsNodeShape);
