import { Point } from '../types';

/**
 * Calculates the distance between two points
 */
export function distance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Determines if a point is inside a rectangle defined by two corners
 */
export function pointInRect(point: Point, corner1: Point, corner2: Point): boolean {
    const minX = Math.min(corner1.x, corner2.x);
    const maxX = Math.max(corner1.x, corner2.x);
    const minY = Math.min(corner1.y, corner2.y);
    const maxY = Math.max(corner1.y, corner2.y);

    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}


export function truncatedLineBetweenRectangles(
    rect1: { corner1: Point, corner2: Point },
    rect2: { corner1: Point, corner2: Point }
): { start: Point, end: Point } {
    const getBox = (rect: { corner1: Point, corner2: Point }) => ({
        min: { x: Math.min(rect.corner1.x, rect.corner2.x), y: Math.min(rect.corner1.y, rect.corner2.y) },
        max: { x: Math.max(rect.corner1.x, rect.corner2.x), y: Math.max(rect.corner1.y, rect.corner2.y) }
    });

    const box1 = getBox(rect1);
    const box2 = getBox(rect2);

    const getCenter = (box: { min: Point, max: Point }): Point => ({
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.y + box.max.y) / 2
    });

    const center1 = getCenter(box1);
    const center2 = getCenter(box2);

    const getIntersection = (center: Point, direction: Point, box: { min: Point, max: Point }): Point => {
        const tCandidates: number[] = [];

        if (direction.x > 0) {
            tCandidates.push((box.max.x - center.x) / direction.x);
        } else if (direction.x < 0) {
            tCandidates.push((box.min.x - center.x) / direction.x);
        }
        if (direction.y > 0) {
            tCandidates.push((box.max.y - center.y) / direction.y);
        } else if (direction.y < 0) {
            tCandidates.push((box.min.y - center.y) / direction.y);
        }

        const t = Math.min(...tCandidates.filter(val => val > 0));
        return { x: center.x + direction.x * t, y: center.y + direction.y * t };
    };

    const d1 = { x: center2.x - center1.x, y: center2.y - center1.y };
    const d2 = { x: center1.x - center2.x, y: center1.y - center2.y };

    const start = getIntersection(center1, d1, box1);
    const end = getIntersection(center2, d2, box2);

    return { start, end };
}


export function nearestPointOnRect(point: Point, corner1: Point, corner2: Point): Point {
    const minX = Math.min(corner1.x, corner2.x);
    const maxX = Math.max(corner1.x, corner2.x);
    const minY = Math.min(corner1.y, corner2.y);
    const maxY = Math.max(corner1.y, corner2.y);
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
        return {
            x: Math.max(minX, Math.min(point.x, maxX)),
            y: Math.max(minY, Math.min(point.y, maxY))
        };
    }
    const distLeft = point.x - minX;
    const distRight = maxX - point.x;
    const distTop = point.y - minY;
    const distBottom = maxY - point.y;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    if (minDist === distLeft) {
        return { x: minX, y: point.y };
    } else if (minDist === distRight) {
        return { x: maxX, y: point.y };
    } else if (minDist === distTop) {
        return { x: point.x, y: minY };
    } else {
        return { x: point.x, y: maxY };
    }
}

/**
 * Determines if a point is near a line segment
 */
export function pointNearLine(point: Point, lineStart: Point, lineEnd: Point, threshold: number = 5): boolean {
    // Calculate line length squared
    const lengthSquared = Math.pow(lineEnd.x - lineStart.x, 2) + Math.pow(lineEnd.y - lineStart.y, 2);

    // If line is a point, just calculate distance to that point
    if (lengthSquared === 0) {
        return distance(point, lineStart) <= threshold;
    }

    // Calculate projection of point onto line
    const t = ((point.x - lineStart.x) * (lineEnd.x - lineStart.x) +
              (point.y - lineStart.y) * (lineEnd.y - lineStart.y)) / lengthSquared;

    // Calculate closest point on line
    let closestX, closestY;

    if (t < 0) {
        closestX = lineStart.x;
        closestY = lineStart.y;
    } else if (t > 1) {
        closestX = lineEnd.x;
        closestY = lineEnd.y;
    } else {
        closestX = lineStart.x + t * (lineEnd.x - lineStart.x);
        closestY = lineStart.y + t * (lineEnd.y - lineStart.y);
    }

    // Calculate distance to closest point
    const pointDistance = Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));

    return pointDistance <= threshold;
}

/**
 * Determines if a point is near a circle's perimeter
 */
export function pointNearCircleEdge(point: Point, center: Point, radius: number, threshold: number = 5): boolean {
    const dist = distance(point, center);
    return Math.abs(dist - radius) <= threshold;
}

/**
 * Creates a circle that passes through three points
 */
export function circleFromThreePoints(p1: Point, p2: Point, p3: Point): { center: Point, radius: number } | null {
    // Check if points are collinear (would result in division by zero)
    const collinearCheck = p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y);
    if (Math.abs(collinearCheck) < 1e-10) {
        return null; // Points are collinear
    }

    // Calculate perpendicular bisectors
    const x12 = p1.x - p2.x;
    const y12 = p1.y - p2.y;
    const x13 = p1.x - p3.x;
    const y13 = p1.y - p3.y;

    const a = ((p1.x * p1.x + p1.y * p1.y) - (p2.x * p2.x + p2.y * p2.y)) / 2;
    const b = ((p1.x * p1.x + p1.y * p1.y) - (p3.x * p3.x + p3.y * p3.y)) / 2;

    // Calculate the center of the circle
    const cx = (a * (p1.y - p3.y) - b * (p1.y - p2.y)) / (x12 * (p1.y - p3.y) - x13 * (p1.y - p2.y));
    const cy = (a * x13 - b * x12) / (y12 * x13 - y13 * x12);

    // Calculate the radius
    const radius = Math.sqrt(Math.pow(cx - p1.x, 2) + Math.pow(cy - p1.y, 2));

    return {
        center: { x: cx, y: cy },
        radius
    };
}

/**
 * Calculate bounding box of multiple points
 */
export function getBoundingBox(points: Point[]): { min: Point, max: Point } | null {
    if (points.length === 0) return null;

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (let i = 1; i < points.length; i++) {
        minX = Math.min(minX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxX = Math.max(maxX, points[i].x);
        maxY = Math.max(maxY, points[i].y);
    }

    return {
        min: { x: minX, y: minY },
        max: { x: maxX, y: maxY }
    };
}