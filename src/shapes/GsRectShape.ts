import { HandleSpec, Point, RectConstructorType } from '../types';
import { GsShape } from './GsShape';

/**
 * Rectangle shape component that wraps an SVG rect
 */
export class GsRectShape extends GsShape {
    private x: number = 0;
    private y: number = 0;
    private width: number = 0;
    private height: number = 0;
    private _br: number = 0;

    private constructorType: RectConstructorType = 'corner-size';

    private _pt_extent_cache: Point | null = null;

    constructor() {
        super();
    }

    /**
     * Define observed attributes
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'x', 'y', 'width', 'height', 'constructor-type', 'br'];
    }

    // Add constructor definitions for interactive creation
    static get constructors() {
        return {
            ":click": ['pt_origin'],
            ":drag":  ['pt_origin', 'pt_extent']
        };
    }

    // NEW: Add pt_origin and pt_extent accessors
    get pt_origin(): Point {
        return { x: this.x, y: this.y };
    }
    set pt_origin(point: Point) {
        this._pt_extent_cache = point;
        this.x = point.x;
        this.y = point.y;
        this.setAttribute('x', point.x.toString());
        this.setAttribute('y', point.y.toString());
        this.render();
    }

    get pt_extent(): Point {
        return this._pt_extent_cache || { x: this.x + this.width, y: this.y + this.height };
    }
    set pt_extent(point: Point) {
        if (!this._pt_extent_cache) {
            // Fallback: use current origin if not set.
            this._pt_extent_cache = { x: this.x, y: this.y };
        }
        const minX = Math.min(this._pt_extent_cache.x, point.x);
        const minY = Math.min(this._pt_extent_cache.y, point.y);
        const maxX = Math.max(this._pt_extent_cache.x, point.x);
        const maxY = Math.max(this._pt_extent_cache.y, point.y);
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.setAttribute('width', this.width.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    // NEW: Add handle getters and setters
    get pt_nw(): Point { return { x: this.x, y: this.y }; }
    set pt_nw(point: Point) {
        // Fixed point: opposite corner (se)
        const fixed = this.pt_se;
        const minX = Math.min(point.x, fixed.x);
        const minY = Math.min(point.y, fixed.y);
        const maxX = Math.max(point.x, fixed.x);
        const maxY = Math.max(point.y, fixed.y);
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
        // ...update attributes...
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.setAttribute('width', this.width.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_ne(): Point { return { x: this.x + this.width, y: this.y }; }
    set pt_ne(point: Point) {
        // Fixed: opposite corner (sw)
        const fixed = this.pt_sw;
        const minX = Math.min(fixed.x, point.x);
        const minY = Math.min(point.y, fixed.y);
        const maxX = Math.max(fixed.x, point.x);
        const maxY = Math.max(point.y, fixed.y);
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.setAttribute('width', this.width.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_se(): Point { return { x: this.x + this.width, y: this.y + this.height }; }
    set pt_se(point: Point) {
        // Fixed: opposite corner (nw)
        const fixed = this.pt_nw;
        const minX = Math.min(fixed.x, point.x);
        const minY = Math.min(fixed.y, point.y);
        const maxX = Math.max(fixed.x, point.x);
        const maxY = Math.max(fixed.y, point.y);
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.setAttribute('width', this.width.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_sw(): Point { return { x: this.x, y: this.y + this.height }; }
    set pt_sw(point: Point) {
        // Fixed: opposite corner (ne)
        const fixed = this.pt_ne;
        const minX = Math.min(fixed.x, point.x);
        const minY = Math.min(fixed.y, point.y);
        const maxX = Math.max(fixed.x, point.x);
        const maxY = Math.max(point.y, fixed.y);
        this.x = minX;
        this.y = minY;
        this.width = maxX - minX;
        this.height = maxY - minY;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.setAttribute('width', this.width.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_n(): Point { return { x: this.x + this.width/2, y: this.y }; }
    set pt_n(point: Point) {
        // Fixed: bottom edge remains (pt_s)
        const bottomY = this.pt_s.y;
        this.y = Math.min(point.y, bottomY);
        this.height = Math.abs(bottomY - point.y);
        this.setAttribute('y', this.y.toString());
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_s(): Point { return { x: this.x + this.width/2, y: this.y + this.height }; }
    set pt_s(point: Point) {
        // Fixed: top edge remains (pt_n)
        const topY = this.pt_n.y;
        this.height = Math.abs(point.y - topY);
        this.setAttribute('height', this.height.toString());
        this.render();
    }

    get pt_w(): Point { return { x: this.x + this.width, y: this.y + this.height/2 }; }
    set pt_w(point: Point) {
        // Fixed: left edge remains (pt_e)
        const leftX = this.pt_e.x;
        this.width = Math.abs(point.x - leftX);
        this.setAttribute('width', this.width.toString());
        this.render();
    }

    get pt_e(): Point { return { x: this.x, y: this.y + this.height/2 }; }
    set pt_e(point: Point) {
        // Fixed: right edge remains (pt_w)
        const rightX = this.pt_w.x;
        this.x = Math.min(point.x, rightX);
        this.width = Math.abs(rightX - point.x);
        this.setAttribute('x', this.x.toString());
        this.setAttribute('width', this.width.toString());
        this.render();
    }

    get br(): number { return this._br; }
    set br(value: number) {
        this._br = value;
        this.setAttribute('br', value.toString());
        this.render();
    }

    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'x':
                this.x = parseFloat(newValue) || 0;
                break;
            case 'y':
                this.y = parseFloat(newValue) || 0;
                break;
            case 'width':
                this.width = parseFloat(newValue) || 0;
                break;
            case 'height':
                this.height = parseFloat(newValue) || 0;
                break;
            case 'constructor-type':
                if (newValue === 'corner-size' || newValue === 'two-corners') {
                    this.constructorType = newValue as RectConstructorType;
                }
                break;
            case 'br':
                this.br = parseFloat(newValue) || 0;
                break;
        }

        this.render();
    }

    /**
     * Initialize when element is added to DOM
     */
    connectedCallback() {
        super.connectedCallback();

        // Get initial attributes
        if (this.hasAttribute('x')) {
            this.x = parseFloat(this.getAttribute('x') || '0');
        }

        if (this.hasAttribute('y')) {
            this.y = parseFloat(this.getAttribute('y') || '0');
        }

        if (this.hasAttribute('width')) {
            this.width = parseFloat(this.getAttribute('width') || '0');
        }

        if (this.hasAttribute('height')) {
            this.height = parseFloat(this.getAttribute('height') || '0');
        }

        if (this.hasAttribute('constructor-type')) {
            const type = this.getAttribute('constructor-type');
            if (type === 'corner-size' || type === 'two-corners') {
                this.constructorType = type as RectConstructorType;
            }
        }

        this.render();
    }

