/**
 * @tangentstorm/gestalt — player entry (Phase A)
 *
 * Registers Custom Elements for markup-driven SVG sketches + animations.
 * Does NOT include GsToolApp, editor tools/panels, tc-anim-bar/timeline, or treeLayout.
 */

// App host
import './app/GsApp'

// Scene + anim stack
import './components/GsSketch'
import './components/GsDefs'
import './components/GsAnim'
import './components/GsTrack'
import './components/GsMarker'

// Geometry shapes (no ToolApp / tc deps)
import './shapes/GsCircleShape'
import './shapes/GsEllipseShape'
import './shapes/GsRectShape'
import './shapes/GsLineShape'
import './shapes/GsTextShape'
import './shapes/GsPathShape'
import './shapes/GsPointShape'
import './shapes/GsGroup'
import './shapes/GsCurveShape'
import './shapes/GsEdgeShape'
import './shapes/GsNodeShape'
import './shapes/GsChevronShape'
import './shapes/GsRhombusShape'
import './shapes/GsHtmlShape'
import './shapes/GsCameraShape'

// Public re-exports for typed consumers
export { GsApp } from './app/GsApp'
export { GsSketch } from './components/GsSketch'
export { GsDefs } from './components/GsDefs'
export { GsAnim } from './components/GsAnim'
export { GsTrack } from './components/GsTrack'
export { GsMarker } from './components/GsMarker'
export { GsAnimator } from './components/GsAnimator'
export { GsShape, generateUUID } from './shapes/GsShape'
export type { Anim, Track, PropTrack, Keyframe, Marker, Easing } from './types/anim'
export { easingFunctionMap, getEasingName } from './types/anim'
export type { Point } from './types'
