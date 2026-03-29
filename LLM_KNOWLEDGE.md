# LLM Knowledge Base — ink.ai Interactive Components

> Findings and architecture knowledge gathered while implementing interactive button detection and Arrow.js rendering. Written so another LLM can pick up from here.

---

## 1. High-Level Architecture

The app is a React-based ink/drawing canvas. Users draw strokes on an HTML `<canvas>`. Strokes are collected, debounced (~650ms), and processed through a pipeline that turns raw strokes into structured elements (shapes, text, images, etc.).

### Key files

| File | Role |
|------|------|
| `src/App.tsx` | Main component. Owns all state, stroke processing pipeline (`processStrokes`), and element management. |
| `src/canvas/InkCanvas.tsx` | Canvas rendering, viewport, overlays, menus. Receives everything via props from App. |
| `src/canvas/ViewportManager.ts` | Pan/zoom. `canvasToScreen()` and `screenToCanvas()` convert between coordinate systems. |
| `src/elements/registry/ElementRegistry.ts` | Plugin system for element creation. `tryCreateElementWithDisambiguation()` is the main entry point. |
| `src/geometry/shapeRecognition.ts` | `extractFeatures()` + `classifyShapeWithAlternatives()` — classifies strokes as shapes (rectangle, circle, etc.) with confidence scores. |
| `src/recognition/RecognitionService.ts` | Handwriting recognition via external API (`https://strokes.hack.ink.ai`). `getRecognitionService().recognizeGoogle(strokes)` returns `{ rawText }`. |
| `src/ai/OpenRouterService.ts` | LLM integration via OpenRouter. `chatCompletion()` and `chatCompletionJSON()` for AI features. |

---

## 2. Stroke Processing Pipeline

When the user finishes a stroke:

1. **`handleStrokeComplete`** — adds stroke to `strokeBufferRef` and `pendingStrokesRef`, resets debounce timer.
2. **Debounce (650ms)** — after no new strokes for 650ms, `processStrokes(batch)` is called.
3. **`processStrokes`** runs checks in order (first match wins, returns early):
   1. **`tryInteraction`** — checks if strokes interact with existing elements (e.g., drawing on a sketchable image).
   2. **`detectRectangleX`** — detects rectangle+X gesture → shows `PaletteMenu` (color palette, games, etc.).
   3. **`detectButton` / `detectButtonFromExistingRect`** — detects button-like drawing → shows `ComponentMenu`.
   4. **`tryCreateElementWithDisambiguation`** — general element creation (shapes, text, etc.). May show `DisambiguationMenu` if ambiguous.

**Critical insight**: Each detection step consumes strokes from `pendingStrokesRef` and returns early. If a detection fails, strokes fall through to the next step.

---

## 3. The Debounce Problem (Most Important Finding)

The **biggest obstacle** for button detection: the rectangle and text are usually drawn with a pause between them (>650ms). This means:

1. User draws rectangle → debounce fires → rectangle consumed as `ShapeElement` → removed from pending.
2. User draws text inside → debounce fires → text strokes arrive, but rectangle strokes are gone.

**Solution**: Two-strategy detection:
- **Strategy 1**: All strokes still in `pendingStrokesRef` (rect + text drawn within one debounce window).
- **Strategy 2** (fallback): Check if pending text strokes fall inside an *existing* rectangle `ShapeElement` already on the canvas (`detectButtonFromExistingRect`).

This pattern would apply to any future multi-stroke gesture detection where parts arrive in separate debounce windows.

---

## 4. Button Detection (`src/geometry/buttonDetection.ts`)

### `detectButton(strokes)`
- Needs 2–20 strokes.
- Tries splitting: first N strokes (1–4) as rectangle, rest as text.
- Rectangle validated via `extractFeatures()` + `classifyShapeWithAlternatives()` with confidence ≥ 0.45.
- Aspect ratio check: width/height ≥ 1.2 (horizontal rectangle).
- Containment check: ≥40% of text stroke points inside rectangle bounds (with 20% tolerance).

