// PhysicsOverlay — renders active physics simulations as positioned iframe
// overlays on top of the canvas, with shimmer loading state.
// Follows the same pattern as ArrowButtonOverlay.

import { useEffect, useRef } from 'react';
import type { BoundingBox } from '../types/primitives';
import type { Viewport } from '../canvas/ViewportManager';
import { canvasToScreen } from '../canvas/ViewportManager';

export interface PhysicsSimData {
  id: string;
  html: string;
  title: string;
  bounds: BoundingBox; // canvas-space
}

export interface PhysicsSimLoading {
  id: string;
  bounds: BoundingBox; // canvas-space
}

export interface PhysicsOverlayProps {
  sims: PhysicsSimData[];
  loading: PhysicsSimLoading[];
  viewport: Viewport;
  onRemoveSim?: (id: string) => void;
}

/* ---- Shimmer CSS (injected once) ---- */
const SHIMMER_STYLE_ID = 'physics-shimmer-style';

function injectShimmerStyle() {
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
@keyframes physics-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.physics-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.03) 25%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0.03) 75%
  );
  background-size: 200% 100%;
  animation: physics-shimmer 1.8s ease-in-out infinite;
}
`;
  document.head.appendChild(style);
}

export function PhysicsOverlay({ sims, loading, viewport, onRemoveSim }: PhysicsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Inject shimmer keyframes once
  useEffect(() => {
    injectShimmerStyle();
  }, []);

  // Compute screen-space positions for each sim/loading
  const computeScreenRect = (bounds: BoundingBox) => {
    const topLeft = canvasToScreen(viewport, { x: bounds.left, y: bounds.top });
    const w = (bounds.right - bounds.left) * viewport.zoom;
    const h = (bounds.bottom - bounds.top) * viewport.zoom;
    return { x: topLeft.x, y: topLeft.y, w, h };
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {/* Loading shimmers */}
      {loading.map((item) => {
        const rect = computeScreenRect(item.bounds);
        return (
          <div
            key={`loading-${item.id}`}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              borderRadius: '12px',
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {/* Dark base */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#1a1a2e',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
            {/* Shimmer sweep */}
            <div
              className="physics-shimmer"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '12px',
              }}
            />
            {/* Loading label */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {/* Spinner */}
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              >
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              <span
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '12px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  letterSpacing: '0.5px',
                }}
              >
                Generating simulation…
              </span>
            </div>
          </div>
        );
      })}

      {/* Active simulations */}
      {sims.map((sim) => {
        const rect = computeScreenRect(sim.bounds);
        return (
          <SimIframe
            key={sim.id}
            sim={sim}
            rect={rect}
            onRemove={onRemoveSim}
          />
        );
      })}
    </div>
  );
}

/* ---- Individual sim iframe with close button ---- */

interface SimIframeProps {
  sim: PhysicsSimData;
  rect: { x: number; y: number; w: number; h: number };
  onRemove?: (id: string) => void;
}

function SimIframe({ sim, rect, onRemove }: SimIframeProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: '12px',
        overflow: 'hidden',
        pointerEvents: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
      // Show close button on hover via CSS class
      className="physics-sim-wrapper"
    >
      <iframe
        srcDoc={sim.html}
        sandbox="allow-scripts"
        title={sim.title}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '12px',
          backgroundColor: '#1a1a2e',
        }}
      />
      {/* Close button */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(sim.id);
          }}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.6)',
            color: 'rgba(255,255,255,0.8)',
            fontSize: '14px',
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 150ms ease, background 150ms ease',
            zIndex: 51,
            padding: 0,
          }}
          className="physics-sim-close"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(220,50,50,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ---- Inject hover style for close button (once) ---- */
const HOVER_STYLE_ID = 'physics-sim-hover-style';

(() => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HOVER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOVER_STYLE_ID;
  style.textContent = `
.physics-sim-wrapper:hover .physics-sim-close {
  opacity: 1 !important;
  pointer-events: auto !important;
}
`;
  document.head.appendChild(style);
})();
