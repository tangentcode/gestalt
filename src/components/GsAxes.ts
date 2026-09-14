/**
 * GsAxes — renders X/Y coordinate axes with adaptive tick marks and labels.
 * Plain class (not a custom element). Owned by GsSketch.
 *
 * SVG structure:
 *   <g id="axes-container" style="display:none">
 *     <line class="axis-x" />
 *     <line class="axis-y" />
 *     <g class="ticks-x"> ... </g>
 *     <g class="ticks-y"> ... </g>
 *   </g>
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Heckbert "nice number" rounding for tick intervals */
function niceNum(x: number, round: boolean): number {
    const exp = Math.floor(Math.log10(x));
    const frac = x / Math.pow(10, exp);
    let nice: number;
    if (round) {
        if (frac < 1.5) nice = 1;
        else if (frac < 3) nice = 2;
        else if (frac < 7) nice = 5;
        else nice = 10;
    } else {
        if (frac <= 1) nice = 1;
        else if (frac <= 2) nice = 2;
        else if (frac <= 5) nice = 5;
        else nice = 10;
    }
    return nice * Math.pow(10, exp);
}

/** Format a tick label: integers as integers, decimals with minimal precision */
function formatLabel(value: number): string {
    if (Number.isInteger(value)) return value.toString();
    // Use toPrecision then strip trailing zeros
    const s = value.toPrecision(6);
    return parseFloat(s).toString();
}

export class GsAxes {
    private _container: SVGGElement;
    private _axisX: SVGLineElement;
    private _axisY: SVGLineElement;
    private _ticksX: SVGGElement;
    private _ticksY: SVGGElement;
    private _visible: boolean = false;

    constructor() {
        this._container = document.createElementNS(SVG_NS, 'g');
        this._container.setAttribute('id', 'axes-container');
        this._container.style.display = 'none';

        // Axis lines
        this._axisX = document.createElementNS(SVG_NS, 'line');
        this._axisX.setAttribute('class', 'axis-x');
        this._axisX.setAttribute('stroke', '#888');
        this._axisX.setAttribute('stroke-opacity', '0.7');

        this._axisY = document.createElementNS(SVG_NS, 'line');
        this._axisY.setAttribute('class', 'axis-y');
        this._axisY.setAttribute('stroke', '#888');
        this._axisY.setAttribute('stroke-opacity', '0.7');

        this._ticksX = document.createElementNS(SVG_NS, 'g');
        this._ticksX.setAttribute('class', 'ticks-x');

        this._ticksY = document.createElementNS(SVG_NS, 'g');
        this._ticksY.setAttribute('class', 'ticks-y');

        this._container.appendChild(this._axisX);
        this._container.appendChild(this._axisY);
        this._container.appendChild(this._ticksX);
        this._container.appendChild(this._ticksY);
    }

    /** The <g> element to insert into the sketch SVG */
    get element(): SVGGElement {
        return this._container;
    }

    get visible(): boolean {
        return this._visible;
    }

    set visible(v: boolean) {
        this._visible = v;
        this._container.style.display = v ? '' : 'none';
    }

