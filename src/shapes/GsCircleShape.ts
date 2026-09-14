import { CircleConstructorType, Point, HandleSpec } from '../types';
import { GsShape, ShapeConstructors } from './GsShape';
import { GsPointShape } from './GsPointShape';
import { GsSketch } from '../components/GsSketch';

/**
 * Circle shape component that wraps an SVG circle
 */
export class GsCircleShape extends GsShape {
    private cx: number = 0;
    private cy: number = 0;
    private r: number = 20;

    private constructorType: CircleConstructorType = 'center-radius';

    private point1: Point | null = null;
    private point2: Point | null = null;
    private point3: Point | null = null;

    private _pointRef1: GsPointShape | null = null;
    private _pointRef2: GsPointShape | null = null;
    private _pointRef3: GsPointShape | null = null;
    private _sketch: GsSketch | null = null;

    // this is an ephemeral cache displaying the radius handle
    // otherwise it would just jump to the right side of the circle
    private _pt_radius : Point | null = null;

    constructor() {
        super();
    }

    static get constructors () : ShapeConstructors {
        return {
            ':click': ['pt_center'],
            ':drag': ['pt_center', 'pt_radius'],
            ':3points': ['pt_p1', 'pt_p2', 'pt_p3'],
        };
    }

    // #region handles
    /**
     * Setter for pt_radius.
     * Expects worldPt in SVG coordinates; calculates the new radius as the distance from the center.
     */
    set pt_radius(worldPt: Point) {
        this._pt_radius = worldPt;
        const dx = worldPt.x - this.cx;
        const dy = worldPt.y - this.cy;
        const newR = Math.sqrt(dx * dx + dy * dy);
        this.r = newR;
        this.setAttribute('r', newR.toString());
        this.render();
    }

    /**
     * Getter for pt_radius.
     * Returns the current radius as a point.
     */
    get pt_radius(): Point {
        if (this._pt_radius) {
            return this._pt_radius;
        } else {
            const newRadiusPoint = { x: this.cx + this.r, y: this.cy };
            this._pt_radius = newRadiusPoint;
            return newRadiusPoint;
        }
    }

    /**
     * Setter for pt_center.
     * Sets the center of the circle to the given point.
     */
    set pt_center(worldPt: Point) {
        const oldCx = this.cx;
        const oldCy = this.cy;
        this.cx = worldPt.x;
        this.cy = worldPt.y;
        this.setAttribute('cx', worldPt.x.toString());
        this.setAttribute('cy', worldPt.y.toString());

        if (this._pt_radius) {
            const deltaX = this.cx - oldCx;
            const deltaY = this.cy - oldCy;
            this._pt_radius = {
                x: this._pt_radius.x + deltaX,
                y: this._pt_radius.y + deltaY
            };
        }

        this.render();
    }

    /**
     * Getter for pt_center.
     * Returns the current center of the circle as a point.
     */
    get pt_center(): Point {
        return { x: this.cx, y: this.cy };
    }

    // #region 3-point constructor setters
    private _p1: Point | null = null;
    private _p2: Point | null = null;
    private _p3: Point | null = null;

    set pt_p1(p: Point) {
        if (this._pointRef1) { this._pointRef1.pt_center = p; }
        else { this._p1 = p; this._tryThreePoints(); }
    }
    set pt_p2(p: Point) {
        if (this._pointRef2) { this._pointRef2.pt_center = p; }
        else { this._p2 = p; this._tryThreePoints(); }
    }
    set pt_p3(p: Point) {
        if (this._pointRef3) { this._pointRef3.pt_center = p; }
        else { this._p3 = p; this._tryThreePoints(); }
    }

    private _tryThreePoints(): void {
        if (this._p1 && this._p2 && this._p3) {
            this.setThreePoints(this._p1, this._p2, this._p3);
        }
    }
    // #endregion

    // #region reactive point references
    get pointRef1(): GsPointShape | null { return this._pointRef1; }
    set pointRef1(pt: GsPointShape | null) {
        this._pointRef1?.removeDependent(this);
        this._pointRef1 = pt;
        pt?.addDependent(this);
        if (pt) this.setAttribute('p1', pt.id);
        this._tryRecalcFromRefs();
    }

    get pointRef2(): GsPointShape | null { return this._pointRef2; }
    set pointRef2(pt: GsPointShape | null) {
        this._pointRef2?.removeDependent(this);
        this._pointRef2 = pt;
        pt?.addDependent(this);
        if (pt) this.setAttribute('p2', pt.id);
        this._tryRecalcFromRefs();
    }

