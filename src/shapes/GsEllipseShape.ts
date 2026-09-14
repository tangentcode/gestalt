import { GsShape } from "./GsShape";
import { HandleSpec } from "../types";

export class GsEllipseShape extends GsShape {
    public _cx: number = 0;
    public _cy: number = 0;
    public _rx: number = 50;
    public _ry: number = 30;

    static get observedAttributes() {
        return [...super.observedAttributes, 'cx', 'cy', 'rx', 'ry'];
    }

    static get constructors() {
        return {
            ":click": ['pt_center'],
            ":drag": ['pt_center', 'pt_radius']
        };
    }

    constructor() {
        super();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue) return;
        switch(name) {
            case 'cx':
                this._cx = parseFloat(newValue);
                break;
            case 'cy':
                this._cy = parseFloat(newValue);
                break;
            case 'rx':
                this._rx = parseFloat(newValue);
                break;
            case 'ry':
                this._ry = parseFloat(newValue);
                break;
        }
        this.render();
    }

    get pt_center(): { x: number, y: number } {
        return { x: this._cx, y: this._cy };
    }
    set pt_center(point: { x: number, y: number }) {
        this._cx = point.x;
        this._cy = point.y;
        this.setAttribute('cx', point.x.toString());
        this.setAttribute('cy', point.y.toString());
        this.render();
    }

    get pt_radius(): { x: number, y: number } {
        return { x: this._cx + this._rx, y: this._cy + this._ry };
    }
    set pt_radius(point: { x: number, y: number }) {
        this._rx = Math.abs(point.x - this._cx);
        this._ry = Math.abs(point.y - this._cy);
        this.setAttribute('rx', this._rx.toString());
        this.setAttribute('ry', this._ry.toString());
        this.render();
    }

    get pt_n(): { x: number, y: number } {
        return { x: this._cx, y: this._cy - this._ry };
    }
    set pt_n(point: { x: number, y: number }) {
        this._ry = Math.abs(this._cy - point.y);
        this.setAttribute('ry', this._ry.toString());
        this.render();
    }

    get pt_s(): { x: number, y: number } {
        return { x: this._cx, y: this._cy + this._ry };
    }
    set pt_s(point: { x: number, y: number }) {
        this._ry = Math.abs(point.y - this._cy);
        this.setAttribute('ry', this._ry.toString());
        this.render();
    }

    get pt_e(): { x: number, y: number } {
        return { x: this._cx + this._rx, y: this._cy };
    }
    set pt_e(point: { x: number, y: number }) {
        this._rx = Math.abs(point.x - this._cx);
        this.setAttribute('rx', this._rx.toString());
        this.render();
    }

    get pt_w(): { x: number, y: number } {
        return { x: this._cx - this._rx, y: this._cy };
    }
    set pt_w(point: { x: number, y: number }) {
        this._rx = Math.abs(this._cx - point.x);
        this.setAttribute('rx', this._rx.toString());
        this.render();
    }

    render(): void {
        const el = this._el ?? this.createSvgElement<SVGEllipseElement>('ellipse');
        el.setAttribute('cx', this._cx.toString());
        el.setAttribute('cy', this._cy.toString());
        el.setAttribute('rx', this._rx.toString());
        el.setAttribute('ry', this._ry.toString());
        el.setAttribute('stroke', this._sc);
        el.setAttribute('stroke-width', '1');
        el.setAttribute('fill', this._fc);
        this._el = el;
    }

    getHandles(): { [key: string]: HandleSpec } {
        return {
            center: { p: this.pt_center },
            n: { p: this.pt_n },
            s: { p: this.pt_s },
            e: { p: this.pt_e },
            w: { p: this.pt_w }
        };
    }

    hitTest(point: { x: number, y: number }, threshold: number = 0): boolean {
        const dx = point.x - this._cx;
        const dy = point.y - this._cy;
        const norm = (dx * dx) / (this._rx * this._rx) + (dy * dy) / (this._ry * this._ry);
        return norm <= 1 + (threshold / Math.max(this._rx, this._ry));
    }

    translateBy(dx: number, dy: number): void {
        this.pt_center = { x: this._cx + dx, y: this._cy + dy };
    }
}

customElements.define('gs-ellipse', GsEllipseShape);