    /**
     * Get handles for the rectangle
     */
    getHandles(): { [key: string]: HandleSpec } {
        return {
            "nw": { p: this.pt_nw },
            "ne": { p: this.pt_ne },
            "se": { p: this.pt_se },
            "sw": { p: this.pt_sw },
            "n": { p: this.pt_n },
            "w": { p: this.pt_w },
            "s": { p: this.pt_s },
            "e": { p: this.pt_e }
        };
    }

    /**
     * Hit test for the rectangle
     */
    hitTest(point: Point, threshold: number = 5): boolean {
        try {
            // Use a more generous threshold for easier selection
            const effectiveThreshold = Math.max(threshold, 10);

            // First check if the point is inside the rectangle (including the threshold)
            const isInside =
                point.x >= (this.x - effectiveThreshold) &&
                point.x <= (this.x + this.width + effectiveThreshold) &&
                point.y >= (this.y - effectiveThreshold) &&
                point.y <= (this.y + this.height + effectiveThreshold);

            if (isInside) {
                return true;
            }

            // Special case for very small rectangles - use center distance
            if (this.width < 5 || this.height < 5) {
                const centerX = this.x + this.width/2;
                const centerY = this.y + this.height/2;
                const distance = Math.sqrt(Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2));
                const maxDimension = Math.max(5, Math.max(this.width, this.height));
                if (distance <= maxDimension + threshold) {
                    return true;
                }
            }

            // For completeness, check the edges
            if (this.pointNearLine(point,
                { x: this.x, y: this.y },
                { x: this.x + this.width, y: this.y },
                effectiveThreshold)) {
                return true;
            }

            if (this.pointNearLine(point,
                { x: this.x + this.width, y: this.y },
                { x: this.x + this.width, y: this.y + this.height },
                effectiveThreshold)) {
                return true;
            }

            if (this.pointNearLine(point,
                { x: this.x, y: this.y + this.height },
                { x: this.x + this.width, y: this.y + this.height },
                effectiveThreshold)) {
                return true;
            }

            if (this.pointNearLine(point,
                { x: this.x, y: this.y },
                { x: this.x, y: this.y + this.height },
                effectiveThreshold)) {
                return true;
            }

            return false;
        } catch (error) {
            console.error(`[GsRectShape] Hit test error:`, error);
            return false;
        }
    }

    /**
     * Utility to check if a point is near a line segment
     */
    private pointNearLine(point: Point, lineStart: Point, lineEnd: Point, threshold: number): boolean {
        // Calculate line length squared
        const lengthSquared = Math.pow(lineEnd.x - lineStart.x, 2) + Math.pow(lineEnd.y - lineStart.y, 2);

        // If line is a point, just calculate distance to that point
        if (lengthSquared === 0) {
            const dist = Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
            return dist <= threshold;
        }

        // Calculate projection of point onto line
        const t = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) +
                  (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / lengthSquared;

        // If projection is outside the line segment, calculate distance to nearest endpoint
        if (t < 0) {
            const dist = Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
            return dist <= threshold;
        } else if (t > 1) {
            const dist = Math.sqrt(Math.pow(point.x - lineEnd.x, 2) + Math.pow(point.y - lineEnd.y, 2));
            return dist <= threshold;
        }

        // Calculate closest point on line
        const closestX = lineStart.x + t * (lineEnd.x - lineStart.x);
        const closestY = lineStart.y + t * (lineEnd.y - lineStart.y);

        // Calculate distance to closest point
        const dist = Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));

        return dist <= threshold;
    }

    /**
     * Render the rectangle
     */
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('rect');
            const rectElement = this._el as SVGRectElement;
            rectElement.setAttribute('stroke-width', '1');
            rectElement.setAttribute('visibility', 'visible');
            rectElement.setAttribute('pointer-events', 'all');
            rectElement.style.display = 'block';
        }
        const rectElement = this._el as SVGRectElement;
        rectElement.setAttribute('x', this.x.toString());
        rectElement.setAttribute('y', this.y.toString());
        rectElement.setAttribute('width', this.width.toString());
        rectElement.setAttribute('height', this.height.toString());
        // Always set rx/ry, even when 0, to clear previous rounded values
        rectElement.setAttribute('rx', this._br.toString());
        rectElement.setAttribute('ry', this._br.toString());
        rectElement.setAttribute('fill', this._fc);
        rectElement.setAttribute('stroke', this._sc);
        rectElement.setAttribute('visibility', 'visible');
        rectElement.style.display = 'block';
    }

    translateBy(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.render();
    }
}
customElements.define('gs-rect', GsRectShape);