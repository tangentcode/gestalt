import { Point, HandleSpec } from '../types';

export type GsShapeClass = {
    constructors: ShapeConstructors,
    construct: (c:string, args:any[]) => GsShape
};
export type ShapeConstructors = { [key: string]: string[] }

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Base class for all shape elements in GameSketchLib
 * Provides common functionality and structure for shapes
 */
export abstract class GsShape extends HTMLElement {
    protected _el: SVGElement | null = null;
    protected _sc: string = '#000000';
    protected _fc: string = 'transparent';
    protected css: string = '';

    constructor() {
        super();
    }

    // Instance ID property - reads from attribute
    override get id(): string {
        return this.getAttribute('id') || '';
    }

    /**
     * Node ID (nid) - a globally unique UUID for this shape.
     * Used as the primary identifier for database storage.
     */
    get nid(): string {
        return this.getAttribute('nid') || '';
    }
    set nid(value: string) {
        this.setAttribute('nid', value);
    }

    /**
     * Generate the friendly ID from shape type and nid.
     * Format: {shapeName}-{first6CharsOfNidWithoutDashes}
     */
    private generateFriendlyId(): string {
        const nid = this.nid;
        // Remove dashes and take first 6 characters
        const shortHash = nid.replace(/-/g, '').substring(0, 6);
        return `${this.getShapeName()}-${shortHash}`;
    }

    /**
     * Get the SVG element for this shape
     * This allows the sketch to access the shape's SVG element directly
     */
    getSvgElement(): SVGElement | null {
        return this._el;
    }

    /**
     * Create an SVG element of the specified type
     */
    protected createSvgElement<T extends SVGElement>(tagName: string): T {
        return document.createElementNS('http://www.w3.org/2000/svg', tagName) as T;
    }

    // #region accessors
    get sc(): string { return this._sc; }
    get fc(): string { return this._fc; }
    set sc(color: string) {
        this._sc = color;
        this.setAttribute('sc', color);
        this.render();
    }
    set fc(color: string) {
        this._fc = color;
        this.setAttribute('fc', color);
        this.render();
    }

    /**
     * Whether this shape is locked (unselectable)
     */
    get locked(): boolean {
        return this.hasAttribute('locked');
    }
    set locked(value: boolean) {
        if (value) {
            this.setAttribute('locked', '');
        } else {
            this.removeAttribute('locked');
        }
    }

    get bbx0(): number { return this.getBoundingBox().x; }
    set bbx0(n: number) { const b = this.getBoundingBox(); this.translateBy(n - b.x, 0); }
    get bby0(): number { return this.getBoundingBox().y; }
    set bby0(n: number) { const b = this.getBoundingBox(); this.translateBy(0, n - b.y); }
    get bbx1(): number { const b = this.getBoundingBox(); return b.x + b.width; }
    set bbx1(n: number) { const b = this.getBoundingBox(); this.translateBy(n - (b.x + b.width), 0); }
    get bby1(): number { const b = this.getBoundingBox(); return b.y + b.height; }
    set bby1(n: number) { const b = this.getBoundingBox(); this.translateBy(0, n - (b.y + b.height)); }
    get pt_center(): { x: number, y: number } {
        const b = this.getBoundingBox();
        return { x: b.x + b.width/2, y: b.y + b.height/2 };
    }
    set pt_center(p: { x: number, y: number }) {
        const current = this.pt_center;
        this.translateBy(p.x - current.x, p.y - current.y);
    }

    // #endregion

    /**
     * Gets the CSS style string of the shape
     */
    getCss(): string {
        return this.css;
    }

    /**
     * Sets additional CSS styles for the shape
     */
    setCss(css: string): void {
        this.css = css;
        this.setAttribute('css', css);
        this.render();
    }

