import { HandleSpec, PathConstructorType, Point } from '../types';
import { GsShape } from './GsShape';

/**
 * Path shape component that wraps an SVG path
 */
export class GsPathShape extends GsShape {
    private d: string = '';
    private points: Point[] = [];
    private ah0: string = ''; // Arrowhead at start
    private ah1: string = ''; // Arrowhead at end

    constructor() {
        super();
    }

    /**
     * Define observed attributes
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'd', 'ah0', 'ah1'];
    }

    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'd':
                this.d = newValue;
                this.parsePathToPoints();
                break;
            case 'ah0':
                this.ah0 = newValue;
                break;
            case 'ah1':
                this.ah1 = newValue;
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
        if (this.hasAttribute('d')) {
            this.d = this.getAttribute('d') || '';
            this.parsePathToPoints();
        }

        if (this.hasAttribute('ah0')) {
            this.ah0 = this.getAttribute('ah0') || '';
        }

        if (this.hasAttribute('ah1')) {
            this.ah1 = this.getAttribute('ah1') || '';
        }

        this.render();
    }

    /**
     * Parse SVG path data to extract points
     */
    private parsePathToPoints(): void {
        // This is a simplified version that only handles M and L commands
        if (!this.d) {
            this.points = [];
            return;
        }

        const commandsRegex = /([ML])([^ML]*)/g;
        const points: Point[] = [];
        let match;

        while ((match = commandsRegex.exec(this.d)) !== null) {
            const command = match[1];
            const coordsStr = match[2].trim();
            const coords = coordsStr.split(/[\s,]+/).map(Number);

            for (let i = 0; i < coords.length; i += 2) {
                if (i + 1 < coords.length) {
                    points.push({ x: coords[i], y: coords[i + 1] });
                }
            }
        }

        this.points = points;
    }

    /**
     * Set path from array of points
     */
    setPoints(points: Point[]): void {
        this.points = [...points];

        if (points.length === 0) {
            this.d = '';
        } else {
            // Construct path data
            let pathData = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

            for (let i = 1; i < points.length; i++) {
                pathData += ` L${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
            }

            this.d = pathData;
        }

        this.setAttribute('d', this.d);
        this.render();
    }

    /**
     * Set a specific point at the given index
     */
    setPoint(index: number, p: Point): void {
        if (index >= 0 && index < this.points.length) {
            this.points[index] = { ...p };

            // Reconstruct path data
            if (this.points.length > 0) {
                let pathData = `M${this.points[0].x.toFixed(2)},${this.points[0].y.toFixed(2)}`;
                for (let i = 1; i < this.points.length; i++) {
                    pathData += ` L${this.points[i].x.toFixed(2)},${this.points[i].y.toFixed(2)}`;
                }
                this.d = pathData;
                this.setAttribute('d', this.d);
            }

            this.render();
        }
    }

    /**
     * Set SVG path data directly
     */
    setPathData(d: string): void {
        this.d = d;
        this.setAttribute('d', d);
        this.parsePathToPoints();
        this.render();
    }

    /**
     * Set arrowheads
     */
    setArrowheads(start: string, end: string): void {
        this.ah0 = start;
        this.ah1 = end;
        this.setAttribute('ah0', start);
        this.setAttribute('ah1', end);
        this.render();
    }

    /**
     * Get handles for the path
     */
    getHandles(): { [key: string]: HandleSpec } {
        const handles: { [key: string]: HandleSpec } = {};
        this.points.forEach((pt, index) => {
            handles[`pt_${index}`] = { p: { x: pt.x, y: pt.y } };
        });
        return handles;
    }

    /**
     * Hit test for the path
     */
    hitTest(point: Point, threshold: number = 5): boolean {
        // Check if point is near any segment of the path
        if (this.points.length < 2) return false;

        for (let i = 0; i < this.points.length - 1; i++) {
            const start = this.points[i];
            const end = this.points[i + 1];

            // Calculate distance from point to line segment
            const distance = this.distancePointToLine(point, start, end);

            if (distance <= threshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate distance from a point to a line segment
     */
    private distancePointToLine(point: Point, lineStart: Point, lineEnd: Point): number {
        // Calculate line length squared
        const lengthSquared = Math.pow(lineEnd.x - lineStart.x, 2) + Math.pow(lineEnd.y - lineStart.y, 2);

        // If line is a point, just calculate distance to that point
        if (lengthSquared === 0) {
            return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
        }

        // Calculate projection of point onto line
        const t = Math.max(0, Math.min(1, (
            (point.x - lineStart.x) * (lineEnd.x - lineStart.x) +
            (point.y - lineStart.y) * (lineEnd.y - lineStart.y)
        ) / lengthSquared));

        // Calculate closest point on line
        const closestX = lineStart.x + t * (lineEnd.x - lineStart.x);
        const closestY = lineStart.y + t * (lineEnd.y - lineStart.y);

        // Calculate distance to closest point
        return Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));
    }

    /**
     * Render the path
     */
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('path');
            const pathEl = this._el as SVGPathElement;
            pathEl.setAttribute('stroke-width', '2');
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('visibility', 'visible');
            pathEl.style.display = 'block';
        }

        const pathEl = this._el as SVGPathElement;

        // Set the path data
        if (this.points && this.points.length > 0) {
            const d = this.pointsToPathData(this.points);
            pathEl.setAttribute('d', d);
        }

        pathEl.setAttribute('stroke', this._sc);
    }

    /**
     * Convert points array to SVG path data
     */
    private pointsToPathData(points: Point[]): string {
        if (points.length === 0) return '';

        let pathData = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
        }
        return pathData;
    }

    /**
     * Translate the path by a delta
     */
    translateBy(dx: number, dy: number): void {
        // Translate all points by the delta
        this.points = this.points.map(p => ({ x: p.x + dx, y: p.y + dy }));

        // Update the d attribute to reflect new positions
        if (this.points.length > 0) {
            let pathData = `M${this.points[0].x.toFixed(2)},${this.points[0].y.toFixed(2)}`;
            for (let i = 1; i < this.points.length; i++) {
                pathData += ` L${this.points[i].x.toFixed(2)},${this.points[i].y.toFixed(2)}`;
            }
            this.d = pathData;
            this.setAttribute('d', this.d);
        }

        this.render();
    }
}

// Register the custom element
customElements.define('gs-path', GsPathShape);