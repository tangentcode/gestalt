import { HandleSpec, Point } from '../types';
import { GsShape } from './GsShape';

/**
 * Text shape component that wraps an SVG text element
 */
export class GsTextShape extends GsShape {
    private _x: number = 0;
    private _y: number = 0;
    private _text: string = '';
    private _font: string = 'Arial, sans-serif';
    private _size: number = 16;
    private _textAnchor: string = 'start';
    private _dominantBaseline: string = 'auto';
    private _bold: boolean = false;
    private _italic: boolean = false;
    private _underline: boolean = false;
    private _strike: boolean = false;
    private _wrap: string = '';

    constructor() {
        super();
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'x', 'y', 'text', 'font', 'size', 'text-anchor', 'dominant-baseline', 'wrap', 'bold', 'italic', 'underline', 'strike'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue === newValue) return;

        switch (name) {
            case 'x':
                this._x = parseFloat(newValue) || 0;
                break;
            case 'y':
                this._y = parseFloat(newValue) || 0;
                break;
            case 'text':
                this._text = newValue;
                break;
            case 'font':
                this._font = newValue || 'Arial, sans-serif';
                break;
            case 'size':
                this._size = parseFloat(newValue) || 16;
                break;
            case 'text-anchor':
                this._textAnchor = newValue;
                break;
            case 'dominant-baseline':
                this._dominantBaseline = newValue;
                break;
            case 'bold':
                this._bold = newValue !== null;
                break;
            case 'italic':
                this._italic = newValue !== null;
                break;
            case 'underline':
                this._underline = newValue !== null;
                break;
            case 'strike':
                this._strike = newValue !== null;
                break;
            case 'wrap':
                this._wrap = newValue || '';
                break;
        }

