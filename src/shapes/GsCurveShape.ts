import { Point } from '../types';
import { GsShape } from './GsShape';
import { HandleSpec } from '../types';

/**
 * Bezier curve shape component that wraps an SVG path
 * Supports both quadratic (1 control point) and cubic (2 control points) curves
 */
export class GsCurveShape extends GsShape {
    private x1: number = 0;
    private y1: number = 0;
    private x2: number = 0;
    private y2: number = 0;
    private _ctrl1: Point | null = null;
    private _ctrl2: Point | null = null;

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

    get ctrl1(): Point | null {
        return this._ctrl1;
    }

    set ctrl1(point: Point | null) {
        this._ctrl1 = point;
        if (point) {
            this.setAttribute('ctrl1-x', point.x.toString());
            this.setAttribute('ctrl1-y', point.y.toString());
        } else {
            this.removeAttribute('ctrl1-x');
            this.removeAttribute('ctrl1-y');
        }
        this.render();
    }

    get ctrl2(): Point | null {
        return this._ctrl2;
    }

    set ctrl2(point: Point | null) {
        this._ctrl2 = point;
        if (point) {
            this.setAttribute('ctrl2-x', point.x.toString());
            this.setAttribute('ctrl2-y', point.y.toString());
        } else {
            this.removeAttribute('ctrl2-x');
            this.removeAttribute('ctrl2-y');
        }
        this.render();
    }

    getHandles(): { [key: string]: HandleSpec } {
        const handles: { [key: string]: HandleSpec } = {
            "start": { p: this.pt_start },
            "end": { p: this.pt_end }
        };
        if (this._ctrl1) {
            handles["ctrl1"] = { p: this._ctrl1 };
        }
        if (this._ctrl2) {
            handles["ctrl2"] = { p: this._ctrl2 };
        }
        return handles;
    }
    // #endregion

    /**
     * Define observed attributes
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'x1', 'y1', 'x2', 'y2', 'ctrl1-x', 'ctrl1-y', 'ctrl2-x', 'ctrl2-y'];
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
            case 'ctrl1-x':
                if (!this._ctrl1) this._ctrl1 = { x: 0, y: 0 };
                this._ctrl1.x = parseFloat(newValue) || 0;
                break;
            case 'ctrl1-y':
                if (!this._ctrl1) this._ctrl1 = { x: 0, y: 0 };
                this._ctrl1.y = parseFloat(newValue) || 0;
                break;
            case 'ctrl2-x':
                if (!this._ctrl2) this._ctrl2 = { x: 0, y: 0 };
                this._ctrl2.x = parseFloat(newValue) || 0;
                break;
            case 'ctrl2-y':
                if (!this._ctrl2) this._ctrl2 = { x: 0, y: 0 };
                this._ctrl2.y = parseFloat(newValue) || 0;
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
        if (this.hasAttribute('ctrl1-x') && this.hasAttribute('ctrl1-y')) {
            this._ctrl1 = {
                x: parseFloat(this.getAttribute('ctrl1-x') || '0'),
                y: parseFloat(this.getAttribute('ctrl1-y') || '0')
            };
        }
        if (this.hasAttribute('ctrl2-x') && this.hasAttribute('ctrl2-y')) {
            this._ctrl2 = {
                x: parseFloat(this.getAttribute('ctrl2-x') || '0'),
                y: parseFloat(this.getAttribute('ctrl2-y') || '0')
            };
        }

        this.render();
    }

    /**
     * Set curve using two points and optional control points
     */
    setPoints(p1: Point, p2: Point, ctrl1?: Point, ctrl2?: Point): void {
        this.x1 = p1.x;
        this.y1 = p1.y;
        this.x2 = p2.x;
        this.y2 = p2.y;
        this._ctrl1 = ctrl1 || null;
        this._ctrl2 = ctrl2 || null;

        this.setAttribute('x1', p1.x.toString());
        this.setAttribute('y1', p1.y.toString());
        this.setAttribute('x2', p2.x.toString());
        this.setAttribute('y2', p2.y.toString());

        if (ctrl1) {
            this.setAttribute('ctrl1-x', ctrl1.x.toString());
            this.setAttribute('ctrl1-y', ctrl1.y.toString());
        }
        if (ctrl2) {
            this.setAttribute('ctrl2-x', ctrl2.x.toString());
            this.setAttribute('ctrl2-y', ctrl2.y.toString());
        }

        this.render();
    }

