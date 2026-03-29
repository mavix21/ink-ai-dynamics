// ComponentIntent — represents a pending "turn sketch into component" menu
// triggered when a drawing looks like it could be an interactive component.

import type { Offset, BoundingBox } from '../types/primitives';
import type { Stroke } from '../types/brush';
import type { ButtonDetectionResult } from '../geometry/buttonDetection';

export type ComponentKind = 'button';

export interface ComponentEntry {
  kind: ComponentKind;
  label: string;
}

export interface ComponentIntent {
  entries: ComponentEntry[];
  rectangleBounds: BoundingBox;
  anchorPoint: Offset;
  pendingStrokes: Stroke[];
  textStrokes: Stroke[];
  existingRectElementId?: string;
  createdAt: number;
}

export type ComponentAction = 'select' | 'dismiss';

const AVAILABLE_ENTRIES: ComponentEntry[] = [
  { kind: 'button', label: 'Button' },
];

export function createComponentIntent(result: ButtonDetectionResult): ComponentIntent {
  return {
    entries: AVAILABLE_ENTRIES,
    rectangleBounds: result.rectangleBounds,
    anchorPoint: result.anchorPoint,
    pendingStrokes: [...result.allStrokes],
    textStrokes: [...result.textStrokes],
    existingRectElementId: result.existingRectElementId,
    createdAt: Date.now(),
  };
}
