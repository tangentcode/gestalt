import { GsShape } from "./GsShape";
import { HandleSpec, Point } from "../types";

/**
 * Chevron/Arrow shape - a hexagon with a point on the right and notch on the left
 * Used in flowcharts, looks like: >------>
 */
export class GsChevronShape extends GsShape {
    private _x: number = 0;
    private _y: number = 0;
    private _width: number = 100;
    private _height: number = 40;
    private _indent: number = 0.15; // How much to indent/point (as fraction of width)

    static get observedAttributes() {
        return [...super.observedAttributes, 'x', 'y', 'width', 'height'];
    }

    constructor() {
        super();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue) return;
        switch(name) {
            case 'x':
                this._x = parseFloat(newValue);
                break;
            case 'y':
                this._y = parseFloat(newValue);
                break;
            case 'width':
                this._width = parseFloat(newValue);
                break;
            case 'height':
                this._height = parseFloat(newValue);
                break;
        }
        this.render();
    }

    // Bounding box accessors (for GsNodeShape compatibility)
    get x(): number { return this._x; }
    set x(value: number) { this._x = value; this.render(); }

    get y(): number { return this._y; }
    set y(value: number) { this._y = value; this.render(); }

    get width(): number { return this._width; }
    set width(value: number) { this._width = value; this.render(); }

    get height(): number { return this._height; }
    set height(value: number) { this._height = value; this.render(); }

    // Point accessors for handles
    get pt_start(): Point { return { x: this._x, y: this._y }; }
    set pt_start(point: Point) {
        this._x = point.x;
        this._y = point.y;
        this.setAttribute('x', point.x.toString());
        this.setAttribute('y', point.y.toString());
        this.render();
    }

    get pt_end(): Point { return { x: this._x + this._width, y: this._y + this._height }; }
    set pt_end(point: Point) {
        this._width = point.x - this._x;
        this._height = point.y - this._y;
        this.setAttribute('width', this._width.toString());
        this.setAttribute('height', this._height.toString());
        this.render();
    }

    private getPathData(): string {
        const x = this._x;
        const y = this._y;
        const w = this._width;
        const h = this._height;
        const indent = w * this._indent;
        const cy = y + h / 2; // center y

        // Arrow/chevron shape: concave notch on left, convex point on right
        //   0 ----------- 1
        //    \             \
        //     5             2
        //    /             /
        //   4 ----------- 3
        return `M ${x} ${y} ` +                    // 0: top-left
               `L ${x + w - indent} ${y} ` +       // 1: top-right (before point)
               `L ${x + w} ${cy} ` +               // 2: right point (convex)
               `L ${x + w - indent} ${y + h} ` +   // 3: bottom-right
               `L ${x} ${y + h} ` +                // 4: bottom-left
               `L ${x + indent} ${cy} Z`;          // 5: left notch (concave - goes inward)
    }

    render(): void {
        const el = this._el ?? this.createSvgElement<SVGPathElement>('path');
        el.setAttribute('d', this.getPathData());
        el.setAttribute('stroke', this._sc);
        el.setAttribute('stroke-width', '1');
        el.setAttribute('fill', this._fc);
        this._el = el;
    }

    getHandles(): { [key: string]: HandleSpec } {
        return {
            start: { p: this.pt_start },
            end: { p: this.pt_end }
        };
    }

    hitTest(point: Point, threshold: number = 0): boolean {
        // Simple bounding box test
        return point.x >= this._x - threshold &&
               point.x <= this._x + this._width + threshold &&
               point.y >= this._y - threshold &&
               point.y <= this._y + this._height + threshold;
    }

    translateBy(dx: number, dy: number): void {
        this._x += dx;
        this._y += dy;
        this.setAttribute('x', this._x.toString());
        this.setAttribute('y', this._y.toString());
        this.render();
    }

    getBoundingBox(): { x: number; y: number; width: number; height: number } {
        return { x: this._x, y: this._y, width: this._width, height: this._height };
    }
}

customElements.define('gs-chevron', GsChevronShape);
