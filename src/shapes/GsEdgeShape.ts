import { GsShape } from './GsShape';
import { GsLineShape } from './GsLineShape';
import { GsCurveShape } from './GsCurveShape';
import { HandleSpec, Point } from '../types';
import { GsNodeShape } from './GsNodeShape';
import { GsSketch } from '../components/GsSketch';
import { nearestPointOnRect, truncatedLineBetweenRectangles } from '../utils/geometry';

/**
 * Edge shape that connects two nodes. Supports both straight lines and bezier curves.
 * Uses composition - delegates to GsLineShape or GsCurveShape based on controlCount.
 */
export class GsEdgeShape extends GsShape {

    private _backingShape: GsLineShape | GsCurveShape;
    private _controlCount: number = 0;
    private _ctrl1: Point | null = null;
    private _ctrl2: Point | null = null;

    private _src: GsNodeShape | null = null;
    private _dst: GsNodeShape | null = null;
    private _sketch: GsSketch | null = null;

    // Anchor points: percentage (0-1) position on node bounding box
    // null means auto-calculate using truncatedLineBetweenRectangles
    private _srcAnchor: Point | null = null;
    private _dstAnchor: Point | null = null;

    // Arrow state bitmask: 0=none, 1=at start, 2=at end, 4=flip direction
    // Examples: 1=arrow at start pointing toward start, 2=arrow at end pointing toward end
    //           6=arrow at end pointing toward start (2+4), 5=arrow at start pointing toward end (1+4)
    private _arrowState: number = 0;
    private _arrowSize: number = 8;

    // Parametric draw position: 0=nothing drawn, 1=fully drawn
    private _t: number = 1;

    // Persistent SVG elements for arrows and guide lines
    private _groupEl: SVGGElement | null = null;
    private _arrowStartEl: SVGPathElement | null = null;
    private _arrowEndEl: SVGPathElement | null = null;
    private _guideLineEl: SVGPathElement | null = null;
    private _bubbleEl: SVGCircleElement | null = null;
    private _showGuides: boolean = false;

    // Stroke style: dashed for lo branch edges in BDD
    private _dashed: boolean = false;

    // Complemented edge: inverted output, drawn with bubble arrowhead
    private _inv: boolean = false;

    // Edge label
    private _label: string = '';
    private _labelEl: SVGTextElement | null = null;
    private _labelColor: string = '#404040';
    private _labelFont: string = 'Arial, sans-serif';
    private _labelSize: number = 11;

