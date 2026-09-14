import { GsShape } from './GsShape';
import { HandleSpec, Point } from '../types';

/**
 * Camera shape that defines a viewport into the sketch.
 * The camera's x,y,w,h,d define a source region that maps to the sketch viewport.
 * x,y is the center of the camera frame.
 */
export class GsCameraShape extends GsShape {
    private _x: number = 0;      // center x
    private _y: number = 0;      // center y
    private _w: number = 640;    // width of view region
    private _h: number = 480;    // height of view region
    private _d: number = 0;      // rotation in degrees

    constructor() {
        super();
    }

    static get observedAttributes() {
        return ['sc', 'fc', 'css', 'visible', 'x', 'y', 'w', 'h', 'd'];
    }

    // #region accessors
    get x(): number { return this._x; }
    set x(value: number) {
        if (this._x !== value) {
            this._x = value;
            this.setAttribute('x', value.toString());
            this._notifySketch();
        }
    }

    get y(): number { return this._y; }
    set y(value: number) {
        if (this._y !== value) {
            this._y = value;
            this.setAttribute('y', value.toString());
            this._notifySketch();
        }
    }

    get w(): number { return this._w; }
    set w(value: number) {
        if (this._w !== value) {
            this._w = value;
            this.setAttribute('w', value.toString());
            this._notifySketch();
        }
    }

    get h(): number { return this._h; }
    set h(value: number) {
        if (this._h !== value) {
            this._h = value;
            this.setAttribute('h', value.toString());
            this._notifySketch();
        }
    }

    get d(): number { return this._d; }
    set d(value: number) {
        if (this._d !== value) {
            this._d = value;
            this.setAttribute('d', value.toString());
            this._notifySketch();
        }
    }
    // #endregion

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue) return;

        switch (name) {
            case 'x':
                this._x = parseFloat(newValue) || 0;
                this._notifySketch();
                break;
            case 'y':
                this._y = parseFloat(newValue) || 0;
                this._notifySketch();
                break;
            case 'w':
                this._w = parseFloat(newValue) || 640;
                this._notifySketch();
                break;
            case 'h':
                this._h = parseFloat(newValue) || 480;
                this._notifySketch();
                break;
            case 'd':
                this._d = parseFloat(newValue) || 0;
                this._notifySketch();
                break;
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (this.hasAttribute('x')) this._x = parseFloat(this.getAttribute('x') || '0');
        if (this.hasAttribute('y')) this._y = parseFloat(this.getAttribute('y') || '0');
        if (this.hasAttribute('w')) this._w = parseFloat(this.getAttribute('w') || '640');
        if (this.hasAttribute('h')) this._h = parseFloat(this.getAttribute('h') || '480');
        if (this.hasAttribute('d')) this._d = parseFloat(this.getAttribute('d') || '0');
    }

    /**
     * Notify the parent sketch that camera properties changed.
     */
    private _notifySketch(): void {
        const sketch = this.closest('gs-sketch') as any;
        if (sketch && typeof sketch.updateCameraTransform === 'function') {
            sketch.updateCameraTransform();
        }
    }

    /**
     * Get the SVG transform string that maps world coordinates to viewport.
     * This is the INVERSE of the camera transform - it moves the world so that
     * what the camera sees ends up in the viewport.
     *
     * @param viewportW - width of the sketch viewport
     * @param viewportH - height of the sketch viewport
     */
    getTransformString(viewportW: number, viewportH: number): string {
        // Transform steps (applied in reverse order in SVG):
        // 1. Translate so camera center is at origin
        // 2. Rotate by -d degrees
        // 3. Scale to fit viewport
        // 4. Translate to viewport center

        const scaleX = viewportW / this._w;
        const scaleY = viewportH / this._h;
        const scale = Math.min(scaleX, scaleY); // uniform scale to fit

        const vpCenterX = viewportW / 2;
        const vpCenterY = viewportH / 2;

        // SVG transforms are applied right-to-left, so we write them in reverse order
        return `translate(${vpCenterX}, ${vpCenterY}) scale(${scale}) rotate(${-this._d}) translate(${-this._x}, ${-this._y})`;
    }

    // Render camera as a transparent rectangle (for now, just creates an invisible rect)
    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('rect');
        }
        const rect = this._el as SVGRectElement;
        // Position from center
        rect.setAttribute('x', (this._x - this._w / 2).toString());
        rect.setAttribute('y', (this._y - this._h / 2).toString());
        rect.setAttribute('width', this._w.toString());
        rect.setAttribute('height', this._h.toString());
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', 'none');  // Invisible for now
        if (this._d !== 0) {
            rect.setAttribute('transform', `rotate(${this._d} ${this._x} ${this._y})`);
        } else {
            rect.removeAttribute('transform');
        }
    }

    getHandles(): { [key: string]: HandleSpec } {
        // No interactive handles for now
        return {};
    }

    hitTest(point: Point, threshold: number = 5): boolean {
        return false; // Not selectable for now
    }

    translateBy(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
    }
}

customElements.define('gs-camera', GsCameraShape);