    /**
     * Generate SVG path data for the curve
     */
    private getPathData(): string {
        const start = `M ${this.x1} ${this.y1}`;

        if (this._ctrl1 && this._ctrl2) {
            // Cubic bezier (C command)
            return `${start} C ${this._ctrl1.x} ${this._ctrl1.y}, ${this._ctrl2.x} ${this._ctrl2.y}, ${this.x2} ${this.y2}`;
        } else if (this._ctrl1) {
            // Quadratic bezier (Q command)
            return `${start} Q ${this._ctrl1.x} ${this._ctrl1.y}, ${this.x2} ${this.y2}`;
        } else {
            // Straight line fallback (L command)
            return `${start} L ${this.x2} ${this.y2}`;
        }
    }

    /**
     * Sample points along the bezier curve for hit testing
     */
    private sampleCurve(numSamples: number = 20): Point[] {
        const points: Point[] = [];

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            points.push(this.pointOnCurve(t));
        }

        return points;
    }

    /**
     * Get point on curve at parameter t (0 to 1)
     */
    private pointOnCurve(t: number): Point {
        const p0 = { x: this.x1, y: this.y1 };
        const p3 = { x: this.x2, y: this.y2 };

        if (this._ctrl1 && this._ctrl2) {
            // Cubic bezier
            const p1 = this._ctrl1;
            const p2 = this._ctrl2;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            return {
                x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
                y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
            };
        } else if (this._ctrl1) {
            // Quadratic bezier
            const p1 = this._ctrl1;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;

            return {
                x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p3.x,
                y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p3.y
            };
        } else {
            // Straight line
            return {
                x: p0.x + t * (p3.x - p0.x),
                y: p0.y + t * (p3.y - p0.y)
            };
        }
    }

    /**
     * Hit test for the curve - samples the curve and checks distance to segments
     */
    hitTest(point: Point, threshold: number = 10): boolean {
        const samples = this.sampleCurve(20);

        for (let i = 0; i < samples.length - 1; i++) {
            const dist = this.distancePointToLine(point, samples[i], samples[i + 1]);
            if (dist <= threshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate distance from a point to a line segment
     */
    private distancePointToLine(point: Point, lineStart: Point, lineEnd: Point): number {
        const lengthSquared = Math.pow(lineEnd.x - lineStart.x, 2) + Math.pow(lineEnd.y - lineStart.y, 2);

        if (lengthSquared === 0) {
            return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
        }

        const t = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) +
                   (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / lengthSquared;

        if (t < 0) {
            return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
        } else if (t > 1) {
            return Math.sqrt(Math.pow(point.x - lineEnd.x, 2) + Math.pow(point.y - lineEnd.y, 2));
        }

        const proj = {
            x: lineStart.x + t * (lineEnd.x - lineStart.x),
            y: lineStart.y + t * (lineEnd.y - lineStart.y)
        };

        return Math.sqrt(Math.pow(point.x - proj.x, 2) + Math.pow(point.y - proj.y, 2));
    }

    /**
     * Render the curve
     */
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('path');
            const pathEl = this._el as SVGPathElement;
            pathEl.setAttribute('stroke-width', '1');
            pathEl.setAttribute('stroke-linecap', 'round');
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('visibility', 'visible');
            pathEl.style.display = 'block';
            pathEl.style.pointerEvents = 'all';
        }

        const pathEl = this._el as SVGPathElement;
        pathEl.setAttribute('d', this.getPathData());
        pathEl.setAttribute('stroke', this._sc);
        pathEl.style.display = 'block';
    }

    translateBy(dx: number, dy: number): void {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;

        if (this._ctrl1) {
            this._ctrl1.x += dx;
            this._ctrl1.y += dy;
            this.setAttribute('ctrl1-x', this._ctrl1.x.toString());
            this.setAttribute('ctrl1-y', this._ctrl1.y.toString());
        }
        if (this._ctrl2) {
            this._ctrl2.x += dx;
            this._ctrl2.y += dy;
            this.setAttribute('ctrl2-x', this._ctrl2.x.toString());
            this.setAttribute('ctrl2-y', this._ctrl2.y.toString());
        }

        this.setAttribute('x1', this.x1.toString());
        this.setAttribute('y1', this.y1.toString());
        this.setAttribute('x2', this.x2.toString());
        this.setAttribute('y2', this.y2.toString());
        this.render();
    }

    // Add constructor definitions for interactive creation
    static get constructors() {
        return {
            ":click": ['pt_start', 'pt_end'],
            ":drag": ['pt_start', 'pt_end']
        };
    }
}

// Register the custom element for curve shapes:
customElements.define('gs-curve', GsCurveShape);