    get pointRef3(): GsPointShape | null { return this._pointRef3; }
    set pointRef3(pt: GsPointShape | null) {
        this._pointRef3?.removeDependent(this);
        this._pointRef3 = pt;
        pt?.addDependent(this);
        if (pt) this.setAttribute('p3', pt.id);
        this._tryRecalcFromRefs();
    }

    private _tryRecalcFromRefs(): void {
        if (this._pointRef1 && this._pointRef2 && this._pointRef3) {
            this.setThreePoints(
                this._pointRef1.pt_center,
                this._pointRef2.pt_center,
                this._pointRef3.pt_center
            );
        }
    }

    override pointMoved(_point: GsShape): void {
        this._tryRecalcFromRefs();
    }
    // #endregion

    /**
     * Get handles for the circle based on constructor type.
     * Updated to include the full circle's bounding box (four corners) plus the center.
     */
    getHandles(): { [key: string]: HandleSpec } {
        if (this._pointRef1 && this._pointRef2 && this._pointRef3) {
            return {
                "p1": { p: this._pointRef1.pt_center },
                "p2": { p: this._pointRef2.pt_center },
                "p3": { p: this._pointRef3.pt_center },
            };
        }
        return {
            "center": { p: this.pt_center },
            "radius": { p: this.pt_radius }
        };
    }
    // #endregion



    /**
     * Define observed attributes
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'cx', 'cy', 'r', 'constructor-type', 'p1', 'p2', 'p3'];
    }

    /**
     * Handle attribute changes
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'cx':
                this.cx = parseFloat(newValue) || 0;
                break;
            case 'cy':
                this.cy = parseFloat(newValue) || 0;
                break;
            case 'r':
                this.r = parseFloat(newValue) || 0;
                break;
            case 'constructor-type':
                if (newValue === 'center-radius' ||
                    newValue === 'three-points' ||
                    newValue === 'compass') {
                    this.constructorType = newValue as CircleConstructorType;
                }
                break;
            case 'p1':
            case 'p2':
            case 'p3':
                if (this._sketch && newValue) {
                    const pt = this._sketch.getShapeById(newValue) as GsPointShape;
                    if (pt) {
                        if (name === 'p1') this.pointRef1 = pt;
                        else if (name === 'p2') this.pointRef2 = pt;
                        else this.pointRef3 = pt;
                    }
                }
                return; // pointRef setters already trigger recalc + render
        }

        this.render();
    }

    /**
     * Initialize when element is added to DOM
     */
    connectedCallback() {
        super.connectedCallback();
        this._sketch = this.closest('gs-sketch') as GsSketch;

        // Get initial attributes
        if (this.hasAttribute('cx')) {
            this.cx = parseFloat(this.getAttribute('cx') || '0');
        }

        if (this.hasAttribute('cy')) {
            this.cy = parseFloat(this.getAttribute('cy') || '0');
        }

        if (this.hasAttribute('r') || this.hasAttribute('radius')) {
            this.r = parseFloat(this.getAttribute('r') || this.getAttribute('radius') || '0');
        }

        if (this.hasAttribute('constructor-type')) {
            const type = this.getAttribute('constructor-type');
            if (type === 'center-radius' || type === 'three-points' || type === 'compass') {
                this.constructorType = type as CircleConstructorType;
            }
        }

        // Reconnect point references from attributes
        if (this._sketch) {
            this._reconnectPointRefs();
        }

        this.render();
    }

    disconnectedCallback() {
        this._pointRef1?.removeDependent(this);
        this._pointRef2?.removeDependent(this);
        this._pointRef3?.removeDependent(this);
    }

    sketchReadyCallback(): void {
        if (!this._sketch) {
            this._sketch = this.closest('gs-sketch') as GsSketch;
        }
        this._reconnectPointRefs();
    }

    private _reconnectPointRefs(): void {
        if (!this._sketch) return;
        const p1Id = this.getAttribute('p1');
        const p2Id = this.getAttribute('p2');
        const p3Id = this.getAttribute('p3');
        if (p1Id) {
            const pt = this._sketch.getShapeById(p1Id) as GsPointShape;
            if (pt) this.pointRef1 = pt;
        }
        if (p2Id) {
            const pt = this._sketch.getShapeById(p2Id) as GsPointShape;
            if (pt) this.pointRef2 = pt;
        }
        if (p3Id) {
            const pt = this._sketch.getShapeById(p3Id) as GsPointShape;
            if (pt) this.pointRef3 = pt;
        }
    }

