// Physics enclosure detection
//
// Detects when a drawn circle encloses existing canvas elements,
// triggering the "simulate physics" flow.

import type { Stroke } from '../types/brush';
import type { Offset, BoundingBox } from '../types/primitives';
import type { Element } from '../types';
import { extractFeatures, classifyShapeWithAlternatives } from './shapeRecognition';
import { getElementBounds } from '../elements/rendering/ElementRenderer';
import { debugLog } from '../debug/DebugLogger';

export interface PhysicsEnclosureResult {
  /** Bounding box of the enclosing circle (in canvas space). */
  circleBounds: BoundingBox;
  /** Centroid + radius for the circle. */
  centroid: Offset;
  radius: number;
  /** IDs of elements enclosed by the circle. */
  enclosedElementIds: string[];
  /** Anchor point for menu positioning (top-center of circle). */
  anchorPoint: Offset;
  /** The stroke that forms the enclosing circle. */
  circleStroke: Stroke;
}

/** Minimum circle classification confidence. */
const MIN_CIRCLE_CONFIDENCE = 0.60;

/** Minimum fraction of an element's bbox area that must be inside the circle. */
const MIN_ELEMENT_OVERLAP = 0.50;

/** Minimum radius for the enclosing circle (in canvas px). */
const MIN_CIRCLE_RADIUS = 40;

/**
 * Check what fraction of a bounding box overlaps with a circle.
 * Uses a fast approximation: samples corners + center of the bbox.
 */
function elementOverlapWithCircle(
  bounds: BoundingBox,
  centroid: Offset,
  radius: number,
): number {
  // Sample 9 points across the bounding box
  const samplePoints: Offset[] = [];
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 2; j++) {
      samplePoints.push({
        x: bounds.left + (bounds.right - bounds.left) * (i / 2),
        y: bounds.top + (bounds.bottom - bounds.top) * (j / 2),
      });
    }
  }

  let inside = 0;
  for (const p of samplePoints) {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    if (dx * dx + dy * dy <= radius * radius) {
      inside++;
    }
  }

  return inside / samplePoints.length;
}

/**
 * Detect whether a single stroke is a circle that encloses existing elements.
 *
 * @param stroke - The candidate enclosing stroke (must be a single stroke).
 * @param existingElements - Current elements on the canvas.
 * @returns Detection result or null.
 */
export function detectPhysicsEnclosure(
  stroke: Stroke,
  existingElements: Element[],
): PhysicsEnclosureResult | null {
  // Need existing elements to enclose
  if (existingElements.length === 0) return null;

  // Classify the stroke as a shape
  const features = extractFeatures([stroke]);
  if (!features) return null;

  const candidates = classifyShapeWithAlternatives(features);
  const circleCandidate = candidates.find(c => c.shape === 'circle');

  if (!circleCandidate || circleCandidate.confidence < MIN_CIRCLE_CONFIDENCE) {
    debugLog.info('[PhysicsEnclosure] REJECTED - not a circle', {
      bestShape: candidates[0]?.shape ?? 'none',
      bestConfidence: candidates[0]?.confidence?.toFixed(2) ?? '0',
      circleConfidence: circleCandidate?.confidence?.toFixed(2) ?? 'N/A',
    });
    return null;
  }

  const centroid = features.centroid;
  const radius = features.averageRadius;

  if (radius < MIN_CIRCLE_RADIUS) {
    debugLog.info('[PhysicsEnclosure] REJECTED - circle too small', {
      radius: radius.toFixed(1),
      minRadius: MIN_CIRCLE_RADIUS,
    });
    return null;
  }

  // Find elements enclosed by this circle
  const enclosedIds: string[] = [];
  for (const el of existingElements) {
    // Skip stroke elements (temporary), only consider meaningful elements
    if (el.type === 'stroke') continue;

    const bounds = getElementBounds(el);
    if (!bounds) continue;

    const overlap = elementOverlapWithCircle(bounds, centroid, radius);
    if (overlap >= MIN_ELEMENT_OVERLAP) {
      enclosedIds.push(el.id);
    }
  }

  if (enclosedIds.length === 0) {
    debugLog.info('[PhysicsEnclosure] REJECTED - no elements enclosed', {
      centroid,
      radius: radius.toFixed(1),
      elementCount: existingElements.length,
    });
    return null;
  }

  debugLog.info('[PhysicsEnclosure] SUCCESS', {
    enclosedCount: enclosedIds.length,
    circleConfidence: circleCandidate.confidence.toFixed(2),
    centroid,
    radius: radius.toFixed(1),
  });

  const circleBounds: BoundingBox = {
    left: centroid.x - radius,
    top: centroid.y - radius,
    right: centroid.x + radius,
    bottom: centroid.y + radius,
  };

  return {
    circleBounds,
    centroid,
    radius,
    enclosedElementIds: enclosedIds,
    anchorPoint: { x: centroid.x, y: circleBounds.top },
    circleStroke: stroke,
  };
}