### `detectButtonFromExistingRect(elements, textStrokes)`
- Scans existing `ShapeElement`s (type === 'shape') on the canvas.
- Uses `getElementBounds()` from the element registry to get bounds.
- Same aspect ratio + containment checks.
- Returns `existingRectElementId` so the caller can remove the ShapeElement when confirming button creation.

### Thresholds (relaxed because user confirms via menu)
```ts
MIN_RECT_CONFIDENCE = 0.45   // rectangle classification confidence
MIN_ASPECT_RATIO = 1.2       // width/height ratio
MIN_CONTAINMENT_RATIO = 0.4  // fraction of text points inside rect
```

---

## 5. Context Menu Pattern

Three context menus follow the same pattern:

| Menu | Trigger | File |
|------|---------|------|
| `PaletteMenu` | Rectangle + X gesture | `src/palette/PaletteMenu.tsx` |
| `DisambiguationMenu` | Ambiguous element creation | `src/elements/disambiguation/DisambiguationMenu.tsx` |
| `ComponentMenu` | Button-like drawing | `src/interactive/ComponentMenu.tsx` |

### Pattern:
1. **Intent state** in App.tsx: `const [fooIntent, setFooIntent] = useState<FooIntent | null>(null)`
2. **Detection** sets the intent + adds strokes as a temporary `StrokeElement` (so they remain visible while menu shows).
3. **Props flow**: App → InkCanvas → Menu component. Each menu receives `intent`, `onAction`, and `canvasToScreen`.
4. **Menu positioning**: Uses `canvasToScreen(intent.anchorPoint)` to convert canvas coords to screen coords.
5. **Action handler** in App.tsx: On 'select', execute the action + remove temp strokes. On 'dismiss', keep strokes as-is.
6. **Cleanup**: Always `setFooIntent(null)` at the end.

### canvasToScreen wrapper
`InkCanvas.tsx` exposes a `canvasToScreenWrapper` callback that menus use for positioning:
```ts
const canvasToScreenWrapper = useCallback((point: { x: number; y: number }) => {
  return canvasToScreen(viewport, point);
}, [viewport]);
```

---

## 6. Arrow.js Integration

Arrow.js (`@arrow-js/core`) is used to render interactive buttons as DOM overlays on top of the canvas.

### Key file: `src/interactive/ArrowButtonOverlay.tsx`

This is a **React component** that manages **Arrow.js DOM elements** inside a ref-based container.

### How it works:
- React manages the lifecycle (mount/unmount) via `useEffect`.
- Arrow.js `html` tagged template creates the actual button DOM.
- Positions are updated every render cycle (not inside useEffect) to track viewport changes.

### Arrow.js gotchas:
1. **"Invalid HTML position" error**: Arrow.js's `html` template parser does NOT support reactive expressions (`${...}`) inside multiline style attributes or in certain attribute positions. **Fix**: Build style strings as plain JS variables, pass as a single `${styleVar}` expression.
2. **Single-line templates work best**: Collapsing the `html` template to a single `<button>...</button>` line avoids parser edge cases.
3. **Event handler types**: Use `(e: Event)` not `(e: MouseEvent)` for Arrow.js event handlers — the type system expects generic `Event`.
4. **No need for `reactive()`** if you handle state via direct DOM manipulation in event handlers (e.g., press effects via `e.currentTarget.style.transform`).

### Button data flow:
```
detectButton/detectButtonFromExistingRect → ComponentMenu shown
  → user clicks "Button"
    → recognizeGoogle(textStrokes) → get text
    → create ArrowButtonData { id, text, bounds }
    → setArrowButtons(prev => [...prev, btnData])
    → ArrowButtonOverlay renders it
```

### Button removal:
- Each wrapper gets a plain DOM `×` close button (not Arrow.js template — simpler).
- Hidden by default, fades in on wrapper hover.
- Calls `onRemoveButton(id)` → `setArrowButtons(prev => prev.filter(...))`.

---

## 7. Element System

Elements have a plugin-based architecture. Each element type registers itself:

| Type | Description | Key file |
|------|-------------|----------|
| `stroke` | Raw strokes (temporary, pre-recognition) | Part of core |
| `shape` | Recognized vector shapes (rectangle, circle, etc.) | `src/elements/shape/` |
| `inkText` | Recognized handwriting text | `src/elements/inktext/` |
| `sketchableImage` | AI-generated images from sketches | `src/elements/sketchableImage/` |
| `nonogram` | Nonogram puzzles | `src/elements/nonogram/` |
| `jigsaw` | Jigsaw puzzles | `src/elements/jigsaw/` |

### Important element properties:
- `element.id` — unique identifier
- `element.type` — discriminator string
- `element.sourceStrokes` — original strokes (on ShapeElement)
- `ShapeElement.paths` — vector paths for rendering
- `InkTextElement.lines[].tokens[].text` — recognized text content

### `getElementBounds(element)` — returns `BoundingBox { left, top, right, bottom }` for any element type via the registry.

---

## 8. Coordinate Systems

Two coordinate spaces:
- **Canvas space**: Where strokes and elements live. Persistent, independent of viewport.
- **Screen space**: Pixel coordinates on the user's screen. Changes with pan/zoom.

Conversion:
```ts
import { canvasToScreen, screenToCanvas } from './canvas/ViewportManager';

// Canvas → Screen (for positioning HTML overlays)
const screenPos = canvasToScreen(viewport, { x: canvasX, y: canvasY });

// Screen → Canvas (for interpreting user input)
const canvasPos = screenToCanvas(viewport, { x: screenX, y: screenY });
```

Viewport: `{ panX, panY, zoom }`. The formula is:
```
screenX = canvasX * zoom + panX
screenY = canvasY * zoom + panY
```

---

## 9. File Map for Interactive Components Feature

```
src/
├── geometry/
│   ├── buttonDetection.ts          # detectButton + detectButtonFromExistingRect
│   ├── rectangleXDetection.ts      # Reference: detectRectangleX (similar pattern)
│   └── shapeRecognition.ts         # extractFeatures, classifyShapeWithAlternatives
├── interactive/
│   ├── ArrowButtonOverlay.tsx       # React wrapper for Arrow.js button DOM
│   ├── ComponentIntent.ts           # Types + createComponentIntent factory
│   └── ComponentMenu.tsx            # "Make interactive..." context menu
├── palette/
│   ├── PaletteIntent.ts             # Reference: same pattern as ComponentIntent
│   └── PaletteMenu.tsx              # Reference: same pattern as ComponentMenu
├── recognition/
│   └── RecognitionService.ts        # getRecognitionService().recognizeGoogle()
├── App.tsx                          # processStrokes, handleComponentAction, state
└── canvas/
    ├── InkCanvas.tsx                # Renders everything, passes props to menus
    └── ViewportManager.ts           # Coordinate conversion
```

---

## 10. Common Pitfalls & Tips

1. **Don't add multiline templates to Arrow.js `html`**. Keep it single-line or build strings externally.
2. **Strokes get consumed quickly**. If your gesture spans multiple debounce windows, you must check both pending strokes AND existing elements.
3. **`currentNoteRef.current`** gives the latest state inside async callbacks (avoids stale closures from React state).
4. **Pre-existing lint errors** (not from this feature): `SketchableImageElement | NonogramElement | JigsawElement` cast warning in InkCanvas.tsx, `currentNoteRef.current = currentNote` ref-during-render warning in App.tsx. These are in the original codebase.
5. **`createStrokeElement(strokes)`** creates a temporary StrokeElement that keeps strokes visible while a menu is shown. Must be cleaned up in the action handler.
6. **The `processStrokes` order matters**. RectangleX check runs before button check. If a drawing matches both, rectangleX wins. This is intentional (rectangleX is more specific — it requires X strokes, not arbitrary text).
7. **Recognition service** at `https://strokes.hack.ink.ai` — `recognizeGoogle(strokes)` returns `{ rawText: string }`. Used for handwriting-to-text conversion.
8. **OpenRouter** for LLM features — API key via `import.meta.env.INK_OPENROUTER_API_KEY`.