        this.render();
    }

    connectedCallback() {
        super.connectedCallback();

        if (this.hasAttribute('x')) {
            this._x = parseFloat(this.getAttribute('x') || '0');
        }

        if (this.hasAttribute('y')) {
            this._y = parseFloat(this.getAttribute('y') || '0');
        }

        if (this.hasAttribute('text')) {
            this._text = this.getAttribute('text') || '';
        }

        if (this.hasAttribute('font')) {
            this._font = this.getAttribute('font') || 'Arial, sans-serif';
        }

        if (this.hasAttribute('size')) {
            this._size = parseFloat(this.getAttribute('size') || '16');
        }

        if (this.hasAttribute('text-anchor')) {
            this._textAnchor = this.getAttribute('text-anchor') || 'start';
        }

        if (this.hasAttribute('dominant-baseline')) {
            this._dominantBaseline = this.getAttribute('dominant-baseline') || 'auto';
        }

        this._bold = this.hasAttribute('bold');
        this._italic = this.hasAttribute('italic');
        this._underline = this.hasAttribute('underline');
        this._strike = this.hasAttribute('strike');
        if (this.hasAttribute('wrap')) {
            this._wrap = this.getAttribute('wrap') || '';
        }

        this.render();
    }

    get pt_xy(): Point { return { x: this._x, y: this._y }; }
    set pt_xy(p: Point) {
        this._x = p.x;
        this._y = p.y;
        this.setAttribute('x', p.x.toString());
        this.setAttribute('y', p.y.toString());
        this.render();
    }

    get font():string { return this._font; }
    set font(font: string) {
        this._font = font;
        this.setAttribute('font', font);
        this.render();
    }

    get text(): string { return this._text; }
    set text(text: string) {
        this._text = text;
        this.setAttribute('text', text);
        this.render();
    }

    get textAnchor(): string { return this._textAnchor; }
    set textAnchor(value: string) {
        this._textAnchor = value;
        this.setAttribute('text-anchor', value);
        this.render();
    }

    get dominantBaseline(): string { return this._dominantBaseline; }
    set dominantBaseline(value: string) {
        this._dominantBaseline = value;
        this.setAttribute('dominant-baseline', value);
        this.render();
    }

    get size(): number { return this._size; }
    set size(value: number) {
        this._size = value;
        this.setAttribute('size', value.toString());
        this.render();
    }

    get bold(): boolean { return this._bold; }
    set bold(value: boolean) {
        this._bold = value;
        if (value) this.setAttribute('bold', ''); else this.removeAttribute('bold');
        this.render();
    }

    get italic(): boolean { return this._italic; }
    set italic(value: boolean) {
        this._italic = value;
        if (value) this.setAttribute('italic', ''); else this.removeAttribute('italic');
        this.render();
    }

    get underline(): boolean { return this._underline; }
    set underline(value: boolean) {
        this._underline = value;
        if (value) this.setAttribute('underline', ''); else this.removeAttribute('underline');
        this.render();
    }

    get strike(): boolean { return this._strike; }
    set strike(value: boolean) {
        this._strike = value;
        if (value) this.setAttribute('strike', ''); else this.removeAttribute('strike');
        this.render();
    }

    getHandles(): { [key: string]: HandleSpec } {
        return {
            "xy": { p: this.pt_xy }
        };
    }

    hitTest(point: Point): boolean {
        if (!this._el) return false;
        const bbox = (this._el as SVGGraphicsElement).getBBox();
        return point.x >= bbox.x && point.x <= (bbox.x + bbox.width) &&
               point.y >= bbox.y && point.y <= (bbox.y + bbox.height);
    }

    render(): void {
        if (!this._el) {
            this._el = this.createSvgElement('text');
            const textElement = this._el as SVGTextElement;
            textElement.setAttribute('font-family', this._font);
            textElement.setAttribute('visibility', 'visible');
            textElement.setAttribute('pointer-events', 'all');
            textElement.style.display = 'block';
        }
        const textElement = this._el as SVGTextElement;
        textElement.setAttribute('font-family', this._font);
        textElement.setAttribute('x', this._x.toString());
        textElement.setAttribute('y', this._y.toString());
        textElement.setAttribute('font-size', this._size.toString());
        textElement.setAttribute('fill', this._sc);
        textElement.setAttribute('text-anchor', this._textAnchor);
        textElement.setAttribute('dominant-baseline', this._dominantBaseline);
        textElement.setAttribute('font-weight', this._bold ? 'bold' : 'normal');
        textElement.setAttribute('font-style', this._italic ? 'italic' : 'normal');
        const deco: string[] = [];
        if (this._underline) deco.push('underline');
        if (this._strike) deco.push('line-through');
        textElement.setAttribute('text-decoration', deco.length > 0 ? deco.join(' ') : 'none');

        // wrap="none"/"nowrap": single line on a pinned baseline (no tspan block-center jump).
        const noWrap = this._wrap === 'none' || this._wrap === 'nowrap';
        const raw = noWrap ? this._text.replace(/[\n\r]+/g, ' ') : this._text;
        const lines = noWrap ? [raw] : raw.split('\n');
        if (lines.length > 1) {
            while (textElement.firstChild) textElement.removeChild(textElement.firstChild);
            const lineHeight = this._size * 1.2;
            // Offset first line up so the block is vertically centered on y
            const blockOffset = -(lines.length - 1) * lineHeight / 2;
            for (let i = 0; i < lines.length; i++) {
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('x', this._x.toString());
                tspan.setAttribute('dy', i === 0 ? blockOffset.toString() : lineHeight.toString());
                tspan.textContent = lines[i];
                textElement.appendChild(tspan);
            }
        } else {
            textElement.textContent = raw;
        }

        textElement.setAttribute('visibility', 'visible');
        textElement.style.display = 'block';
    }

    translateBy(dx: number, dy: number): void {
        this._x = (this._x || 0) + dx;
        this._y = (this._y || 0) + dy;
        this.setAttribute('x', this._x.toString());
        this.setAttribute('y', this._y.toString());
        this.render();
    }
}

customElements.define('gs-text', GsTextShape);