    /**
     * Set circle using center point and radius
     */
    setCenterRadius(cx: number, cy: number, r: number): void {
        this.cx = cx;
        this.cy = cy;
        this.r = r;
        this.constructorType = 'center-radius';

        // Update attributes
        this.setAttribute('cx', cx.toString());
        this.setAttribute('cy', cy.toString());
        this.setAttribute('r', r.toString());
        this.setAttribute('constructor-type', this.constructorType);

        this.render();
    }

    /**
     * Set circle using three points on its perimeter
     */
    setThreePoints(p1: Point, p2: Point, p3: Point): void {
        this.point1 = p1;
        this.point2 = p2;
        this.point3 = p3;
        this.constructorType = 'three-points';

        // Calculate center and radius from three points
        const x1 = p1.x;
        const y1 = p1.y;
        const x2 = p2.x;
        const y2 = p2.y;
        const x3 = p3.x;
        const y3 = p3.y;

        // Check if points are collinear (would result in division by zero)
        const collinearCheck = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
        if (Math.abs(collinearCheck) < 1e-10) {
            console.error('Cannot create circle: points are collinear');
            return;
        }

        // Calculate perpendicular bisectors
        const x12 = x1 - x2;
        const y12 = y1 - y2;
        const x13 = x1 - x3;
        const y13 = y1 - y3;

        const a = ((x1 * x1 + y1 * y1) - (x2 * x2 + y2 * y2)) / 2;
        const b = ((x1 * x1 + y1 * y1) - (x3 * x3 + y3 * y3)) / 2;

        // Calculate the center of the circle
        const cx = (a * (y1 - y3) - b * (y1 - y2)) / (x12 * (y1 - y3) - x13 * (y1 - y2));
        const cy = (a * x13 - b * x12) / (y12 * x13 - y13 * x12);

        // Calculate the radius
        const r = Math.sqrt(Math.pow(cx - x1, 2) + Math.pow(cy - y1, 2));

        // Update properties
        this.cx = cx;
        this.cy = cy;
        this.r = r;

        // Update attributes
        this.setAttribute('cx', cx.toString());
        this.setAttribute('cy', cy.toString());
        this.setAttribute('r', r.toString());
        this.setAttribute('constructor-type', this.constructorType);

        this.render();
    }

    /**
     * Set circle using compass method (center + two points for radius)
     */
    setCompass(center: Point, p1: Point, p2: Point): void {
        const cx = center.x;
        const cy = center.y;

        // Radius is the distance from center to midpoint between p1 and p2
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const r = Math.sqrt(Math.pow(cx - midX, 2) + Math.pow(cy - midY, 2));

        this.point1 = center;
        this.point2 = p1;
        this.point3 = p2;
        this.constructorType = 'compass';
        this.cx = cx;
        this.cy = cy;
        this.r = r;

        // Update attributes
        this.setAttribute('cx', cx.toString());
        this.setAttribute('cy', cy.toString());
        this.setAttribute('r', r.toString());
        this.setAttribute('constructor-type', this.constructorType);

        this.render();
    }

    /**
     * Returns the bounding box for the circle.
     * This is based on the circle's center and radius.
     */
    getBoundingBox(): { x: number, y: number, width: number, height: number } {
        return {
            x: this.cx - this.r,
            y: this.cy - this.r,
            width: 2 * this.r,
            height: 2 * this.r
        };
    }

    /**
     * Hit test for the circle
     */
    hitTest(point: Point, threshold: number = 5): boolean {
        try {
            // Calculate distance from point to circle center
            const distance = Math.sqrt(
                Math.pow(point.x - this.cx, 2) + Math.pow(point.y - this.cy, 2)
            );

            // A more lenient hit test: is the point inside or close to the circle?
            // This makes the entire filled area selectable, not just the perimeter
            const insideCircle = distance <= this.r + threshold;

            return insideCircle;
        } catch (error) {
            console.error(`[CircleShape] Hit test error:`, error);
            return false;
        }
    }

    render(): void {
        // In render, clear the cached radius point
        if (!this._el) {
            this._el = this.createSvgElement('circle');
        }
        const el = this._el as SVGCircleElement;
        el.setAttribute('stroke-width', '2');
        el.setAttribute('cx', this.cx.toString());
        el.setAttribute('cy', this.cy.toString());
        el.setAttribute('r', this.r.toString());
        el.setAttribute('fill', this._fc);
        el.setAttribute('stroke', this._sc);
    }

    translateBy(dx: number, dy: number): void {
        if (this._pointRef1 && this._pointRef2 && this._pointRef3) return;
        this.pt_center = { x: this.cx + dx, y: this.cy + dy };
    }
}

customElements.define('gs-circle', GsCircleShape);