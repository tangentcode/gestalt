import { HandleSpec, Point } from '../types';
import { GsShape } from './GsShape';

/**
 * Group shape component that acts as a container for other shapes
 */
export class GsGroup extends GsShape {
    // Use a completely different property name to avoid conflict
    private _groupShapes: GsShape[] = [];

    constructor() {
        super();
    }

    /**
     * Initialize when element is added to DOM
     */
    connectedCallback() {
        super.connectedCallback();
        this._updateChildShapes();
    }

    static get observedAttributes() {
        return ['transform'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue !== newValue && name === 'transform') {
            this._clearCachedBbox(); // Clear cache
            // Dispatch a custom event so that the parent sketch updates this group's SVG
            this.dispatchEvent(new CustomEvent('refresh-svg', {
                detail: { attribute: 'transform', newValue },
                bubbles: true,
                composed: true
            }));
        }
    }

    /**
     * Add a shape to the group
     */
    addShape(shape: GsShape): void {
        this.appendChild(shape);
        this._updateChildShapes();
        this._clearCachedBbox(); // Clear cache
        this.render();
    }

    /**
     * Remove a shape from the group
     */
    removeShape(shape: GsShape): void {
        this.removeChild(shape);
        this._updateChildShapes();
        this._clearCachedBbox(); // Clear cache
        this.render();
    }

    /**
     * Update the internal children array from DOM
     */
    private _updateChildShapes(): void {
        this._groupShapes = Array.from(this.children).filter(
            (child): child is GsShape => child instanceof GsShape
        );
        this._clearCachedBbox(); // Clear cache
    }

    /**
     * Get all child shapes
     */
    getGroupShapes(): GsShape[] {
        return [...this._groupShapes];
    }

