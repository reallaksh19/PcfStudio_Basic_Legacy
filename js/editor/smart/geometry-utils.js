/**
 * geometry-utils.js — Pure geometry calculations
 * Plug-and-play module - no external dependencies except THREE
 */

import * as THREE from 'three';

/**
 * Calculate distance between two points
 */
export function distance3D(p1, p2) {
    const [x1, y1, z1] = Array.isArray(p1) ? p1 : [p1.x, p1.y, p1.z];
    const [x2, y2, z2] = Array.isArray(p2) ? p2 : [p2.x, p2.y, p2.z];
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2 + (z2-z1)**2);
}

/**
 * Convert point to THREE.Vector3
 */
export function toVector3(p) {
    if (p instanceof THREE.Vector3) return p;
    if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
    return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

/**
 * Calculate midpoint between two points
 */
export function midpoint(p1, p2) {
    const v1 = toVector3(p1);
    const v2 = toVector3(p2);
    return v1.clone().lerp(v2, 0.5).toArray();
}

/**
 * Calculate closest distance between two line segments
 */
export function segmentDistance(seg1Start, seg1End, seg2Start, seg2End) {
    const line1 = new THREE.Line3(toVector3(seg1Start), toVector3(seg1End));
    const line2 = new THREE.Line3(toVector3(seg2Start), toVector3(seg2End));

    const closest1 = new THREE.Vector3();
    const closest2 = new THREE.Vector3();

    line1.closestPointToPoint(toVector3(seg2Start), true, closest1);
    line2.closestPointToPoint(toVector3(seg1Start), true, closest2);

    return {
        distance: closest1.distanceTo(closest2),
        point1: closest1.toArray(),
        point2: closest2.toArray()
    };
}

/**
 * Get major axis direction between two points
 */
export function getMajorAxis(p1, p2) {
    const v1 = toVector3(p1);
    const v2 = toVector3(p2);
    const delta = v2.clone().sub(v1);

    const absX = Math.abs(delta.x);
    const absY = Math.abs(delta.y);
    const absZ = Math.abs(delta.z);

    if (absX >= absY && absX >= absZ) return 'X';
    if (absY >= absZ) return 'Y';
    return 'Z';
}

/**
 * Check if two directions are same (within tolerance)
 */
export function isSameDirection(p1, p2, p3, p4, angleTolerance = 5) {
    const v1 = toVector3(p2).sub(toVector3(p1)).normalize();
    const v2 = toVector3(p4).sub(toVector3(p3)).normalize();
    const angle = Math.acos(v1.dot(v2)) * (180 / Math.PI);
    return angle < angleTolerance || angle > (180 - angleTolerance);
}

/**
 * Calculate intersection point for elbow placement
 */
export function calculateElbowPosition(p1, p2, axis) {
    const v1 = toVector3(p1);
    const v2 = toVector3(p2);
    const result = v1.clone();

    if (axis === 'X') result.x = v2.x;
    else if (axis === 'Y') result.y = v2.y;
    else result.z = v2.z;

    return result.toArray();
}

/**
 * Round coordinates for comparison
 */
export function roundCoord(p, precision = 0) {
    const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
    return [
        Math.round(x / (precision || 1)) * (precision || 1),
        Math.round(y / (precision || 1)) * (precision || 1),
        Math.round(z / (precision || 1)) * (precision || 1)
    ];
}
