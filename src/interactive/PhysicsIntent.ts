// PhysicsIntent — represents a pending "simulate physics" menu
// triggered when a circle encloses physics-related drawings.

import type { Offset, BoundingBox } from '../types/primitives';
import type { Stroke } from '../types/brush';
import type { PhysicsEnclosureResult } from '../geometry/physicsDetection';

export interface PhysicsIntent {
  circleBounds: BoundingBox;
  centroid: Offset;
  radius: number;
  enclosedElementIds: string[];
  anchorPoint: Offset;
  circleStroke: Stroke;
  createdAt: number;
}

export type PhysicsAction = 'simulate' | 'dismiss';

/** Data for an active physics simulation overlay. */
export interface PhysicsSimData {
  id: string;
  html: string;
  title: string;
  bounds: BoundingBox; // canvas-space
}

/** A simulation that is currently loading (LLM generating). */
export interface PhysicsSimLoading {
  id: string;
  bounds: BoundingBox; // canvas-space — used to position shimmer
}

export function createPhysicsIntent(result: PhysicsEnclosureResult): PhysicsIntent {
  return {
    circleBounds: result.circleBounds,
    centroid: result.centroid,
    radius: result.radius,
    enclosedElementIds: [...result.enclosedElementIds],
    anchorPoint: result.anchorPoint,
    circleStroke: result.circleStroke,
    createdAt: Date.now(),
  };
}
