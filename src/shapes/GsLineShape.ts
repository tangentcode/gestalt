import { Point } from '../types';
import { GsShape } from './GsShape';
import { HandleSpec } from '../types';

/**
 * Line shape component that wraps an SVG line
 */
export class GsLineShape extends GsShape {
    private x1: number = 0;
    private y1: number = 0;
    private x2: number = 0;
    private y2: number = 0;

    constructor() {
        super();
    }

    // #region handles

    get pt_start(): Point {
        return { x: this.x1, y: this.y1 };
    }

    set pt_start(worldPt: Point) {
        this.x1 = worldPt.x;
        this.y1 = worldPt.y;
        this.setAttribute('x1', worldPt.x.toString());
        this.setAttribute('y1', worldPt.y.toString());
        this.render();
    }

    get pt_end(): Point {
        return { x: this.x2, y: this.y2 };
    }

    set pt_end(worldPt: Point) {
        this.x2 = worldPt.x;
        this.y2 = worldPt.y;
        this.setAttribute('x2', worldPt.x.toString());
        this.setAttribute('y2', worldPt.y.toString());
        this.render();
    }

    getHandles(): { [key: string]: HandleSpec } {
        return {
            "start": { p: this.pt_start },
            "end": { p: this.pt_end }
        };
    }
    // #endregion

    /**
     * Define observed attributes
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2'];
    }

    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'x1':
                this.x1 = parseFloat(newValue) || 0;
                break;
            case 'y1':
                this.y1 = parseFloat(newValue) || 0;
                break;
            case 'x2':
                this.x2 = parseFloat(newValue) || 0;
                break;
            case 'y2':
                this.y2 = parseFloat(newValue) || 0;
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
        if (this.hasAttribute('x1')) {
            this.x1 = parseFloat(this.getAttribute('x1') || '0');
        }

        if (this.hasAttribute('y1')) {
            this.y1 = parseFloat(this.getAttribute('y1') || '0');
        }

        if (this.hasAttribute('x2')) {
            this.x2 = parseFloat(this.getAttribute('x2') || '0');
        }

        if (this.hasAttribute('y2')) {
            this.y2 = parseFloat(this.getAttribute('y2') || '0');
        }

        this.render();
    }

    /**
     * Set line using two points
     */
    setPoints(p1: Point, p2: Point): void {
        this.x1 = p1.x;
        this.y1 = p1.y;
        this.x2 = p2.x;
        this.y2 = p2.y;

        this.setAttribute('x1', p1.x.toString());
        this.setAttribute('y1', p1.y.toString());
        this.setAttribute('x2', p2.x.toString());
        this.setAttribute('y2', p2.y.toString());

        this.render();
    }

    /**
     * Hit test for the line - increased threshold for easier selection
     */
    hitTest(point: Point, threshold: number = 10): boolean {
        return this.distancePointToLine(point, { x: this.x1, y: this.y1 }, { x: this.x2, y: this.y2 }) <= threshold;
    }

    /**
     * Calculate distance from a point to a line segment
     */
    private distancePointToLine(point: Point, lineStart: Point, lineEnd: Point): number {
        // Calculate line length squared
        const lengthSquared = Math.pow(lineEnd.x - lineStart.x, 2) + Math.pow(lineEnd.y - lineStart.y, 2);

        // If line is a point, calculate distance to that point
        if (lengthSquared === 0) {
            return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
        }

        // Calculate projection of point onto line
        const t = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) +
                   (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / lengthSquared;

        if (t < 0) {
            // Point is nearest to the start point
            return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
        } else if (t > 1) {
            // Point is nearest to the end point
            return Math.sqrt(Math.pow(point.x - lineEnd.x, 2) + Math.pow(point.y - lineEnd.y, 2));
        }

        // Calculate projection point
        const proj = {
            x: lineStart.x + t * (lineEnd.x - lineStart.x),
            y: lineStart.y + t * (lineEnd.y - lineStart.y)
        };

        // Return distance to projection point
        return Math.sqrt(Math.pow(point.x - proj.x, 2) + Math.pow(point.y - proj.y, 2));
    }

    /**
     * Render the line
     */
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('line');
            const lineEl = this._el as SVGLineElement;
            lineEl.setAttribute('stroke-width', '1');
            lineEl.setAttribute('stroke-linecap', 'round');
            lineEl.setAttribute('visibility', 'visible');
            lineEl.style.display = 'block';
            // Enable pointer events to allow dragging the shape itself
            lineEl.style.pointerEvents = 'all';
        }
        const lineEl = this._el as SVGLineElement;
        // Guard against null/NaN values - use 0 as fallback
        const safeNum = (n: number) => (n == null || isNaN(n)) ? 0 : n;
        lineEl.setAttribute('x1', safeNum(this.x1).toString());
        lineEl.setAttribute('y1', safeNum(this.y1).toString());
        lineEl.setAttribute('x2', safeNum(this.x2).toString());
        lineEl.setAttribute('y2', safeNum(this.y2).toString());
        lineEl.setAttribute('stroke', this._sc);
        lineEl.style.display = 'block';
    }

    translateBy(dx: number, dy: number): void {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;
        this.setAttribute('x1', this.x1.toString());
        this.setAttribute('y1', this.y1.toString());
        this.setAttribute('x2', this.x2.toString());
        this.setAttribute('y2', this.y2.toString());
        this.render();
    }

    // Add updateHandle to allow dragging individual endpoints
    updateHandle(index: number, point: { x: number; y: number }): void {
        if (index === 0) {
            this.x1 = point.x;
            this.y1 = point.y;
            this.setAttribute('x1', point.x.toString());
            this.setAttribute('y1', point.y.toString());
        } else if (index === 1) {
            this.x2 = point.x;
            this.y2 = point.y;
            this.setAttribute('x2', point.x.toString());
            this.setAttribute('y2', point.y.toString());
        }
        this.render();
    }

    // Add constructor definitions for interactive creation
    static get constructors() {
        return {
            ":click": ['pt_start', 'pt_end'],
            ":drag":  ['pt_start', 'pt_end']
        };
    }
}

// Register the custom element for line shapes:
customElements.define('gs-line', GsLineShape);