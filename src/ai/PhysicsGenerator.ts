// PhysicsGenerator — uses LLM to generate a self-contained HTML physics
// simulation from a canvas snapshot of the user's drawing.

import { chatCompletion } from './OpenRouterService';

export interface PhysicsSimResult {
  html: string;
  title: string;
}

const SYSTEM_PROMPT = `You are a physics simulation generator. Given a hand-drawn sketch, generate a self-contained HTML page that simulates the depicted physics concept.

LAYOUT RULES (MANDATORY — violations are unacceptable):
1. Use a SINGLE <canvas> element that fills 100% of the viewport (width and height).
   html, body { margin:0; padding:0; overflow:hidden; background:#1a1a2e; }
   canvas { display:block; width:100vw; height:100vh; }
2. DO NOT use sidebars, panels, or any element that reduces the canvas area.
3. ALL UI controls must be FLOATING overlays with position:fixed, on top of the canvas:
   - Title: top-left corner, small semi-transparent label (font-size:13px, background:rgba(0,0,0,0.5), padding:4px 10px, border-radius:4px, color:white).
   - Parameter sliders: bottom-left corner, compact vertical stack, max-width:180px, background:rgba(0,0,0,0.6), border-radius:8px, padding:8px, font-size:11px, color:white. Use range inputs.
   - Play/Pause + Reset buttons: bottom-right corner, two small styled buttons (background:rgba(0,0,0,0.6), color:white, border:1px solid rgba(255,255,255,0.2), border-radius:6px, padding:6px 14px, cursor:pointer, font-size:12px).
4. Center physics objects in the canvas. Leave generous margins from all edges (at least 15% from each side).

PHYSICS RULES (MANDATORY):
1. Gravity = 9.8 m/s², always pulling downward. Objects MUST fall/slide under gravity by default.
2. If no force arrows are drawn on an object, only gravity acts on it. Friction should default to a small value (μ=0.1) so motion is visible.
3. For ramps/inclined planes: the block MUST slide DOWN the ramp under gravity. Decompose gravity into components parallel and perpendicular to the surface. The net force = mg·sin(θ) - μ·mg·cos(θ). If net > 0, block accelerates down.
4. For pendulums: start with the bob displaced and let it swing. Allow dragging the bob.
5. For pulleys: animate the heavier mass descending.
6. For springs: show oscillation with the correct period.

ANIMATION RULES (MANDATORY):
1. The simulation MUST start PAUSED so users can see the initial state.
2. Clicking "Play" starts the simulation. Clicking "Pause" pauses it. Clicking "Reset" returns everything to initial state and pauses.
3. Use requestAnimationFrame with a fixed physics timestep (dt = 1/60).
4. Draw ALL objects every frame: ramps, blocks, forces, ground, etc.

DRAWING RULES (MANDATORY — objects must be VISIBLE):
1. SURFACES (ramps, ground, walls): Draw as FILLED polygons, not just lines.
   - Ramps/inclined planes: draw as a FILLED TRIANGLE using ctx.fill() with color #4ECDC4, PLUS a 3px stroke outline in #3DBDB4. The triangle vertices are: bottom-left corner, bottom-right corner, and top-of-ramp point.
   - Ground: draw a horizontal line at the base of the ramp, spanning the full canvas width, with lineWidth=3 and color #4ECDC4.
2. OBJECTS (blocks, bobs, masses): Draw as filled rectangles or circles with color #FF6B6B and a 2px stroke outline in #E05555. Blocks should be at least 30×30 pixels.
3. FORCE ARROWS: Draw with lineWidth=2 and arrowheads. Color #FFE66D. Label each arrow.
4. ROPES/STRINGS: Draw with lineWidth=2 and color #95E1D3.
5. BACKGROUND: Always #1a1a2e. Clear the entire canvas each frame before redrawing.
6. All shapes must contrast strongly against the dark background. NEVER use colors close to #1a1a2e for any visible object.

CODE QUALITY:
- Single HTML file, ALL CSS and JS inline. No external dependencies.
- The canvas size must be set to window.innerWidth × window.innerHeight and handle resize events.
- Clean, well-commented JavaScript.

RESPONSE FORMAT:
Return ONLY raw JSON (no markdown, no code fences):
{"html": "<full html document starting with <!DOCTYPE html>>", "title": "Short description"}`;

/**
 * Capture a region of the canvas as a base64 PNG data URL.
 */
export function captureCanvasRegion(
  canvas: HTMLCanvasElement,
  bounds: { left: number; top: number; right: number; bottom: number },
  viewport: { panX: number; panY: number; zoom: number },
): string {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;

  // Convert canvas-space bounds to screen-space for capture
  const screenLeft = bounds.left * viewport.zoom + viewport.panX;
  const screenTop = bounds.top * viewport.zoom + viewport.panY;
  const screenWidth = width * viewport.zoom;
  const screenHeight = height * viewport.zoom;

  // Create temp canvas to crop
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.max(1, Math.round(screenWidth));
  tempCanvas.height = Math.max(1, Math.round(screenHeight));

  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(
    canvas,
    Math.round(screenLeft),
    Math.round(screenTop),
    Math.round(screenWidth),
    Math.round(screenHeight),
    0,
    0,
    tempCanvas.width,
    tempCanvas.height,
  );

  return tempCanvas.toDataURL('image/png');
}

/**
 * Generate a physics simulation from a canvas snapshot via LLM.
 *
 * @param snapshotDataUrl - Base64 PNG data URL of the drawing region
 * @param width - Target width in pixels for the simulation
 * @param height - Target height in pixels for the simulation
 * @returns The generated HTML and title
 */
export async function generatePhysicsSim(
  snapshotDataUrl: string,
  width: number,
  height: number,
): Promise<PhysicsSimResult> {
  // The OpenRouter SDK validates with camelCase property names (imageUrl, not
  // image_url). We bypass our ChatMessage type and cast directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Here is a hand-drawn physics sketch. Generate an interactive physics simulation that fits within ${Math.round(width)}×${Math.round(height)} pixels. Identify what physics concept is drawn and simulate it accurately.`,
        },
        {
          type: 'image_url',
          imageUrl: { url: snapshotDataUrl },
        },
      ],
    },
  ];

  const raw = await chatCompletion(messages, {
    model: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 16384,
  });

  // Parse the JSON response — handle potential markdown fences
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned) as PhysicsSimResult;
    if (!parsed.html || !parsed.title) {
      throw new Error('Missing html or title in response');
    }
    return parsed;
  } catch (err) {
    // Fallback: try to extract HTML from the raw response
    const htmlMatch = raw.match(/<(!DOCTYPE|html)[^]*<\/html>/i);
    if (htmlMatch) {
      return {
        html: htmlMatch[0],
        title: 'Physics Simulation',
      };
    }
    throw new Error(`Failed to parse LLM response: ${err}`);
  }
}