    constructor() {
        super();
        this._backingShape = new GsLineShape();
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'src', 'dst', 'x1', 'y1', 'x2', 'y2',
                'control-count', 'ctrl1-x', 'ctrl1-y', 'ctrl2-x', 'ctrl2-y', 'arrow-state',
                'src-anchor-x', 'src-anchor-y', 'dst-anchor-x', 'dst-anchor-y', 't', 'dashed', 'inv',
                'label', 'label-color', 'label-font', 'label-size'];
    }

    connectedCallback() {
        super.connectedCallback();
        this._sketch = this.closest('gs-sketch') as GsSketch;

        // Initialize from attributes
        if (this.hasAttribute('x1')) {
            this.pt_start = {
                x: parseFloat(this.getAttribute('x1') || '0'),
                y: parseFloat(this.getAttribute('y1') || '0')
            };
        }
        if (this.hasAttribute('x2')) {
            this.pt_end = {
                x: parseFloat(this.getAttribute('x2') || '0'),
                y: parseFloat(this.getAttribute('y2') || '0')
            };
        }
        if (this.hasAttribute('control-count')) {
            this.controlCount = parseInt(this.getAttribute('control-count') || '0', 10);
        }
        if (this.hasAttribute('ctrl1-x') && this.hasAttribute('ctrl1-y')) {
            this.ctrl1 = {
                x: parseFloat(this.getAttribute('ctrl1-x') || '0'),
                y: parseFloat(this.getAttribute('ctrl1-y') || '0')
            };
        }
        if (this.hasAttribute('ctrl2-x') && this.hasAttribute('ctrl2-y')) {
            this.ctrl2 = {
                x: parseFloat(this.getAttribute('ctrl2-x') || '0'),
                y: parseFloat(this.getAttribute('ctrl2-y') || '0')
            };
        }
        if (this.hasAttribute('arrow-state')) {
            this._arrowState = parseInt(this.getAttribute('arrow-state') || '0', 10);
        }
        if (this.hasAttribute('t')) {
            this._t = Math.max(0, Math.min(1, parseFloat(this.getAttribute('t') || '1')));
        }

        // Initialize anchors from attributes
        if (this.hasAttribute('src-anchor-x') && this.hasAttribute('src-anchor-y')) {
            this._srcAnchor = {
                x: parseFloat(this.getAttribute('src-anchor-x') || '0.5'),
                y: parseFloat(this.getAttribute('src-anchor-y') || '0.5')
            };
        }
        if (this.hasAttribute('dst-anchor-x') && this.hasAttribute('dst-anchor-y')) {
            this._dstAnchor = {
                x: parseFloat(this.getAttribute('dst-anchor-x') || '0.5'),
                y: parseFloat(this.getAttribute('dst-anchor-y') || '0.5')
            };
        }

        // Connect to nodes if specified
        if (this._sketch) {
            const srcId = this.getAttribute('src');
            if (srcId) {
                this.src = this._sketch.getShapeById(srcId) as GsNodeShape;
            }
            const dstId = this.getAttribute('dst');
            if (dstId) {
                this.dst = this._sketch.getShapeById(dstId) as GsNodeShape;
            }
            // Rebuild with anchors now that nodes are connected
            if (this._src || this._dst) {
                this.rebuildEdge();
            }
        }

        this.render();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'src':
                if (this._sketch) {
                    this.src = this._sketch.getShapeById(newValue) as GsNodeShape;
                }
                break;
            case 'dst':
                if (this._sketch) {
                    this.dst = this._sketch.getShapeById(newValue) as GsNodeShape;
                }
                break;
            case 'x1':
            case 'y1':
                this._backingShape.pt_start = {
                    x: parseFloat(this.getAttribute('x1') || '0'),
                    y: parseFloat(this.getAttribute('y1') || '0')
                };
                break;
            case 'x2':
            case 'y2':
                this._backingShape.pt_end = {
                    x: parseFloat(this.getAttribute('x2') || '0'),
                    y: parseFloat(this.getAttribute('y2') || '0')
                };
                break;
            case 'control-count':
                this.controlCount = parseInt(newValue || '0', 10);
                break;
            case 'ctrl1-x':
            case 'ctrl1-y':
                if (this.hasAttribute('ctrl1-x') && this.hasAttribute('ctrl1-y')) {
                    this.ctrl1 = {
                        x: parseFloat(this.getAttribute('ctrl1-x') || '0'),
                        y: parseFloat(this.getAttribute('ctrl1-y') || '0')
                    };
                }
                break;
            case 'ctrl2-x':
            case 'ctrl2-y':
                if (this.hasAttribute('ctrl2-x') && this.hasAttribute('ctrl2-y')) {
                    this.ctrl2 = {
                        x: parseFloat(this.getAttribute('ctrl2-x') || '0'),
                        y: parseFloat(this.getAttribute('ctrl2-y') || '0')
                    };
                }
                break;
            case 'arrow-state':
                this.arrowState = parseInt(newValue || '0', 10);
                break;
            case 'src-anchor-x':
            case 'src-anchor-y':
                if (this.hasAttribute('src-anchor-x') && this.hasAttribute('src-anchor-y')) {
                    this._srcAnchor = {
                        x: parseFloat(this.getAttribute('src-anchor-x') || '0.5'),
                        y: parseFloat(this.getAttribute('src-anchor-y') || '0.5')
                    };
                    this.rebuildEdge();
                }
                break;
            case 'dst-anchor-x':
            case 'dst-anchor-y':
                if (this.hasAttribute('dst-anchor-x') && this.hasAttribute('dst-anchor-y')) {
                    this._dstAnchor = {
                        x: parseFloat(this.getAttribute('dst-anchor-x') || '0.5'),
                        y: parseFloat(this.getAttribute('dst-anchor-y') || '0.5')
                    };
                    this.rebuildEdge();
                }
                break;
            case 't':
                const parsedT = parseFloat(newValue);
                this._t = Math.max(-1, Math.min(1, isNaN(parsedT) ? 1 : parsedT));
                this.render();
                break;
            case 'dashed':
                this._dashed = newValue !== null && newValue !== 'false';
                this.render();
                break;
            case 'inv':
                this._inv = newValue !== null && newValue !== 'false';
                this.render();
                break;
            case 'label':
                this._label = newValue || '';
                this.render();
                break;
            case 'label-color':
                this._labelColor = newValue || '#404040';
                this.render();
                break;
            case 'label-font':
                this._labelFont = newValue || 'Arial, sans-serif';
                this.render();
                break;
            case 'label-size':
                this._labelSize = parseFloat(newValue) || 11;
                this.render();
                break;
        }
    }

    // #region accessors
    get src(): GsNodeShape | null { return this._src; }
    set src(node: GsNodeShape | null) {
        this._src?.removeOutgoingEdge(this);
        this._src = node;
        if (node) {
            this.setAttribute('src', node.id);
            node.addOutgoingEdge(this);
        }
    }

    get dst(): GsNodeShape | null { return this._dst; }
    set dst(node: GsNodeShape | null) {
        this._dst?.removeIncomingEdge(this);
        this._dst = node;
        if (node) {
            this.setAttribute('dst', node.id);
            node.addIncomingEdge(this);
            // Rebuild edge geometry now that destination is set
            if (this._src) {
                this.rebuildEdge();
            }
        }
    }

    get srcAnchor(): Point | null { return this._srcAnchor; }
    set srcAnchor(anchor: Point | null) {
        this._srcAnchor = anchor;
        if (anchor) {
            this.setAttribute('src-anchor-x', anchor.x.toString());
            this.setAttribute('src-anchor-y', anchor.y.toString());
        } else {
            this.removeAttribute('src-anchor-x');
            this.removeAttribute('src-anchor-y');
        }
        this.rebuildEdge();
    }

    get dstAnchor(): Point | null { return this._dstAnchor; }
    set dstAnchor(anchor: Point | null) {
        this._dstAnchor = anchor;
        if (anchor) {
            this.setAttribute('dst-anchor-x', anchor.x.toString());
            this.setAttribute('dst-anchor-y', anchor.y.toString());
        } else {
            this.removeAttribute('dst-anchor-x');
            this.removeAttribute('dst-anchor-y');
        }
        this.rebuildEdge();
    }

    get controlCount(): number { return this._controlCount; }
    set controlCount(value: number) {
        if (value === this._controlCount) return;

        const oldStart = this.pt_start;
        const oldEnd = this.pt_end;
        const oldSc = this._sc;

        this._controlCount = value;

        // Switch backing shape type based on control count
        if (value > 0 && this._backingShape instanceof GsLineShape) {
            this._backingShape = new GsCurveShape();
            this._backingShape.sc = oldSc;
            this._backingShape.pt_start = oldStart;
            this._backingShape.pt_end = oldEnd;
            if (this._ctrl1) {
                (this._backingShape as GsCurveShape).ctrl1 = this._ctrl1;
            }
            if (this._ctrl2) {
                (this._backingShape as GsCurveShape).ctrl2 = this._ctrl2;
            }
        } else if (value === 0 && this._backingShape instanceof GsCurveShape) {
            this._backingShape = new GsLineShape();
            this._backingShape.sc = oldSc;
            this._backingShape.pt_start = oldStart;
            this._backingShape.pt_end = oldEnd;
        }

        this.setAttribute('control-count', value.toString());
        this.render();
    }

    get ctrl1(): Point | null { return this._ctrl1; }
    set ctrl1(point: Point | null) {
        this._ctrl1 = point;
        if (this._backingShape instanceof GsCurveShape) {
            (this._backingShape as GsCurveShape).ctrl1 = point;
        }
        if (point) {
            this.setAttribute('ctrl1-x', point.x.toString());
            this.setAttribute('ctrl1-y', point.y.toString());
        } else {
            this.removeAttribute('ctrl1-x');
            this.removeAttribute('ctrl1-y');
        }
        this.render();
    }

    get ctrl2(): Point | null { return this._ctrl2; }
    set ctrl2(point: Point | null) {
        this._ctrl2 = point;
        if (this._backingShape instanceof GsCurveShape) {
            (this._backingShape as GsCurveShape).ctrl2 = point;
        }
        if (point) {
            this.setAttribute('ctrl2-x', point.x.toString());
            this.setAttribute('ctrl2-y', point.y.toString());
        } else {
            this.removeAttribute('ctrl2-x');
            this.removeAttribute('ctrl2-y');
        }
        this.render();
    }

    // Arrow state: 0=none, 1=start, 2=end, 3=both
    get arrowState(): number { return this._arrowState; }
    set arrowState(value: number) {
        this._arrowState = value;
        this.setAttribute('arrow-state', value.toString());
        this.render();
    }

    get arrowSize(): number { return this._arrowSize; }
    set arrowSize(value: number) {
        this._arrowSize = value;
        this.render();
    }

    get showGuides(): boolean { return this._showGuides; }
    set showGuides(value: boolean) {
        if (this._showGuides !== value) {
            this._showGuides = value;
            this.render();
        }
    }

    // Parametric draw position:
    // 0 = nothing drawn
    // 1 = fully drawn (start to end)
    // -1 = fully drawn (end to start, visually same as 1)
    // 0 to 1 = line extends from start toward end
    // 0 to -1 = line extends from end toward start
    get t(): number { return this._t; }
    set t(value: number) {
        const clamped = Math.max(-1, Math.min(1, value));
        if (this._t !== clamped) {
            this._t = clamped;
            this.setAttribute('t', clamped.toString());
            this.render();
        }
    }

    // Dashed stroke style (for "lo" branch edges in BDD)
    get dashed(): boolean { return this._dashed; }
    set dashed(value: boolean) {
        if (this._dashed !== value) {
            this._dashed = value;
            if (value) {
                this.setAttribute('dashed', 'true');
            } else {
                this.removeAttribute('dashed');
            }
            this.render();
        }
    }

    // Complemented edge (inverted output, drawn with bubble)
    get inv(): boolean { return this._inv; }
    set inv(value: boolean) {
        if (this._inv !== value) {
            this._inv = value;
            if (value) {
                this.setAttribute('inv', 'true');
            } else {
                this.removeAttribute('inv');
            }
            this.render();
        }
    }
    // Edge label text
    get label(): string { return this._label; }
    set label(value: string) {
        this._label = value;
        if (value) {
            this.setAttribute('label', value);
        } else {
            this.removeAttribute('label');
        }
        this.render();
    }

    get labelColor(): string { return this._labelColor; }
    set labelColor(value: string) {
        this._labelColor = value;
        if (value !== '#404040') {
            this.setAttribute('label-color', value);
        } else {
            this.removeAttribute('label-color');
        }
        this.render();
    }

    get labelFont(): string { return this._labelFont; }
    set labelFont(value: string) {
        this._labelFont = value;
        this.setAttribute('label-font', value);
        this.render();
    }

    get labelSize(): number { return this._labelSize; }
    set labelSize(value: number) {
        this._labelSize = value;
        this.setAttribute('label-size', value.toString());
        this.render();
    }
    // #endregion

    // #region handles
    get pt_start(): Point {
        return this._backingShape.pt_start;
    }
    set pt_start(worldPt: Point) {
        this._backingShape.pt_start = worldPt;
        this.setAttribute('x1', worldPt.x.toString());
        this.setAttribute('y1', worldPt.y.toString());
    }

    get pt_end(): Point {
        return this._backingShape.pt_end;
    }
    set pt_end(worldPt: Point) {
        this._backingShape.pt_end = worldPt;
        this.setAttribute('x2', worldPt.x.toString());
        this.setAttribute('y2', worldPt.y.toString());
    }

    get pt_ctrl1(): Point | null {
        return this._ctrl1;
    }
    set pt_ctrl1(worldPt: Point | null) {
        this.ctrl1 = worldPt;  // Use the existing ctrl1 setter which handles backing shape
    }

    get pt_ctrl2(): Point | null {
        return this._ctrl2;
    }
    set pt_ctrl2(worldPt: Point | null) {
        this.ctrl2 = worldPt;  // Use the existing ctrl2 setter which handles backing shape
    }

    getHandles(): { [key: string]: HandleSpec } {
        const handles: { [key: string]: HandleSpec } = {
            start: { p: this.pt_start },
            end: { p: this.pt_end }
        };
        // Add control point handles with diamond shape for visual distinction
        if (this._ctrl1) {
            handles.ctrl1 = { p: this._ctrl1, sh: 'diamond', fc: '#ffcc00' };
        }
        if (this._ctrl2) {
            handles.ctrl2 = { p: this._ctrl2, sh: 'diamond', fc: '#ffcc00' };
        }
        return handles;
    }
    // #endregion

    setPoints(start: Point, end: Point, ctrl1?: Point, ctrl2?: Point): void {
        this._backingShape.pt_start = start;
        this._backingShape.pt_end = end;
        this.setAttribute('x1', start.x.toString());
        this.setAttribute('y1', start.y.toString());
        this.setAttribute('x2', end.x.toString());
        this.setAttribute('y2', end.y.toString());

        if (ctrl1 && this._backingShape instanceof GsCurveShape) {
            this._ctrl1 = ctrl1;
            (this._backingShape as GsCurveShape).ctrl1 = ctrl1;
            this.setAttribute('ctrl1-x', ctrl1.x.toString());
            this.setAttribute('ctrl1-y', ctrl1.y.toString());
        }
        if (ctrl2 && this._backingShape instanceof GsCurveShape) {
            this._ctrl2 = ctrl2;
            (this._backingShape as GsCurveShape).ctrl2 = ctrl2;
            this.setAttribute('ctrl2-x', ctrl2.x.toString());
            this.setAttribute('ctrl2-y', ctrl2.y.toString());
        }

        this.render();
    }

    /** Calculate a point on a bounding box from anchor percentages (0-1) */
    private anchorToPoint(box: { x: number, y: number, width: number, height: number }, anchor: Point): Point {
        return {
            x: box.x + box.width * anchor.x,
            y: box.y + box.height * anchor.y
        };
    }

    // #region bezier helpers for parametric drawing
    /** Linear interpolation */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /** Point on line at parameter t */
    private pointOnLine(p0: Point, p1: Point, t: number): Point {
        return {
            x: this.lerp(p0.x, p1.x, t),
            y: this.lerp(p0.y, p1.y, t)
        };
    }

    /** Point on quadratic bezier at parameter t */
    private pointOnQuadratic(p0: Point, p1: Point, p2: Point, t: number): Point {
        const mt = 1 - t;
        return {
            x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
            y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
        };
    }

    /** Point on cubic bezier at parameter t */
    private pointOnCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
            y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
        };
    }

    /** Tangent direction on quadratic bezier at parameter t (normalized) */
    private tangentOnQuadratic(p0: Point, p1: Point, p2: Point, t: number): Point {
        const mt = 1 - t;
        const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
        const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
        const len = Math.sqrt(dx * dx + dy * dy);
        return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    }

    /** Tangent direction on cubic bezier at parameter t (normalized) */
    private tangentOnCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        const dx = 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x);
        const dy = 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y);
        const len = Math.sqrt(dx * dx + dy * dy);
        return len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    }

    /**
     * Split a quadratic bezier at parameter t, returning the first segment's control points.
     * Uses de Casteljau algorithm.
     */
    private splitQuadraticAt(p0: Point, p1: Point, p2: Point, t: number): { p0: Point, p1: Point, p2: Point } {
        const q0 = this.pointOnLine(p0, p1, t);
        const q1 = this.pointOnLine(p1, p2, t);
        const r0 = this.pointOnLine(q0, q1, t);
        return { p0, p1: q0, p2: r0 };
    }

    /**
     * Split a cubic bezier at parameter t, returning the first segment's control points.
     * Uses de Casteljau algorithm.
     */
    private splitCubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { p0: Point, p1: Point, p2: Point, p3: Point } {
        const q0 = this.pointOnLine(p0, p1, t);
        const q1 = this.pointOnLine(p1, p2, t);
        const q2 = this.pointOnLine(p2, p3, t);
        const r0 = this.pointOnLine(q0, q1, t);
        const r1 = this.pointOnLine(q1, q2, t);
        const s0 = this.pointOnLine(r0, r1, t);
        return { p0, p1: q0, p2: r0, p3: s0 };
    }
    // #endregion

    private rebuildEdge(): void {
        // Don't rebuild if nodes aren't ready yet
        if (!this._src || !this._dst) {
            return;
        }

        // Safety check to ensure nodes have valid dimensions
        try {
            const srcBox = this._src.getBoundingBox();
            const dstBox = this._dst.getBoundingBox();

            // Check if boxes are valid (have non-zero dimensions)
            if (srcBox.width <= 0 || srcBox.height <= 0 || dstBox.width <= 0 || dstBox.height <= 0) {
                // Defer rebuild until nodes are properly sized
                requestAnimationFrame(() => this.rebuildEdge());
                return;
            }

            let start: Point;
            let end: Point;

            // Use anchors if available, otherwise auto-calculate
            if (this._srcAnchor && this._dstAnchor) {
                // Both anchors specified - use them directly
                start = this.anchorToPoint(srcBox, this._srcAnchor);
                end = this.anchorToPoint(dstBox, this._dstAnchor);
            } else if (this._srcAnchor) {
                // Only source anchor - calculate destination
                start = this.anchorToPoint(srcBox, this._srcAnchor);
                end = nearestPointOnRect(start,
                    { x: dstBox.x, y: dstBox.y },
                    { x: dstBox.x + dstBox.width, y: dstBox.y + dstBox.height });
            } else if (this._dstAnchor) {
                // Only destination anchor - calculate source
                end = this.anchorToPoint(dstBox, this._dstAnchor);
                start = nearestPointOnRect(end,
                    { x: srcBox.x, y: srcBox.y },
                    { x: srcBox.x + srcBox.width, y: srcBox.y + srcBox.height });
            } else {
                // No anchors - auto-calculate both endpoints
                const srcCorner1 = { x: srcBox.x, y: srcBox.y };
                const srcCorner2 = { x: srcBox.x + srcBox.width, y: srcBox.y + srcBox.height };
                const dstCorner1 = { x: dstBox.x, y: dstBox.y };
                const dstCorner2 = { x: dstBox.x + dstBox.width, y: dstBox.y + dstBox.height };
                const result = truncatedLineBetweenRectangles(
                    {corner1:srcCorner1, corner2:srcCorner2},
                    {corner1:dstCorner1, corner2:dstCorner2});
                start = result.start;
                end = result.end;
            }

            this.pt_start = start;
            this.pt_end = end;
            this.render();
        } catch (error) {
            console.warn('GsEdgeShape: Error rebuilding edge, deferring:', error);
            // Defer rebuild if there's an error (nodes might not be ready)
            requestAnimationFrame(() => this.rebuildEdge());
        }
    }

    srcMoved(): void {
        if (this._src && this._dst) {
            this.rebuildEdge();
        } else if (this._src) {
            try {
                const srcBox = this._src.getBoundingBox();
                if (srcBox.width <= 0 || srcBox.height <= 0) return; // Not ready yet

                const srcCorner1 = { x: srcBox.x, y: srcBox.y };
                const srcCorner2 = { x: srcBox.x + srcBox.width, y: srcBox.y + srcBox.height };
                const newStart = nearestPointOnRect(this.pt_end, srcCorner1, srcCorner2);
                this.pt_start = newStart;
                this.render();
            } catch (error) {
                console.warn('GsEdgeShape: Error in srcMoved:', error);
            }
        }
    }

    dstMoved(): void {
        if (this._dst && this._src) {
            this.rebuildEdge();
        } else if (this._dst) {
            try {
                const dstBox = this._dst.getBoundingBox();
                if (dstBox.width <= 0 || dstBox.height <= 0) return; // Not ready yet

                const dstCorner1 = { x: dstBox.x, y: dstBox.y };
                const dstCorner2 = { x: dstBox.x + dstBox.width, y: dstBox.y + dstBox.height };
                const newEnd = nearestPointOnRect(this.pt_start, dstCorner1, dstCorner2);
                this.pt_end = newEnd;
                this.render();
            } catch (error) {
                console.warn('GsEdgeShape: Error in dstMoved:', error);
            }
        }
    }

    sketchReadyCallback(): void {
        if (!this._sketch) {
            this._sketch = this.closest('gs-sketch') as GsSketch;
        }

        if (this.hasAttribute('src')) {
            const srcId = this.getAttribute('src');
            if (srcId && this._sketch) {
                this.src = this._sketch.getShapeById(srcId) as GsNodeShape;
            }
        }

        if (this.hasAttribute('dst')) {
            const dstId = this.getAttribute('dst');
            if (dstId && this._sketch) {
                this.dst = this._sketch.getShapeById(dstId) as GsNodeShape;
            }
        }

        // Only rebuild edge if both nodes are found and ready
        if (this._src && this._dst) {
            // Use requestAnimationFrame to ensure nodes have completed their initialization
            requestAnimationFrame(() => {
                this.rebuildEdge();
            });
        }
    }

    render(): void {
        // Always use a group to avoid issues when _el changes between line and group
        if (!this._groupEl) {
            this._groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            this._guideLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this._arrowStartEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this._arrowEndEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this._guideLineEl.setAttribute('stroke', '#999');
            this._guideLineEl.setAttribute('stroke-width', '1');
            this._guideLineEl.setAttribute('stroke-dasharray', '3,3');
            this._guideLineEl.setAttribute('fill', 'none');
            this._guideLineEl.setAttribute('pointer-events', 'none');
            this._arrowStartEl.setAttribute('stroke', 'none');
            this._arrowEndEl.setAttribute('stroke', 'none');
            this._bubbleEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            this._bubbleEl.setAttribute('stroke-width', '2');
            this._labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            this._labelEl.setAttribute('text-anchor', 'middle');
            this._labelEl.setAttribute('pointer-events', 'none');
            this._groupEl.appendChild(this._guideLineEl);
            this._groupEl.appendChild(this._arrowStartEl);
            this._groupEl.appendChild(this._arrowEndEl);
            this._groupEl.appendChild(this._bubbleEl);
            this._groupEl.appendChild(this._labelEl);
        }

        this._el = this._groupEl;

        // If t=0, hide everything and return
        if (this._t === 0) {
            this._groupEl.style.display = 'none';
            return;
        }
        this._groupEl.style.display = '';

        this._backingShape.sc = this._sc;
        this._backingShape.render();

        const backingEl = this._backingShape.getSvgElement()!;

        // Ensure backing shape is in the group (insert at beginning so arrows draw on top)
        if (backingEl.parentNode !== this._groupEl) {
            // Remove old backing element if it exists (happens when switching line <-> curve)
            const firstChild = this._groupEl.firstChild;
            if (firstChild && firstChild !== this._arrowStartEl && firstChild !== this._arrowEndEl && firstChild !== this._guideLineEl) {
                this._groupEl.removeChild(firstChild);
            }
            this._groupEl.insertBefore(backingEl, this._groupEl.firstChild);
        }

        // Apply dashed stroke style if enabled
        if (this._dashed) {
            backingEl.setAttribute('stroke-dasharray', '6 3');
        } else {
            backingEl.removeAttribute('stroke-dasharray');
        }

        const start = this.pt_start;
        const end = this.pt_end;

        // Guard against invalid coordinates (can happen during animation before nodes are positioned)
        if (start.x == null || start.y == null || end.x == null || end.y == null ||
            isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
            return;
        }

        // Calculate effective start/end and tangent based on t
        // t > 0: draw from start toward end
        // t < 0: draw from end toward start
        let effectiveStart: Point = start;
        let effectiveEnd: Point = end;
        let effectiveTangent: Point | null = null; // direction vector at drawing tip
        const absT = Math.abs(this._t);
        const drawFromEnd = this._t < 0;

        if (absT < 1) {
            if (this._controlCount === 0) {
                // Straight line: simple lerp
                if (drawFromEnd) {
                    // Draw from end toward start: effectiveStart moves, effectiveEnd stays
                    effectiveStart = this.pointOnLine(end, start, absT);
                    if (backingEl instanceof SVGLineElement) {
                        backingEl.setAttribute('x1', effectiveStart.x.toString());
                        backingEl.setAttribute('y1', effectiveStart.y.toString());
                        backingEl.setAttribute('x2', end.x.toString());
                        backingEl.setAttribute('y2', end.y.toString());
                    }
                } else {
                    // Draw from start toward end: effectiveEnd moves, start stays
                    effectiveEnd = this.pointOnLine(start, end, absT);
                    if (backingEl instanceof SVGLineElement) {
                        backingEl.setAttribute('x1', start.x.toString());
                        backingEl.setAttribute('y1', start.y.toString());
                        backingEl.setAttribute('x2', effectiveEnd.x.toString());
                        backingEl.setAttribute('y2', effectiveEnd.y.toString());
                    }
                }
            } else if (this._controlCount === 1 && this._ctrl1) {
                // Quadratic bezier
                if (drawFromEnd) {
                    // Split from end: we want the second half of the curve
                    const splitParam = 1 - absT;
                    const split = this.splitQuadraticAt(start, this._ctrl1, end, splitParam);
                    // The second segment starts at split.p2 and goes to end
                    // We need to compute the second segment's control point
                    const q0 = this.pointOnLine(start, this._ctrl1, splitParam);
                    const q1 = this.pointOnLine(this._ctrl1, end, splitParam);
                    effectiveStart = split.p2;
                    effectiveTangent = this.tangentOnQuadratic(start, this._ctrl1, end, splitParam);
                    if (backingEl instanceof SVGPathElement) {
                        const pathData = `M ${effectiveStart.x} ${effectiveStart.y} Q ${q1.x} ${q1.y}, ${end.x} ${end.y}`;
                        backingEl.setAttribute('d', pathData);
                    }
                } else {
                    const split = this.splitQuadraticAt(start, this._ctrl1, end, absT);
                    effectiveEnd = split.p2;
                    effectiveTangent = this.tangentOnQuadratic(start, this._ctrl1, end, absT);
                    if (backingEl instanceof SVGPathElement) {
                        const pathData = `M ${split.p0.x} ${split.p0.y} Q ${split.p1.x} ${split.p1.y}, ${split.p2.x} ${split.p2.y}`;
                        backingEl.setAttribute('d', pathData);
                    }
                }
            } else if (this._controlCount >= 2 && this._ctrl1 && this._ctrl2) {
                // Cubic bezier
                if (drawFromEnd) {
                    // Split from end: we want the second half of the curve
                    const splitParam = 1 - absT;
                    const q0 = this.pointOnLine(start, this._ctrl1, splitParam);
                    const q1 = this.pointOnLine(this._ctrl1, this._ctrl2, splitParam);
                    const q2 = this.pointOnLine(this._ctrl2, end, splitParam);
                    const r0 = this.pointOnLine(q0, q1, splitParam);
                    const r1 = this.pointOnLine(q1, q2, splitParam);
                    effectiveStart = this.pointOnLine(r0, r1, splitParam);
                    effectiveTangent = this.tangentOnCubic(start, this._ctrl1, this._ctrl2, end, splitParam);
                    if (backingEl instanceof SVGPathElement) {
                        const pathData = `M ${effectiveStart.x} ${effectiveStart.y} C ${r1.x} ${r1.y}, ${q2.x} ${q2.y}, ${end.x} ${end.y}`;
                        backingEl.setAttribute('d', pathData);
                    }
                } else {
                    const split = this.splitCubicAt(start, this._ctrl1, this._ctrl2, end, absT);
                    effectiveEnd = split.p3;
                    effectiveTangent = this.tangentOnCubic(start, this._ctrl1, this._ctrl2, end, absT);
                    if (backingEl instanceof SVGPathElement) {
                        const pathData = `M ${split.p0.x} ${split.p0.y} C ${split.p1.x} ${split.p1.y}, ${split.p2.x} ${split.p2.y}, ${split.p3.x} ${split.p3.y}`;
                        backingEl.setAttribute('d', pathData);
                    }
                }
            }
        }

        // Update guide lines connecting control points to endpoints (only when selected)
        if (this._guideLineEl) {
            if (this._showGuides && (this._ctrl1 || this._ctrl2)) {
                // Build path: start -> ctrl1 -> ctrl2 -> end
                let guidePath = `M ${start.x} ${start.y}`;
                if (this._ctrl1) {
                    guidePath += ` L ${this._ctrl1.x} ${this._ctrl1.y}`;
                }
                if (this._ctrl2) {
                    guidePath += ` L ${this._ctrl2.x} ${this._ctrl2.y}`;
                }
                guidePath += ` L ${end.x} ${end.y}`;
                this._guideLineEl.setAttribute('d', guidePath);
            } else {
                this._guideLineEl.setAttribute('d', '');
            }
        }
        const size = this._arrowSize;
        const strokeColor = this._sc || '#000000';

        // For curved edges, use tangent direction at endpoints
        // Quadratic: tangent at end is from ctrl1 → end
        // Cubic: tangent at end is from ctrl2 → end (or ctrl1 if no ctrl2)
        let startTangentFrom = end;  // direction the start arrow points FROM
        let endTangentFrom = start;  // direction the end arrow points FROM

        if (this._controlCount > 0) {
            // For start arrow: tangent is from start towards first control point
            if (this._ctrl1) {
                startTangentFrom = this._ctrl1;
            }
            // For end arrow: tangent is from last control point towards end
            if (this._controlCount >= 2 && this._ctrl2) {
                endTangentFrom = this._ctrl2;
            } else if (this._ctrl1) {
                endTangentFrom = this._ctrl1;
            }
        }

        // Check if arrow direction should be flipped (bit 4)
        const flipArrow = !!(this._arrowState & 4);

        // Arrow at start (arrowState & 1)
        if (this._arrowState & 1) {
            // For reverse drawing (t < 0), arrow follows the moving tip (effectiveStart)
            const arrowPos = (this._t < 0 && Math.abs(this._t) < 1) ? effectiveStart : start;
            if (flipArrow) {
                // Flipped: arrow pointing toward end
                this.updateArrowhead(this._arrowStartEl!, arrowPos, end, size, strokeColor);
            } else {
                // Normal: arrow pointing toward start (operation)
                // Calculate direction toward start for proper arrow orientation
                const targetPos = start;
                let dirX = targetPos.x - arrowPos.x;
                let dirY = targetPos.y - arrowPos.y;
                const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                if (dirLen > 0) {
                    dirX /= dirLen;
                    dirY /= dirLen;
                    // Tip is offset toward start
                    const tipX = arrowPos.x + dirX * size;
                    const tipY = arrowPos.y + dirY * size;
                    this.updateArrowhead(this._arrowStartEl!, {x: tipX, y: tipY}, arrowPos, size, strokeColor);
                } else {
                    // Fallback when at start position
                    this.updateArrowhead(this._arrowStartEl!, start, startTangentFrom, size, strokeColor);
                }
            }
        } else {
            this._arrowStartEl!.setAttribute('d', '');
        }

        // Arrow at end (arrowState & 2)
        if (this._arrowState & 2) {
            if (flipArrow) {
                // Flipped: arrow at end pointing toward start
                // Calculate arrow position: at 'end' but pointing toward 'start'
                // The tip needs to be offset from 'end' toward 'start'
                const arrowPos = (this._t < 0 && Math.abs(this._t) < 1) ? effectiveStart : end;
                const targetPos = (this._t < 0 && Math.abs(this._t) < 1) ? end : start;

                // Direction from arrowPos toward targetPos (toward the operation)
                let dirX = targetPos.x - arrowPos.x;
                let dirY = targetPos.y - arrowPos.y;
                const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                if (dirLen > 0) {
                    dirX /= dirLen;
                    dirY /= dirLen;
                }
                // Offset tip from arrowPos toward targetPos
                const tipX = arrowPos.x + dirX * size;
                const tipY = arrowPos.y + dirY * size;
                this.updateArrowhead(this._arrowEndEl!, {x: tipX, y: tipY}, arrowPos, size, strokeColor);
            } else {
                // Normal: arrow at end pointing toward end
                // Use effective end point and tangent when t < 1
                if (this._t < 1 && this._t >= 0 && effectiveTangent) {
                    // Calculate "from" point using inverse tangent direction
                    const fromPoint = {
                        x: effectiveEnd.x - effectiveTangent.x * 10,
                        y: effectiveEnd.y - effectiveTangent.y * 10
                    };
                    this.updateArrowhead(this._arrowEndEl!, effectiveEnd, fromPoint, size, strokeColor);
                } else if (this._t < 1 && this._t >= 0) {
                    // Straight line case: use start as "from"
                    this.updateArrowhead(this._arrowEndEl!, effectiveEnd, start, size, strokeColor);
                } else {
                    this.updateArrowhead(this._arrowEndEl!, end, endTangentFrom, size, strokeColor);
                }
            }
        } else {
            this._arrowEndEl!.setAttribute('d', '');
        }

        // Bubble for complemented edges (draw small circle along edge near destination)
        if (this._bubbleEl) {
            if (this._inv && Math.abs(this._t) > 0) {
                // Position bubble so it touches the destination node at exactly one point
                const bubbleRadius = 4;

                // Calculate direction from endTangentFrom to end
                let dx = end.x - endTangentFrom.x;
                let dy = end.y - endTangentFrom.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    dx /= len;
                    dy /= len;
                }

                // Position bubble center so edge of bubble touches end point
                const bubbleX = end.x - dx * bubbleRadius;
                const bubbleY = end.y - dy * bubbleRadius;

                this._bubbleEl.setAttribute('cx', bubbleX.toString());
                this._bubbleEl.setAttribute('cy', bubbleY.toString());
                this._bubbleEl.setAttribute('r', bubbleRadius.toString());
                this._bubbleEl.setAttribute('fill', 'white');
                this._bubbleEl.setAttribute('stroke', strokeColor);
                this._bubbleEl.style.display = '';
            } else {
                this._bubbleEl.style.display = 'none';
            }
        }

        // Edge label
        if (this._labelEl) {
            if (this._label) {
                // Calculate midpoint based on edge type
                let midpoint: Point;
                if (this._controlCount === 0) {
                    midpoint = this.pointOnLine(start, end, 0.5);
                } else if (this._controlCount === 1 && this._ctrl1) {
                    midpoint = this.pointOnQuadratic(start, this._ctrl1, end, 0.5);
                } else if (this._controlCount >= 2 && this._ctrl1 && this._ctrl2) {
                    midpoint = this.pointOnCubic(start, this._ctrl1, this._ctrl2, end, 0.5);
                } else {
                    midpoint = this.pointOnLine(start, end, 0.5);
                }

                // Offset perpendicular to the edge so text doesn't overlap the line
                let tangent: Point;
                if (this._controlCount === 0) {
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const tLen = Math.sqrt(dx * dx + dy * dy);
                    tangent = tLen > 0 ? { x: dx / tLen, y: dy / tLen } : { x: 1, y: 0 };
                } else if (this._controlCount === 1 && this._ctrl1) {
                    tangent = this.tangentOnQuadratic(start, this._ctrl1, end, 0.5);
                } else if (this._controlCount >= 2 && this._ctrl1 && this._ctrl2) {
                    tangent = this.tangentOnCubic(start, this._ctrl1, this._ctrl2, end, 0.5);
                } else {
                    tangent = { x: 1, y: 0 };
                }
                // Perpendicular offset (to the left of the direction of travel)
                const offsetDist = this._labelSize * 0.6;
                const labelX = midpoint.x - tangent.y * offsetDist;
                const labelY = midpoint.y + tangent.x * offsetDist;

                this._labelEl.setAttribute('x', labelX.toString());
                this._labelEl.setAttribute('y', labelY.toString());
                this._labelEl.setAttribute('fill', this._labelColor);
                this._labelEl.setAttribute('font-family', this._labelFont);
                this._labelEl.setAttribute('font-size', this._labelSize.toString());
                this._labelEl.setAttribute('dominant-baseline', 'central');
                this._labelEl.textContent = this._label;
                this._labelEl.style.display = '';
            } else {
                this._labelEl.style.display = 'none';
                this._labelEl.textContent = '';
            }
        }
    }

    private updateArrowhead(path: SVGPathElement, tip: Point, from: Point, size: number, color: string): void {
        // Calculate direction vector
        let dx = tip.x - from.x;
        let dy = tip.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) {
            dx = 1;
            dy = 0;
        } else {
            dx /= len;
            dy /= len;
        }

        // Perpendicular vector
        const px = -dy;
        const py = dx;

        // Arrow points
        const baseX = tip.x - dx * size;
        const baseY = tip.y - dy * size;
        const left = { x: baseX + px * size * 0.5, y: baseY + py * size * 0.5 };
        const right = { x: baseX - px * size * 0.5, y: baseY - py * size * 0.5 };

        path.setAttribute('d', `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`);
        path.setAttribute('fill', color);
    }

    hitTest(point: Point, threshold: number = 10): boolean {
        return this._backingShape.hitTest(point, threshold);
    }

    translateBy(dx: number, dy: number): void {
        this._backingShape.translateBy(dx, dy);
        // Update our attributes
        const start = this._backingShape.pt_start;
        const end = this._backingShape.pt_end;
        this.setAttribute('x1', start.x.toString());
        this.setAttribute('y1', start.y.toString());
        this.setAttribute('x2', end.x.toString());
        this.setAttribute('y2', end.y.toString());
        // Update control points if applicable
        if (this._backingShape instanceof GsCurveShape) {
            const curve = this._backingShape as GsCurveShape;
            if (curve.ctrl1) {
                this._ctrl1 = curve.ctrl1;
                this.setAttribute('ctrl1-x', curve.ctrl1.x.toString());
                this.setAttribute('ctrl1-y', curve.ctrl1.y.toString());
            }
            if (curve.ctrl2) {
                this._ctrl2 = curve.ctrl2;
                this.setAttribute('ctrl2-x', curve.ctrl2.x.toString());
                this.setAttribute('ctrl2-y', curve.ctrl2.y.toString());
            }
        }
    }
}

customElements.define('gs-edge', GsEdgeShape);