    /**
     * Recompute axis lines, ticks, and labels for the visible range.
     *
     * @param scale     Current zoom scale (CSS transform scale applied to sketch container)
     * @param viewportW Viewport width in CSS pixels (container element width)
     * @param viewportH Viewport height in CSS pixels (container element height)
     * @param scrollX   Sketch x offset in CSS pixels (sketch._x)
     * @param scrollY   Sketch y offset in CSS pixels (sketch._y)
     * @param originX   SVG x-coordinate where axes cross (default 0)
     * @param originY   SVG y-coordinate where axes cross (default 0)
     * @param yFlip     When true, negate Y labels (math convention: y-up)
     */
    update(scale: number, viewportW: number, viewportH: number, scrollX: number, scrollY: number,
           originX: number = 0, originY: number = 0, yFlip: boolean = false): void {
        // Compute visible SVG coordinate range.
        // The sketch container is translated by (scrollX, scrollY) and scaled by `scale`.
        // A CSS-pixel at (px, py) relative to the host corresponds to SVG coord:
        //   svgX = (px - scrollX) / scale
        //   svgY = (py - scrollY) / scale
        const svgLeft = -scrollX / scale;
        const svgTop = -scrollY / scale;
        const svgRight = (viewportW - scrollX) / scale;
        const svgBottom = (viewportH - scrollY) / scale;

        const invScale = 1 / scale;

        // Axis stroke width: 1px on screen
        const sw = invScale;
        this._axisX.setAttribute('stroke-width', sw.toString());
        this._axisY.setAttribute('stroke-width', sw.toString());

        // Horizontal axis at y = originY
        this._axisX.setAttribute('x1', svgLeft.toString());
        this._axisX.setAttribute('y1', originY.toString());
        this._axisX.setAttribute('x2', svgRight.toString());
        this._axisX.setAttribute('y2', originY.toString());

        // Vertical axis at x = originX
        this._axisY.setAttribute('x1', originX.toString());
        this._axisY.setAttribute('y1', svgTop.toString());
        this._axisY.setAttribute('x2', originX.toString());
        this._axisY.setAttribute('y2', svgBottom.toString());

        // --- Adaptive tick spacing ---
        // Target ~80px between ticks on screen
        const targetScreenPx = 80;
        const rawInterval = targetScreenPx / scale;
        const interval = niceNum(rawInterval, true);

        const tickLen = 6 * invScale;       // tick mark length in SVG units
        const fontSize = 11 * invScale;     // label font size in SVG units
        const labelOffset = 14 * invScale;  // label offset from axis

        const maxTicks = 200;

        // --- X ticks ---
        this._ticksX.innerHTML = '';
        const xStart = Math.ceil(svgLeft / interval) * interval;
        let count = 0;
        for (let x = xStart; x <= svgRight && count < maxTicks; x += interval) {
            // Skip tick at origin
            if (Math.abs(x - originX) < interval * 0.001) continue;
            count++;

            const tick = document.createElementNS(SVG_NS, 'line');
            tick.setAttribute('x1', x.toString());
            tick.setAttribute('y1', (originY - tickLen / 2).toString());
            tick.setAttribute('x2', x.toString());
            tick.setAttribute('y2', (originY + tickLen / 2).toString());
            tick.setAttribute('stroke', '#888');
            tick.setAttribute('stroke-opacity', '0.5');
            tick.setAttribute('stroke-width', sw.toString());
            this._ticksX.appendChild(tick);

            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', x.toString());
            label.setAttribute('y', (originY + labelOffset).toString());
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', fontSize.toString());
            label.setAttribute('fill', '#666');
            label.setAttribute('font-family', 'sans-serif');
            label.textContent = formatLabel(x - originX);
            this._ticksX.appendChild(label);
        }

        // --- Y ticks ---
        this._ticksY.innerHTML = '';
        const yStart = Math.ceil(svgTop / interval) * interval;
        count = 0;
        for (let y = yStart; y <= svgBottom && count < maxTicks; y += interval) {
            // Skip tick at origin
            if (Math.abs(y - originY) < interval * 0.001) continue;
            count++;

            const tick = document.createElementNS(SVG_NS, 'line');
            tick.setAttribute('x1', (originX - tickLen / 2).toString());
            tick.setAttribute('y1', y.toString());
            tick.setAttribute('x2', (originX + tickLen / 2).toString());
            tick.setAttribute('y2', y.toString());
            tick.setAttribute('stroke', '#888');
            tick.setAttribute('stroke-opacity', '0.5');
            tick.setAttribute('stroke-width', sw.toString());
            this._ticksY.appendChild(tick);

            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', (originX - labelOffset).toString());
            label.setAttribute('y', y.toString());
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('font-size', fontSize.toString());
            label.setAttribute('fill', '#666');
            label.setAttribute('font-family', 'sans-serif');
            label.textContent = yFlip ? formatLabel(-(y - originY)) : formatLabel(y - originY);
            this._ticksY.appendChild(label);
        }
    }
}