    /**
     * Lifecycle callback when element is added to DOM
     */
    connectedCallback() {
        // Ensure nid (node ID / UUID) exists
        if (!this.hasAttribute('nid')) {
            this.setAttribute('nid', generateUUID());
        }

        // Set ID attribute if not already present, derived from nid
        if (!this.hasAttribute('id')) {
            this.setAttribute('id', this.generateFriendlyId());
        }

        // Get attributes
        if (this.hasAttribute('sc')) {
            this._sc = this.getAttribute('sc') || '#000000';
        }

        if (this.hasAttribute('fc')) {
            this._fc = this.getAttribute('fc') || 'transparent';
        }

        if (this.hasAttribute('css')) {
            this.css = this.getAttribute('css') || '';
        }

        this.render();

        // Handle initial visibility
        if (this.hasAttribute('visible')) {
            this.updateVisibility(this.getAttribute('visible') !== 'false');
        }
    }

    /**
     * Lifecycle callback when attributes change
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return;

        switch (name) {
            case 'sc':
                this._sc = newValue;
                break;
            case 'fc':
                this._fc = newValue;
                break;
            case 'css':
                this.css = newValue;
                break;
            case 'visible':
                this.updateVisibility(newValue !== 'false');
                return; // Don't re-render for visibility changes
        }

        this.render();
    }

    /**
     * Update the visibility of the shape
     */
    protected updateVisibility(visible: boolean): void {
        if (this._el) {
            this._el.style.display = visible ? '' : 'none';
        }
    }

    /**
     * Returns an array of points for handle positioning
     * Must be implemented by each shape
     */
    abstract getHandles(): { [key: string]: HandleSpec };

    /**
     * Renders the shape as SVG.
     * Must be implemented by each shape
     */
    abstract render(): void;

    /**
     * Checks if a point is within or near the shape
     * Must be implemented by each shape
     */
    abstract hitTest(point: Point, threshold?: number): boolean;

    /**
     * Existing abstract translate method
     */
    abstract translateBy(dx: number, dy: number): void;

    /**
     * Handles a dragged handle by invoking a setter for "pt_<name>".
     * Walks the prototype chain so subclasses inherit base-class handle setters
     * (e.g. GsButtonShape → GsWidgetShape.pt_origin / pt_extent).
     * If no such setter exists, logs a warning.
     */
    public set_pt(name: string, worldPt: { x: number, y: number }): void {
        const setterName = `pt_${name}`;
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== HTMLElement.prototype) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, setterName);
            if (descriptor && typeof descriptor.set === 'function') {
                (this as any)[setterName] = worldPt;
                return;
            }
            proto = Object.getPrototypeOf(proto);
        }
        // Fallback: assignment may still hit an inherited setter via [[Set]]
        if (setterName in this) {
            (this as any)[setterName] = worldPt;
            return;
        }
        console.warn(`No setter defined for ${setterName} on`, this);
    }

    /**
     * Returns the bounding box of the shape.
     * Default: calculate box from the handle points.
     */
    getBoundingBox(): { x: number, y: number, width: number, height: number } {
        return (this._el as SVGGraphicsElement).getBBox();
    }

    /**
     * Determines if this shape can accept drops from the specified shapes
     * Default implementation returns false - subclasses should override
     */
    acceptsDrop(shapes: GsShape[]): boolean {
        return false;
    }

    /**
     * Handles dropped shapes
     * Default implementation does nothing - subclasses should override
     */
    onDrop(shapes: GsShape[]): void {
        // Default implementation does nothing
    }

    static get observedAttributes() {
        return ['sc', 'fc', 'css', 'visible'];
    }

    static get constructors(): ShapeConstructors {
        return { }
    }

    static construct(c:string, args:any[]): GsShape {
        const params = this.constructors[c];
        if (args.length < params.length) {
            throw new Error(`Not enough points for ${c} constructor`);
        }
        if (args.length > params.length) {
            // TODO: allow a catchall for extra points (e.g. for paths or polygons)
            throw new Error(`Too many points for ${c} constructor`);
        }
        let shape = new (<any>this)();
        let i = 0;
        while (i < params.length) {
            shape[params[i]] = args[i];
            i++;
        }
        return shape;
    }

    /** Called by a GsPointShape when it moves. Override in dependent shapes. */
    pointMoved(_point: GsShape): void {}

    sketchReadyCallback(): void {
        // Intentionally left blank
    }

    getShapeName(): string {
        let name = this.tagName.toLowerCase();
        if (name.startsWith('gs-')) {
            name = name.substring(3);
        }
        return name;
    }
}