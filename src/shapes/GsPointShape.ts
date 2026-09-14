import { Point, HandleSpec } from '../types';
import { GsShape, ShapeConstructors } from './GsShape';

/**
 * Point shape component that renders as a small circle with a label
 */
export class GsPointShape extends GsShape {
    private x: number = 0;
    private y: number = 0;
    private size: number = 6;
    private shape: 'circle' | 'square' = 'circle';
    private _label: string = '';
    private _dependents: GsShape[] = [];

    constructor() {
        super();
    }

    static get constructors(): ShapeConstructors {
        return {
            ':dblclick': ['pt_center'],
        };
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'x', 'y', 'size', 'shape', 'label'];
    }

    get pt_center(): Point { return { x: this.x, y: this.y }; }
    set pt_center(p: Point) {
        this.x = p.x;
        this.y = p.y;
        this.setAttribute('x', p.x.toString());
        this.setAttribute('y', p.y.toString());
        this.render();
        this._notifyDependents();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'x':
                this.x = parseFloat(newValue);
                break;
            case 'y':
                this.y = parseFloat(newValue);
                break;
            case 'size':
                this.size = parseFloat(newValue);
                break;
            case 'shape':
                if (newValue === 'circle' || newValue === 'square') {
                    this.shape = newValue;
                }
                break;
            case 'label':
                this._label = newValue || '';
                break;
        }

        this.render();

        if (name === 'x' || name === 'y') {
            this._notifyDependents();
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (this.hasAttribute('x')) {
            this.x = parseFloat(this.getAttribute('x') || '0');
        }
        if (this.hasAttribute('y')) {
            this.y = parseFloat(this.getAttribute('y') || '0');
        }
        if (this.hasAttribute('size')) {
            this.size = parseFloat(this.getAttribute('size') || '6');
        }
        if (this.hasAttribute('shape')) {
            const shape = this.getAttribute('shape');
            if (shape === 'circle' || shape === 'square') {
                this.shape = shape;
            }
        }
        if (this.hasAttribute('label')) {
            this._label = this.getAttribute('label') || '';
        }

        // Auto-assign label if not provided
        if (!this.hasAttribute('label')) {
            const sketch = this.parentElement;
            if (sketch) {
                const existing = sketch.querySelectorAll('gs-point');
                const index = existing.length - 1; // this element is already in DOM
                this._label = this.indexToLabel(index);
                this.setAttribute('label', this._label);
            }
        }

        this.render();
    }

    private indexToLabel(i: number): string {
        let s = '';
        do {
            s = String.fromCharCode(65 + (i % 26)) + s;
            i = Math.floor(i / 26) - 1;
        } while (i >= 0);
        return s;
    }

    addDependent(shape: GsShape): void {
        if (!this._dependents.includes(shape)) this._dependents.push(shape);
    }

    removeDependent(shape: GsShape): void {
        const i = this._dependents.indexOf(shape);
        if (i !== -1) this._dependents.splice(i, 1);
    }

    private _notifyDependents(): void {
        for (const dep of this._dependents) dep.pointMoved(this);
    }

    setPoint(x: number, y: number, size: number = 6, shape: 'circle' | 'square' = 'circle'): void {
        this.x = x;
        this.y = y;
        this.size = size;
        this.shape = shape;
        this.setAttribute('x', x.toString());
        this.setAttribute('y', y.toString());
        this.setAttribute('size', size.toString());
        this.setAttribute('shape', shape);
        this.render();
    }

    getHandles(): { [key: string]: HandleSpec } {
        return {
            "center": { p: { x: this.x, y: this.y } }
        };
    }

    hitTest(point: Point, threshold: number = 5): boolean {
        const dx = point.x - this.x;
        const dy = point.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= (threshold + this.size / 2);
    }

    getBoundingBox(): { x: number, y: number, width: number, height: number } {
        return {
            x: this.x - this.size / 2,
            y: this.y - this.size / 2,
            width: this.size,
            height: this.size,
        };
    }

    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('g');
        }
        const g = this._el as SVGGElement;

        // Clear children and rebuild
        while (g.firstChild) g.removeChild(g.firstChild);

        if (this.shape === 'circle') {
            const circle = this.createSvgElement<SVGCircleElement>('circle');
            circle.setAttribute('cx', this.x.toString());
            circle.setAttribute('cy', this.y.toString());
            circle.setAttribute('r', (this.size / 2).toString());
            circle.setAttribute('fill', this._fc === 'transparent' ? '#ffffff' : this._fc);
            circle.setAttribute('stroke', this._sc);
            circle.setAttribute('stroke-width', '1.5');
            circle.setAttribute('pointer-events', 'all');
            g.appendChild(circle);
        } else {
            const rect = this.createSvgElement<SVGRectElement>('rect');
            const halfSize = this.size / 2;
            rect.setAttribute('x', (this.x - halfSize).toString());
            rect.setAttribute('y', (this.y - halfSize).toString());
            rect.setAttribute('width', this.size.toString());
            rect.setAttribute('height', this.size.toString());
            rect.setAttribute('fill', this._fc === 'transparent' ? '#ffffff' : this._fc);
            rect.setAttribute('stroke', this._sc);
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('pointer-events', 'all');
            g.appendChild(rect);
        }

        // Add label text
        if (this._label) {
            const text = this.createSvgElement<SVGTextElement>('text');
            text.setAttribute('x', (this.x + this.size).toString());
            text.setAttribute('y', (this.y - this.size).toString());
            text.setAttribute('font-size', '10');
            text.setAttribute('fill', this._sc);
            text.setAttribute('pointer-events', 'none');
            text.textContent = this._label;
            g.appendChild(text);
        }

        g.setAttribute('visibility', 'visible');
        g.style.display = 'block';
    }

    translateBy(dx: number, dy: number): void {
        this.x = (this.x || 0) + dx;
        this.y = (this.y || 0) + dy;
        this.setAttribute('x', this.x.toString());
        this.setAttribute('y', this.y.toString());
        this.render();
        this._notifyDependents();
    }
}

customElements.define('gs-point', GsPointShape);