    /**
     * Use direct attribute access to compute bounds without recursion.
     * This method avoids calling getHandles() on child groups.
     */
    computeBoundingBox(): { x: number, y: number, width: number, height: number } {
        // If no shapes, return empty bounds
        if (this._groupShapes.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // Process each shape directly
        for (const shape of this._groupShapes) {
            // For groups, use their computeBoundingBox method
            if (shape instanceof GsGroup) {
                const groupBbox = shape.computeBoundingBox();
                if (groupBbox.width > 0 || groupBbox.height > 0) {
                    minX = Math.min(minX, groupBbox.x);
                    minY = Math.min(minY, groupBbox.y);
                    maxX = Math.max(maxX, groupBbox.x + groupBbox.width);
                    maxY = Math.max(maxY, groupBbox.y + groupBbox.height);
                }
            }
            // For circles, use center and radius
            else if (shape.tagName.toLowerCase() === 'gs-circle-shape') {
                const cx = parseFloat(shape.getAttribute('cx') || '0');
                const cy = parseFloat(shape.getAttribute('cy') || '0');
                const r = parseFloat(shape.getAttribute('r') || '0');
                minX = Math.min(minX, cx - r);
                minY = Math.min(minY, cy - r);
                maxX = Math.max(maxX, cx + r);
                maxY = Math.max(maxY, cy + r);
            }
            // For rectangles, use x, y, width, height
            else if (shape.tagName.toLowerCase() === 'gs-rect-shape') {
                const x = parseFloat(shape.getAttribute('x') || '0');
                const y = parseFloat(shape.getAttribute('y') || '0');
                const width = parseFloat(shape.getAttribute('width') || '0');
                const height = parseFloat(shape.getAttribute('height') || '0');
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + width);
                maxY = Math.max(maxY, y + height);
            }
            // For other shapes with getHandles
            else if (typeof (shape as any).getHandles === 'function') {
                const handleSpecs = Object.values((shape as any).getHandles()) as HandleSpec[];
                for (const spec of handleSpecs) {
                    minX = Math.min(minX, spec.p.x);
                    minY = Math.min(minY, spec.p.y);
                    maxX = Math.max(maxX, spec.p.x);
                    maxY = Math.max(maxY, spec.p.y);
                }
            }
        }

        // Handle case where we didn't find any bounds
        if (minX === Infinity) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    // Cache the computed bounding box
    private _cachedBbox: { x: number, y: number, width: number, height: number } | null = null;

    /**
     * Return the group bounding box.
     * This implementation caches the result to avoid repeated calculations.
     */
    getBoundingBox(): { x: number, y: number, width: number, height: number } {
        if (!this._cachedBbox) {
            this._cachedBbox = this.computeBoundingBox();
        }
        // Parse translation from the transform attribute if present.
        let offsetX = 0, offsetY = 0;
        const transform = this.getAttribute("transform");
        if (transform) {
            const match = transform.match(/translate\(\s*([\d.-]+)[ ,]+([\d.-]+)\s*\)/);
            if (match) {
                offsetX = parseFloat(match[1]);
                offsetY = parseFloat(match[2]);
            }
        }
        return {
            x: this._cachedBbox.x + offsetX,
            y: this._cachedBbox.y + offsetY,
            width: this._cachedBbox.width,
            height: this._cachedBbox.height
        };
    }

    /**
     * Get handles for the group as the four corners of its computed bounding box.
     * This uses the cached bounding box to prevent recursion.
     */
    getHandles(): { [key: string]: HandleSpec } {
        const bbox = this.getBoundingBox();
        if (bbox.width === 0 && bbox.height === 0) return {};
        return {
            "top-left": { p: { x: bbox.x, y: bbox.y } },
            "top-right": { p: { x: bbox.x + bbox.width, y: bbox.y } },
            "bottom-right": { p: { x: bbox.x + bbox.width, y: bbox.y + bbox.height } },
            "bottom-left": { p: { x: bbox.x, y: bbox.y + bbox.height } }
        };
    }

    /**
     * Create an overlay selection rectangle element.
     * This rectangle is not part of the group’s SVG but is meant to be placed
     * in the overlay (after proper coordinate conversion) to visually indicate the selected group.
     */
    getOverlaySelectionRect(): HTMLElement {
         const bbox = this.getBoundingBox();
         const rect = document.createElement('div');
         rect.classList.add('group-selection-rect');
         // These values are in SVG coordinates – they should be converted by the caller to overlay coordinates.
         rect.style.position = 'absolute';
         rect.style.left = `${bbox.x}px`;
         rect.style.top = `${bbox.y}px`;
         rect.style.width = `${bbox.width}px`;
         rect.style.height = `${bbox.height}px`;
         rect.style.border = '2px dashed orange';
         rect.style.backgroundColor = 'rgba(255,165,0,0.1)';
         rect.style.pointerEvents = 'none';
         return rect;
    }

    /**
     * Hit test for the group.
     * The group is considered hit if the test point lies within its bounding box.
     */
    hitTest(point: Point, threshold: number = 5): boolean {
        const bbox = this.getBoundingBox();
        if (bbox.width === 0 || bbox.height === 0) return false;
        return (
            point.x >= (bbox.x - threshold) &&
            point.x <= (bbox.x + bbox.width + threshold) &&
            point.y >= (bbox.y - threshold) &&
            point.y <= (bbox.y + bbox.height + threshold)
        );
    }

    /**
     * Get SVG element for the group.
     */
    getSvgElement(): SVGElement {
        this.render();
        return this._el!;
    }

    /**
     * Render the group.
     * Builds the complete SVG including all child shapes.
     */
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('g');
        }

        // Clear existing content
        while (this._el.firstChild) {
            this._el.removeChild(this._el.firstChild);
        }

        // Set attributes
        this._el.setAttribute('class', 'gs-group');
        this._el.setAttribute('data-shape-id', this.id);

        // Apply transform attribute if present
        const transformVal = this.getAttribute('transform');
        if (transformVal) {
            this._el.setAttribute('transform', transformVal);
        } else {
            this._el.removeAttribute('transform');
        }

        // Add child shapes' SVG elements
        for (const child of this._groupShapes) {
            if (typeof child.getSvgElement === 'function') {
                const childSvg = child.getSvgElement();
                if (childSvg) {
                    this._el.appendChild(childSvg.cloneNode(true));
                }
            }
        }
    }

    /**
     * Clear the cached bounding box whenever the group is modified
     */
    private _clearCachedBbox(): void {
        this._cachedBbox = null;
    }

    /**
     * Translate the group by the specified delta
     */
    translateBy(dx: number, dy: number): void {
        // Get current transform or default to zero translation
        const transform = this.getAttribute('transform') || 'translate(0, 0)';
        const match = transform.match(/translate\(\s*([\d.-]+)[ ,]+([\d.-]+)\s*\)/);
        let currentX = 0;
        let currentY = 0;

        if (match) {
            currentX = parseFloat(match[1]);
            currentY = parseFloat(match[2]);
        }

        // Update transform with new coordinates
        const newX = currentX + dx;
        const newY = currentY + dy;
        this.setAttribute('transform', `translate(${newX}, ${newY})`);

        // Clear cached bbox since position has changed
        this._clearCachedBbox();
    }
}

customElements.define('gs-group', GsGroup);