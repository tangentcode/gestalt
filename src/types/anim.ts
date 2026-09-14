export type Easing = (a:any, z:any, t: number) => number;
export type Keyframe = { t: number, v:any, e?: string };
export type Marker = { name: string, t: number };
export type PropTrack = { target: string, keyframes: Keyframe[]};
export type CalcTrack = { target: string, calc: string };
export type TextTrack = { words: { t: number, text:string }[] };
export type WaveTrack = { waves: { t: number, dur: number, start:number, wave:string }[] };
export type AnimSegment = {
  t: number,              // when to start in parent timeline
  from?: string | number, // marker name OR time (default: 0)
  to?: string | number,   // marker name OR time (default: anim end)
  speed?: number,         // playback rate (default: 1.0)
};
export type AnimTrack = { target: string, segments: AnimSegment[] };
export type CallTrack = { calls: { t: number, dur: number, call:string }[] };

export type Track = PropTrack | CalcTrack | TextTrack | WaveTrack | AnimTrack | CallTrack;

export type TrackCache = {
  idx:{ ts: number[] },
  val:any,
  dst:(x:any)=>void};

export type Anim = {
  name: string;
  dur: number;
  rep: number;
  tracks: Track[];
  markers: Marker[];
  cache: TrackCache[];}

export type Defs = { [name: string]: Anim}

// --- Easing Functions & Mapping ---

// Basic Easing Functions (Implementations needed or import from a library)
// Placeholder implementations:
const linear = (a:any, z:any, t: number) => a + (z - a) * t // Assuming numeric interpolation
const easeInQuad = (a:any, z:any, t: number) => a + (z - a) * (t * t)
const easeOutQuad = (a:any, z:any, t: number) => a + (z - a) * (t * (2 - t))
const easeInOutQuad = (a:any, z:any, t: number) => a + (z - a) * (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
const discrete = (a:any, z:any, t: number) => t < 1 ? a : z   // Hold value until next keyframe

export const easingFunctionMap: { [key: string]: Easing } = {
  'linear': linear,
  'ease-in': easeInQuad, // Map names to functions
  'ease-out': easeOutQuad,
  'ease-in-out': easeInOutQuad,
  'discrete': discrete,
}

// Reverse map (Function to Name) - This is imperfect as functions are compared by reference
// It's better to rely on the string name stored if possible, or default during playback.
// This function is primarily for the editor display.
export function getEasingName(func?: Easing): string {
  if (!func) return 'linear'
  for (const name in easingFunctionMap) {
    if (easingFunctionMap[name] === func) {
      return name
    }
  }
  // Fallback: Try string comparison (less reliable)
  const funcStr = func.toString().toLowerCase()
  if (funcStr.includes('easeinout')) return 'ease-in-out'
  if (funcStr.includes('easein')) return 'ease-in'
  if (funcStr.includes('easeout')) return 'ease-out'
  if (funcStr.includes('discrete')) return 'discrete'

  return 'linear' // Default if no match found
}
