/**
 * Represents a color with RGBA components.
 */
export interface RGBAColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

/**
 * Parses a CSS color string into an RGBAColor object.
 * Handles hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA), rgb(), and rgba().
 * Returns null if parsing fails.
 */
export function parseColor(colorString: string): RGBAColor | null {
  if (!colorString) return null

  colorString = colorString.trim().toLowerCase()

  // Hex formats
  if (colorString.startsWith('#')) {
    let hex = colorString.substring(1)
    let r = 0, g = 0, b = 0, a = 1

    if (hex.length === 3 || hex.length === 4) { // #RGB or #RGBA
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
      if (hex.length === 4) {
        a = parseInt(hex[3] + hex[3], 16) / 255
      }
    } else if (hex.length === 6 || hex.length === 8) { // #RRGGBB or #RRGGBBAA
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
      if (hex.length === 8) {
        a = parseInt(hex.substring(6, 8), 16) / 255
      }
    } else {
      return null // Invalid hex length
    }
    return { r, g, b, a }
  }

  // rgb() or rgba() formats
  const match = colorString.match(/^(rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (match) {
    const r = parseInt(match[2], 10)
    const g = parseInt(match[3], 10)
    const b = parseInt(match[4], 10)
    let a = 1
    if (match[1] === 'rgba' && match[5] !== undefined) {
      a = parseFloat(match[5])
    }
    // Basic validation
    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 && a >= 0 && a <= 1) {
      return { r, g, b, a }
    }
  }

  // TODO: Handle named colors? For now, return null for unhandled formats.
  console.warn(`Could not parse color string: "${colorString}"`)
  return null
}

/**
 * Formats an RGBAColor object into an "rgba(r, g, b, a)" string.
 */
export function formatColor(color: RGBAColor): string {
  // Clamp values just in case
  const r = Math.round(Math.max(0, Math.min(255, color.r)))
  const g = Math.round(Math.max(0, Math.min(255, color.g)))
  const b = Math.round(Math.max(0, Math.min(255, color.b)))
  const a = Math.max(0, Math.min(1, color.a))
  // Use toFixed to limit alpha precision if needed, e.g., a.toFixed(3)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/**
 * Linearly interpolates between two colors.
 * @param colorA - The starting color string.
 * @param colorB - The ending color string.
 * @param factor - The interpolation factor (0 = colorA, 1 = colorB).
 * @returns The interpolated color as an rgba string, or colorA if parsing fails.
 */
export function interpolateColor(colorA: string, colorB: string, factor: number): string {
  const parsedA = parseColor(colorA)
  const parsedB = parseColor(colorB)

  if (!parsedA || !parsedB) {
    // Fallback: return the starting color if parsing fails
    console.warn(`Color interpolation failed: Could not parse "${colorA}" or "${colorB}"`)
    return colorA
  }

  // Clamp factor
  factor = Math.max(0, Math.min(1, factor))

  const r = parsedA.r + (parsedB.r - parsedA.r) * factor
  const g = parsedA.g + (parsedB.g - parsedA.g) * factor
  const b = parsedA.b + (parsedB.b - parsedA.b) * factor
  const a = parsedA.a + (parsedB.a - parsedA.a) * factor

  return formatColor({ r, g, b, a })
}
