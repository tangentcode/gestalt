export interface Point {
  x: number;
  y: number;

  // Optional additional coordinate spaces
  // These are used for tracking coordinates in different spaces
  clientX?: number;    // Browser window coordinates
  clientY?: number;    // Browser window coordinates
  overlayX?: number;   // Relative to the overlay element
  overlayY?: number;   // Relative to the overlay element
  relativeX?: number;  // Relative position within SVG
  relativeY?: number;  // Relative position within SVG
  isSvgConverted?: boolean; // Whether SVG conversion was applied
}

export enum MouseButton {
    Primary = 0,
    Secondary = 2,
    Middle = 1
}

export type CircleConstructorType = 'center-radius' | 'three-points' | 'compass';
export type RectConstructorType = 'corner-size' | 'two-corners';
export type LineConstructorType = 'two-points';
export type PathConstructorType = 'freehand' | 'points';

export type HandleType = 'move' | 'resize' | 'rotate' | 'point';

export type ToolType = 'run' | 'select' | 'pen' | 'viewport' | 'graph' | 'text' | 'build' | 'physics';

export enum ToolEventType {
  Click = "click",
  DoubleClick = "doubleClick",
  RightClick = "rightClick",
  DragStart = "dragStart",
  DragStep = "dragStep",
  DragStop = "dragStop",
  Wheel = "wheel",
}

export interface Tool {
  click(event: ToolEvent): void;
  dragStart(event: ToolEvent): void;
  dragStep(event: ToolEvent): void;
  dragStop(event: ToolEvent): void;
  wheel?(event: ToolEvent & { deltaY: number }): void;
  wantsWheel?(): boolean;
  getLabel(): string;
}

export interface ToolEvent {
  clientPt: Point,
  sketchPt: Point;
  button: MouseButton;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  target: HTMLElement;
  originalEvent: MouseEvent;
  eventType: ToolEventType;
}

export interface AddKeyframeEvent extends CustomEvent {
  detail: {
    elem: string;
    attr: string;
    value: number | string }}

// Custom event interfaces
export interface ZoomChangedEvent extends CustomEvent {
  detail: {
    zoom: number;
  };
}

export interface ZoomResetEvent extends CustomEvent {
  detail: null;
}

export interface ViewportChangedEvent extends CustomEvent {
  detail: {
    x: number;
    y: number;
    scale: number;
    zoom: number;
  };
}

// Add custom events to the element event map
declare global {
  interface ElementEventMap {
    'zoom-changed': ZoomChangedEvent;
    'zoom-updated': ZoomChangedEvent;
    'reset-zoom': ZoomResetEvent;
    'viewport-changed': ViewportChangedEvent;
  }
}

export interface HandleSpec {
	p: Point;
	sh?: 'circle' | 'square' | 'diamond';  // default is 'circle'
	sc?: string; // stroke-color, default 'black'
	fc?: string; // fill-color, default 'white'
	sz?: { width: number; height: number }; // default {width:5, height:5}
}
