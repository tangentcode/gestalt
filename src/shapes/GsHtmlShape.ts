import { GsShape } from './GsShape';
import { Point, HandleSpec } from '../types';

export class GsHtmlShape extends GsShape {
  private _x: number = 0;
  private _y: number = 0;
  private _w: number = 100;
  private _h: number = 100;
  protected hRoot: HTMLDivElement;

  get x(): number { return this._x; }
  set x(val: number) {
    this._x = val; this.setAttribute('x', val.toString()); this.render(); }

  get y(): number { return this._y; }
  set y(val: number) {
    this._y = val; this.setAttribute('y', val.toString()); this.render(); }

  get w(): number { return this._w; }
  set w(val: number) {
    this._w = val; this.setAttribute('w', val.toString()); this.render(); }

  get h(): number { return this._h; }
  set h(val: number) {
    this._h = val; this.setAttribute('h', val.toString()); this.render(); }

  get sc(): string { return this._sc; }
  set sc(val: string) {
    this._sc = val; this.setAttribute('sc', val); this.render(); }

  get fc(): string { return this._fc; }
  set fc(val: string) {
    this._fc = val; this.setAttribute('fc', val); this.render(); }

  static get observedAttributes() {
    return [...(super.observedAttributes || []), 'x', 'y', 'w', 'h', 'html-content']}

  static get constructors() {
    return {
      ":click": ['pt_origin'],
      ":drag": ['pt_origin', 'pt_extent']}}

  constructor() {
    super();
    this._el = this.createSvgElement<SVGForeignObjectElement>('foreignObject');
    this.hRoot = document.createElement('div');
    this.hRoot.style.width = '100%';
    this.hRoot.style.height = '100%';
    this._el.appendChild(this.hRoot); }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if(oldValue === newValue) return;
    switch(name) {
      case 'x':
        this.x = parseFloat(newValue);
        break;
      case 'y':
        this.y = parseFloat(newValue);
        break;
      case 'w':
        this.w = parseFloat(newValue);
        break;
      case 'h':
        this.h = parseFloat(newValue);
        break;
      case 'html-content':
        this.applyHtmlContent(newValue ?? '');
        break;}
    super.attributeChangedCallback(name, oldValue, newValue)}

  connectedCallback() {
    super.connectedCallback();
    const nodes = Array.from(this.childNodes).filter(n => n !== this._el);
    nodes.forEach(n => this.hRoot.appendChild(n.cloneNode(true)))
    this.render();}

  render(): void {
    if (!this._el) return;
    this._el.setAttribute('x', this.x.toString());
    this._el.setAttribute('y', this.y.toString());
    this._el.setAttribute('width', this.w.toString());
    this._el.setAttribute('height', this.h.toString());

    let hRoot = this._el.querySelector('div') as HTMLDivElement;
    hRoot.style.boxSizing = 'border-box';
    hRoot.style.padding = '2px';
    hRoot.style.border = `1px solid ${this.sc}`;
    hRoot.style.backgroundColor = this.fc;
    // Restore serialized HTML from the light-DOM attribute into the shadow container
    if (this.hasAttribute('html-content')) {
      this.applyHtmlContent(this.getAttribute('html-content') ?? '');
    }}

  private applyHtmlContent(content: string): void {
    if (!this._el) return;
    const container = this._el.querySelector('div');
    if (container && container.innerHTML !== content) {
      container.innerHTML = content;
    }}

  get htmlContent(): string {
    return this.getAttribute('html-content') ?? '';}

  set htmlContent(content: string) {
    console.log('GsHtmlShape.htmlContent replaced:', content);
    // Persist on the light-DOM attribute so serialization round-trips
    if (this.getAttribute('html-content') !== content) {
      this.setAttribute('html-content', content);
    }
    this.applyHtmlContent(content);}

  getHandles(): { [key: string]: HandleSpec } {
    return {
      'origin': { p: this.pt_origin },
      'extent': { p: this.pt_extent }}}

  hitTest(point: Point, threshold: number = 0): boolean {
    const bbox = (this._el! as SVGForeignObjectElement).getBBox();
    return point.x >= bbox.x - threshold &&
        point.x <= bbox.x + bbox.width + threshold &&
        point.y >= bbox.y - threshold &&
        point.y <= bbox.y + bbox.height + threshold;}

  translateBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.setAttribute('x', this.x.toString());
    this.setAttribute('y', this.y.toString());}

  get pt_origin(): { x: number, y: number } {
    return { x: this.x, y: this.y }}
  set pt_origin(point: { x: number, y: number }) {
    this.x = point.x;
    this.y = point.y;}

  get pt_extent(): { x: number, y: number } {
    return { x: this.x + this.w, y: this.y + this.h }}
  set pt_extent(point: { x: number, y: number }) {
    this.w = Math.abs(point.x - this.x);
    this.h = Math.abs(point.y - this.y);}}

customElements.define('gs-html', GsHtmlShape);
