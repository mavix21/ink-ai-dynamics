// Button gesture detection
//
// Detects a rectangle (1-4 strokes) followed by text strokes drawn inside it.
// Similar approach to rectangleXDetection but instead of X strokes we look for
// handwriting strokes contained within the rectangle bounds.

import type { Stroke } from '../types/brush';
import type { Offset, BoundingBox } from '../types/primitives';
import { boundingBoxFromOffsets } from '../types/primitives';
import { extractFeatures, classifyShapeWithAlternatives } from './shapeRecognition';
import type { Element } from '../types';
import type { ShapeElement } from '../elements/shape/types';
import { getElementBounds } from '../elements/rendering/ElementRenderer';
import { debugLog } from '../debug/DebugLogger';

export interface ButtonDetectionResult {
  rectangleStrokes: Stroke[];
  textStrokes: Stroke[];
  rectangleBounds: BoundingBox;
  allStrokes: Stroke[];
  anchorPoint: Offset;
  existingRectElementId?: string;
}

/** Minimum confidence for rectangle classification (relaxed — user confirms via menu). */
const MIN_RECT_CONFIDENCE = 0.45;

/** Minimum aspect ratio (width/height) — buttons are wider than tall. */
const MIN_ASPECT_RATIO = 1.2;

/** Fraction of text-stroke points that must fall inside the rectangle. */
const MIN_CONTAINMENT_RATIO = 0.4;

/** Compute bounding box from strokes. */
function computeStrokeBounds(strokes: Stroke[]): BoundingBox | null {
  const points: Offset[] = [];
  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      points.push({ x: input.x, y: input.y });
    }
  }
  return boundingBoxFromOffsets(points);
}

/** Check what fraction of a stroke's points fall inside bounds (with tolerance). */
function containmentRatio(strokes: Stroke[], bounds: BoundingBox, tolerance: number): number {
  let inside = 0;
  let total = 0;
  for (const stroke of strokes) {
    for (const input of stroke.inputs.inputs) {
      total++;
      if (
        input.x >= bounds.left - tolerance &&
        input.x <= bounds.right + tolerance &&
        input.y >= bounds.top - tolerance &&
        input.y <= bounds.bottom + tolerance
      ) {
        inside++;
      }
    }
  }
  return total === 0 ? 0 : inside / total;
}

/**
 * Detect a button drawing from an array of strokes.
 *
 * Algorithm (mirrors detectRectangleX):
 * 1. Need 2–8 strokes total. Try splitting: first 1–4 as rectangle, rest as text.
 * 2. Rectangle validation: classify as rectangle with confidence >= 0.65,
 *    aspect ratio >= 1.5 (wider than tall).
 * 3. Text validation: remaining strokes mostly contained inside the rectangle.
 */
export function detectButton(strokes: Stroke[]): ButtonDetectionResult | null {
  if (strokes.length < 2 || strokes.length > 20) {
    return null;
  }

  // Try different splits: first N strokes as rectangle, rest as text
  // Try from more rect strokes to fewer (prefer larger rectangles)
  const maxRectStrokes = Math.min(4, strokes.length - 1);

  for (let rectCount = maxRectStrokes; rectCount >= 1; rectCount--) {
    const rectStrokes = strokes.slice(0, rectCount);
    const textStrokes = strokes.slice(rectCount);

    if (textStrokes.length < 1) continue;

    // Validate rectangle
    const features = extractFeatures(rectStrokes);
    if (!features) continue;

    const candidates = classifyShapeWithAlternatives(features);
    const rectCandidate = candidates.find(c => c.shape === 'rectangle');

    if (!rectCandidate || rectCandidate.confidence < MIN_RECT_CONFIDENCE) {
      continue;
    }

    const rectBounds = computeStrokeBounds(rectStrokes);
    if (!rectBounds) continue;

    // Check aspect ratio — must be horizontal
    const width = rectBounds.right - rectBounds.left;
    const height = rectBounds.bottom - rectBounds.top;
    if (height <= 0 || width / height < MIN_ASPECT_RATIO) {
      debugLog.info('[Button] REJECTED - not horizontal enough', {
        aspect: height > 0 ? (width / height).toFixed(2) : 'inf',
        required: MIN_ASPECT_RATIO,
      });
      continue;
    }

    // Check that text strokes are inside the rectangle
    const tolerance = Math.min(width, height) * 0.2;
    const ratio = containmentRatio(textStrokes, rectBounds, tolerance);

    if (ratio < MIN_CONTAINMENT_RATIO) {
      debugLog.info('[Button] REJECTED - text strokes not inside rectangle', {
        containment: ratio.toFixed(2),
        required: MIN_CONTAINMENT_RATIO,
      });
      continue;
    }

    debugLog.info('[Button] SUCCESS - button gesture detected', {
      rectStrokes: rectCount,
      textStrokes: textStrokes.length,
      rectBounds,
      containment: ratio.toFixed(2),
      rectConfidence: rectCandidate.confidence.toFixed(2),
    });

    const allStrokes = [...rectStrokes, ...textStrokes];
    const anchorPoint: Offset = {
      x: (rectBounds.left + rectBounds.right) / 2,
      y: rectBounds.top,
    };

    return {
      rectangleStrokes: rectStrokes,
      textStrokes,
      rectangleBounds: rectBounds,
      allStrokes,
      anchorPoint,
    };
  }

  return null;
}

/**
 * Detect a button by checking if pending strokes are text inside an existing
 * rectangle ShapeElement on the canvas. This handles the common case where the
 * rectangle was already consumed as a ShapeElement before text strokes arrived.
 */
export function detectButtonFromExistingRect(
  elements: Element[],
  textStrokes: Stroke[],
): ButtonDetectionResult | null {
  if (textStrokes.length < 1) return null;

  // Find rectangle-shaped elements
  const rectElements = elements.filter(
    (el): el is ShapeElement => el.type === 'shape'
  );

  for (const rectEl of rectElements) {
    const bounds = getElementBounds(rectEl);
    if (!bounds) continue;

    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (height <= 0 || width / height < MIN_ASPECT_RATIO) continue;

    // Check if text strokes are inside this rectangle
    const tolerance = Math.min(width, height) * 0.25;
    const ratio = containmentRatio(textStrokes, bounds, tolerance);

    if (ratio < MIN_CONTAINMENT_RATIO) continue;

    debugLog.info('[Button] SUCCESS via existing rect element', {
      rectElementId: rectEl.id,
      textStrokes: textStrokes.length,
      containment: ratio.toFixed(2),
    });

    const anchorPoint: Offset = {
      x: (bounds.left + bounds.right) / 2,
      y: bounds.top,
    };

    return {
      rectangleStrokes: rectEl.sourceStrokes ?? [],
      textStrokes,
      rectangleBounds: bounds,
      allStrokes: [...(rectEl.sourceStrokes ?? []), ...textStrokes],
      anchorPoint,
      existingRectElementId: rectEl.id,
    };
  }

  return null;
}
